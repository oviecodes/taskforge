import Redis from "ioredis"
import { withLogContext } from "./log-context"

const log = withLogContext({ service: "status-gateway-redis" })

export interface RedisResilienceOptions {
  maxRetriesPerRequest: number
  retryDelayOnFailover: number
  maxRetriesPerCluster: number
  enableReadyCheck: boolean
  lazyConnect: boolean
}

let onReconnectCallback: (() => Promise<void>) | null = null

// Enhanced Redis connection with resilience
export const createResilientRedis = (
  redisUrl: string,
  reconnectCallback?: () => Promise<void>
): Redis => {
  onReconnectCallback = reconnectCallback || null
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
    log.info("✅ Connected to Redis")
  })

  redis.on("ready", () => {
    log.info("✅ Redis connection ready")
    // Trigger resubscription when connection is restored
    if (onReconnectCallback) {
      onReconnectCallback().catch((err) =>
        log.error(
          { error: err.message },
          "Failed to execute reconnect callback"
        )
      )
    }
  })

  redis.on("error", (err) => {
    log.error({ error: err.message }, "❌ Redis connection error")
  })

  redis.on("close", () => {
    log.warn("⚠️ Redis connection closed")
  })

  redis.on("reconnecting", (ms: number) => {
    log.info(`🔄 Reconnecting to Redis in ${ms}ms`)
  })

  redis.on("end", () => {
    log.warn("🛑 Redis connection ended")
  })

  return redis
}

// Health check function
export const isRedisHealthy = async (redis: Redis): Promise<boolean> => {
  try {
    const result = await redis.ping()
    return result[0].toUpperCase() === "PONG"
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Redis health check failed"
    )
    return false
  }
}

// Reconnection with exponential backoff
export const reconnectToRedis = async (
  redis: Redis,
  maxRetries = 5
): Promise<void> => {
  let retries = 0
  const baseDelay = 1000 // 1 second

  while (retries < maxRetries) {
    try {
      log.info(`Attempting Redis reconnection (${retries + 1}/${maxRetries})`)
      const result = await redis.ping()
      if (result === "PONG") {
        log.info("Redis reconnection successful")
        return
      }
    } catch (error) {
      retries++
      const delay = Math.min(baseDelay * Math.pow(2, retries - 1), 30000) // Max 30 seconds

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

// Circuit breaker for Redis operations
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
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess() {
    this.failures = 0
    this.state = "CLOSED"
  }

  private onFailure() {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.maxFailures) {
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
