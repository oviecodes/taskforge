import Redis from "ioredis"
import dotenv from "dotenv"
import { withLogContext } from "./log-context"

const log = withLogContext({ service: "redis" })

dotenv.config()

export const redisWithResilience = (redisUrl: string): Redis => {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    reconnectOnError: (err) => {
      log.error({ error: err.message }, "Redis reconnect on error")
      // Reconnect on specific error types
      return (
        err.message.includes("READONLY") ||
        err.message.includes("ECONNRESET") ||
        err.message.includes("ETIMEDOUT")
      )
    },
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000) // Max 2s delay
      log.warn(`Redis retry attempt ${times}, delay: ${delay}ms`)
      return delay
    },
  })

  // Event listeners for monitoring
  redis.on("connect", () => {
    log.info("Connected to Redis")
  })

  redis.on("ready", () => {
    log.info("Redis connection ready")
  })

  redis.on("error", (err) => {
    log.error({ error: err.message }, "Redis connection error")
  })

  redis.on("close", () => {
    log.warn("Redis connection closed")
  })

  redis.on("reconnecting", (ms: number) => {
    log.info(`Reconnecting to Redis in ${ms}ms`)
  })

  redis.on("end", () => {
    log.warn("Redis connection ended")
  })

  return redis
}

export const isRedisHealthy = async (redis: Redis): Promise<Boolean> => {
  try {
    const ping = await redis.ping()
    return ping === "PONG"
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Redis health check failed"
    )
    return false
  }
}

export const reconnectToRedis = async (redis: Redis, maxRetries: number) => {
  let retries = 0
  let baseDelay = 1000

  while (retries < maxRetries) {
    try {
      log.info(`Attempting Redis reconnection (${retries + 1}/${maxRetries})`)
      const result = await redis.ping()
      if (result === "PONG") {
        log.info("Redis reconnection successful")
        return
      }
    } catch (error) {
      const delay = Math.min(Math.pow(2, retries) * baseDelay, 30000)
      retries++

      log.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          retryAttempt: retries,
          maxRetries,
          nextRetryIn: `${delay}ms`,
        },
        "Redis reconnection failed"
      )

      if (retries >= maxRetries) {
        log.error("Max Redis reconnection attempts reached")
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

class RedisCircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private readonly maxFailures = 5
  private readonly timeout = 60000 // 1 minute
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED"

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = "HALF_OPEN"
        log.info("Redis circuit breaker transitioning to HALF_OPEN")
      } else {
        throw new Error("Redis circuit breaker is OPEN - operations suspended")
      }
    }

    try {
      const res = await operation()
      this.onSuccess()
      return res
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  onSuccess() {
    this.failures = 0
    this.state = "CLOSED"
  }

  onFailure() {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures > this.maxFailures) {
      // set circuit to close
      this.state = "OPEN"
      log.warn(`Redis circuit breaker OPEN after ${this.failures} failures`)
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    }
  }
}

export const redisCircuitBreaker = new RedisCircuitBreaker()
