import { Request, Response, NextFunction } from "express"
import { v4 as uuidv4 } from "uuid"
import { SUPPORTED_TASK_TYPES } from "../../config"
import { TaskMessage } from "../../types/task.types"
import createError from "http-errors"
import { db, dbCircuitBreaker } from "../../lib/db.lib"
import { Knex } from "knex"
import { withLogContext } from "../../lib/log-context"
import { taskCounter, taskDuration, taskErrorCounter } from "../../lib/metrics"

const log = withLogContext({ service: "gateway-node" })

export class TaskController {
  async createTask(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const end = taskDuration.startTimer()

    const { type, payload } = req.body
    const userId = req.user.id
    const taskId = uuidv4()
    const traceId = uuidv4()
    const context = log.child({ traceId, taskId })

    context.info("🔁 Creating new task")

    try {
      if (!type || !payload)
        throw createError(400, "type and payload are required")
      if (!SUPPORTED_TASK_TYPES.includes(type))
        throw createError(400, `Unsupported task type: ${type}`)
      if (!req.user) throw createError(401, "Unauthorized")

      const task: TaskMessage = {
        id: taskId,
        type,
        userId,
        payload,
        createdAt: new Date().toISOString(),
        traceId,
      }

      await dbCircuitBreaker.execute(() =>
        db.transaction(async (trx: Knex.Transaction) => {
          await trx.table("Task").insert({
            id: taskId,
            type,
            userId,
            payload,
          })

          await trx.table("Outbox").insert({
            eventType: type,
            payload: task,
            taskId,
          })
        })
      )

      context.info("✅ Task created and added to outbox")
      taskCounter.labels(type).inc()

      res.status(202).json({
        success: true,
        taskId: task.id,
        message: "Task created and queued for dispatch.",
      })
    } catch (err) {
      taskErrorCounter.inc()
      context.error({ err }, "❌ Failed to create task")
      next(err)
    } finally {
      end()
    }
  }
}

export default new TaskController()
