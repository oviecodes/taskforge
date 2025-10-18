import { TaskStatusUpdate } from "./types"
import { broadcastToTask } from "./socket.server"
import dotenv from "dotenv"
import { withLogContext } from "./lib/log-context"
import { statusUpdateCounter } from "./lib/metrics"
import {
  createResilientRedis,
  isRedisHealthy,
  redisCircuitBreaker,
} from "./lib/redis-resilience"

dotenv.config()

const log = withLogContext({ service: "status-gateway" })
let isSubscribed = false
const pattern = "task:*:status"

const redis = createResilientRedis(process.env.REDIS_URL!, async () => {
  // Resubscribe after reconnection
  if (!isSubscribed || !isAlreadySubscribed(pattern)) {
    log.info("🔄 Resubscribing after reconnection")
    await subscribeToTaskStatus()
  } else {
    log.info("Already subscribed to Redis, skipping resubscription")
  }
})

// Check if already subscribed using ioredis internal tracking
const isAlreadySubscribed = (pattern: string): boolean => {
  return (redis as any).subscriptionSet?.has(pattern) || false
}

export const subscribeToTaskStatus = async () => {
  // Check if already subscribed to prevent duplicate subscriptions
  if (isSubscribed && isAlreadySubscribed(pattern)) {
    log.info("Already subscribed to Redis, skipping")
    return
  }

  try {
    await redisCircuitBreaker.execute(async () => {
      const result = await redis.psubscribe(pattern)
      isSubscribed = true
      log.info("📡 Subscribed to task:*:status")
      return result
    })
  } catch (err) {
    log.error({ err }, "Failed to subscribe to Redis")
  }
}

redis.on("pmessage", async (_, channel, message) => {
  try {
    await redisCircuitBreaker.execute(async () => {
      statusUpdateCounter.inc()
      const [, taskId] = channel.split(":")
      const context = log.child({ taskId })
      const update: TaskStatusUpdate = JSON.parse(message)
      context.info(`Task:${taskId} status updated to ${update.status}`)
      await broadcastToTask(taskId, update)
    })
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "❌ Error processing Redis message"
    )
  }
})

redis.on("close", () => {
  isSubscribed = false
  log.warn("Redis connection closed, subscription lost")
})

export { redis, isRedisHealthy }
