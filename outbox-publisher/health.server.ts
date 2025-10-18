import express from "express"
import { isDatabaseHealthy } from "./connectors/db"
import { isRabbitMQHealthy } from "./rabbitmq.service"
import { withLogContext } from "./lib/log-context"
import { register } from "./lib/metrics"

const app = express()
const log = withLogContext({ service: "outbox-publisher-health" })

interface HealthStatus {
  status: "healthy" | "unhealthy"
  timestamp: string
  services: {
    database: { status: "up" | "down"; latency?: number; error?: string }
    rabbitmq: { status: "up" | "down"; error?: string }
  }
  uptime: number
}

app.get("/health", async (req, res) => {
  const healthStatus: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: { status: "up" },
      rabbitmq: { status: "up" },
    },
    uptime: process.uptime(),
  }

  try {
    const dbStart = Date.now()
    const isDbHealthy = await isDatabaseHealthy()
    healthStatus.services.database.latency = Date.now() - dbStart

    if (!isDbHealthy) {
      healthStatus.services.database.status = "down"
      healthStatus.services.database.error = "Database connection failed"
      healthStatus.status = "unhealthy"
    }
  } catch (error: any) {
    healthStatus.services.database.status = "down"
    healthStatus.services.database.error = error.message
    healthStatus.status = "unhealthy"
    log.error({ error: error.message }, "Database health check failed")
  }

  try {
    const isRmqHealthy = isRabbitMQHealthy()
    if (!isRmqHealthy) {
      healthStatus.services.rabbitmq.status = "down"
      healthStatus.services.rabbitmq.error = "RabbitMQ connection not available"
      healthStatus.status = "unhealthy"
    }
  } catch (error: any) {
    healthStatus.services.rabbitmq.status = "down"
    healthStatus.services.rabbitmq.error = error.message
    healthStatus.status = "unhealthy"
    log.error({ error: error.message }, "RabbitMQ health check failed")
  }

  const statusCode = healthStatus.status === "healthy" ? 200 : 503
  res.status(statusCode).json(healthStatus)
})

app.get("/live", (req, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

app.get("/ready", async (req, res) => {
  try {
    const isDbHealthy = await isDatabaseHealthy()
    const isRmqHealthy = isRabbitMQHealthy()

    if (isDbHealthy && isRmqHealthy) {
      res.status(200).json({ status: "ready" })
    } else {
      const reasons = []
      if (!isDbHealthy) reasons.push("Database unavailable")
      if (!isRmqHealthy) reasons.push("RabbitMQ unavailable")

      res.status(503).json({
        status: "not ready",
        reasons: reasons.join(", "),
      })
    }
  } catch (error: any) {
    res.status(503).json({ status: "not ready", reason: error.message })
  }
})

app.get("/metrics", async (_, res) => {
  res.set("Content-Type", register.contentType)
  res.send(await register.metrics())
})

export const startHealthServer = (port: number) => {
  app.listen(port, () => {
    log.info(`🏥 Health and metrics server listening on port ${port}`)
  })
}
