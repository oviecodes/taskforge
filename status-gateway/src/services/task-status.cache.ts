import Redis from "ioredis"
import dotenv from "dotenv"
import { TaskStatusUpdate } from "../types"

dotenv.config()
const redis = new Redis(process.env.REDIS_URL!)

const STATUS_TTL = 60 * 60 // 1 hour

export class TaskStatusCache {
  async setStatus(taskId: string, status: TaskStatusUpdate): Promise<void> {
    await redis.set(
      `task:${taskId}:last-status`,
      JSON.stringify(status),
      "EX",
      STATUS_TTL
    )
  }

  async getStatus(taskId: string): Promise<TaskStatusUpdate | null> {
    const json = await redis.get(`task:${taskId}:last-status`)
    return json ? JSON.parse(json) : null
  }

  async clearStatus(taskId: string): Promise<void> {
    await redis.del(`task:${taskId}:last-status`)
  }
}
