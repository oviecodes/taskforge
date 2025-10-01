import knex, { Knex } from "knex"
import dbConfig from "../../knexfile"
import { config } from "../config"
import { attachPaginate } from "knex-paginate"
import { logger } from "./logger"

const connection = dbConfig[config.env]

attachPaginate()

// Database connection with resilience
const createDatabaseConnection = (): Knex => {
  const dbConnection = knex({
    ...connection,
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },
    acquireConnectionTimeout: 60000,
  })

  // Add connection event listeners for monitoring
  dbConnection.on("query-error", (error, obj) => {
    logger.error("❌ Database query error", {
      error: error.message,
      sql: obj.sql,
    })

    // Let connection pool handle reconnection automatically
    if (isConnectionError(error)) {
      logger.warn("⚠️ Database connection error detected")
    }
  })

  return dbConnection
}

const isConnectionError = (error: any): boolean => {
  const connectionErrors = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "connection terminated",
    "server closed the connection",
  ]

  return connectionErrors.some((errorType) =>
    error.message.toLowerCase().includes(errorType.toLowerCase())
  )
}

// Default database instance
export const db = createDatabaseConnection()

// Health check function
export const isDatabaseHealthy = async (): Promise<boolean> => {
  try {
    await db.raw("SELECT 1")
    return true
  } catch (error) {
    logger.error("Database health check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return false
  }
}

class DatabaseCircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private readonly maxFailures = 5
  private readonly timeout = 60000 // 1 minute
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED"

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = "HALF_OPEN"
        logger.info("Circuit breaker transitioning to HALF_OPEN")
      } else {
        throw new Error(
          "Circuit breaker is OPEN - database operations suspended"
        )
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
      logger.warn(`Circuit breaker OPEN after ${this.failures} failures`)
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

export const dbCircuitBreaker = new DatabaseCircuitBreaker()
