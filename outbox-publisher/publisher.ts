// src/publisher.ts

import { db } from "./connectors/db"
import { publishToQueue } from "./rabbitmq.service"
import { withLogContext } from "./lib/log-context"
import { taskDuration, taskCounter, taskErrorCounter } from "./lib/metrics"

const log = withLogContext({ service: "outbox-publisher" })

export async function publishOutbox(type: string) {
  const end = taskDuration.startTimer()
  const pending = await db
    .table("Outbox")
    .where("status", "pending")
    .where({ eventType: type })
    .limit(20)
    .orderBy("createdAt", "asc")

  for (const entry of pending) {
    const routingKey = entry.eventType
    const context = log.child({ taskId: entry.taskId, traceId: entry.traceId })

    context.info(`🔁 Publishing ${entry.taskId}`)
    try {
      await publishToQueue(routingKey, entry.payload)

      await db.table("Outbox").where("id", entry.id).update({
        status: "dispatched",
        dispatchedAt: new Date(),
      })

      taskCounter.labels(routingKey).inc()
      context.info(`✅ Dispatched task ${entry.taskId}`)
    } catch (err) {
      taskErrorCounter.inc()
      context.error({ err }, `❌ Failed to publish ${entry.id}`)
    } finally {
      end()
    }
  }
}
