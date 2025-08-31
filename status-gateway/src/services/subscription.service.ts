import Redis from "ioredis"
import dotenv from "dotenv"

dotenv.config()
const redis = new Redis(process.env.REDIS_URL!)

export class SubscriptionService {
  private prefix = "task"

  /**
   * Add a user to a task’s subscription list
   */
  async addSubscriber(taskId: string, userId: string): Promise<void> {
    await redis.sadd(`${this.prefix}:${taskId}:subscribers`, userId)
  }

  /**
   * Remove a user from a task’s subscription list
   */
  async removeSubscriber(taskId: string, userId: string): Promise<void> {
    await redis.srem(`${this.prefix}:${taskId}:subscribers`, userId)
  }

  /**
   * Get all user IDs subscribed to a task
   */
  async getSubscribers(taskId: string): Promise<string[]> {
    return await redis.smembers(`${this.prefix}:${taskId}:subscribers`)
  }

  /**
   * Remove all subscribers from a task
   */
  async clearTask(taskId: string): Promise<void> {
    await redis.del(`${this.prefix}:${taskId}:subscribers`)
  }

  /**
   * Optional: Get all tasks a user is subscribed to
   */
  async getUserTasks(userId: string): Promise<string[]> {
    const keys = await redis.keys(`${this.prefix}:*:subscribers`)
    const matchingTasks: string[] = []

    for (const key of keys) {
      const isMember = await redis.sismember(key, userId)
      if (isMember) {
        const [, taskId] = key.split(":")
        matchingTasks.push(taskId)
      }
    }

    return matchingTasks
  }
}
