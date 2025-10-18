import knex, { Knex } from "knex"
import config from "../knexfile"
import { withLogContext } from "../lib/log-context"

const log = withLogContext({ service: "outbox-publisher-db" })
const env = process.env.NODE_ENV || "development"
const connection = config[env]

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

  dbConnection.on("query-error", (error, obj) => {
    log.error({ error: error.message, sql: obj.sql }, "Database query error")
  })

  return dbConnection
}

export const db = createDatabaseConnection()

// Health check function
export const isDatabaseHealthy = async (): Promise<boolean> => {
  try {
    await db.raw("SELECT 1")
    return true
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Database health check failed"
    )
    return false
  }
}

// Database reconnection with exponential backoff
export const reconnectToDatabase = async (maxRetries = 5): Promise<void> => {
  let retries = 0
  const baseDelay = 1000 // 1 second

  while (retries < maxRetries) {
    try {
      log.info(
        `Attempting database reconnection (${retries + 1}/${maxRetries})`
      )
      await db.raw("SELECT 1")
      log.info("Database reconnection successful")
      return
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
        "Database reconnection failed"
      )

      if (retries >= maxRetries) {
        log.error("Max database reconnection attempts reached")
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
