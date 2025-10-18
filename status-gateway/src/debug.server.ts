import express from "express"
import { SubscriptionService } from "./services/subscription.service"
import { sockets } from "./socket.server"
import os from "os"
import { broadcastToTask } from "./socket.server"
import { isRedisHealthy, redis } from "./redis.subscriber"
import { withLogContext } from "./lib/log-context"

import { register } from "./lib/metrics"

const app = express()
const PORT = process.env.DEBUG_PORT || 4100
const subscriptionService = new SubscriptionService()
const log = withLogContext({ service: "status-gateway-debug" })

const DEBUG_AUTH_TOKEN = process.env.DEBUG_AUTH_TOKEN!

interface HealthStatus {
  status: "healthy" | "unhealthy"
  timestamp: string
  services: {
    redis: { status: "up" | "down"; latency?: number; error?: string }
  }
  uptime: number
}

// 🔐 Middleware
function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization
  const token = authHeader?.split(" ")[1]
  if (!token || token !== DEBUG_AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  next()
}

app.get("/health", async (_, res) => {
  const healthStatus: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      redis: { status: "up" },
    },
    uptime: process.uptime(),
  }

  try {
    const redisStart = Date.now()
    const isHealthy = await isRedisHealthy(redis)
    healthStatus.services.redis.latency = Date.now() - redisStart

    if (!isHealthy) {
      healthStatus.services.redis.status = "down"
      healthStatus.services.redis.error = "Redis connection failed"
      healthStatus.status = "unhealthy"
    }
  } catch (error: any) {
    healthStatus.services.redis.status = "down"
    healthStatus.services.redis.error = error.message
    healthStatus.status = "unhealthy"
    log.error({ error: error.message }, "Redis health check failed")
  }

  const statusCode = healthStatus.status === "healthy" ? 200 : 503
  res.status(statusCode).json(healthStatus)
})

app.get("/live", (_, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

app.get("/ready", async (_, res) => {
  try {
    const isHealthy = await isRedisHealthy(redis)

    if (isHealthy) {
      res.status(200).json({ status: "ready" })
    } else {
      res.status(503).json({ status: "not ready", reason: "Redis unavailable" })
    }
  } catch (error: any) {
    res.status(503).json({ status: "not ready", reason: error.message })
  }
})

app.get("/subscriptions/:taskId", requireAuth, async (req, res) => {
  const taskId = req.params.taskId
  const subscribers = await subscriptionService.getSubscribers(taskId)
  res.json({ taskId, subscribers })
})

app.get("/subscriptions/user/:userId", async (req, res) => {
  const userId = req.params.userId
  const taskIds = await subscriptionService.getUserTasks(userId)
  res.json({ userId, taskIds })
})

app.post(
  "/debug/broadcast/:taskId",
  requireAuth,
  express.json(),
  async (req, res) => {
    const taskId = req.params.taskId
    const payload = req.body

    try {
      await broadcastToTask(taskId, payload)
      res.json({ ok: true, sent: payload })
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "Failed to broadcast", details: err.message })
    }
  }
)

app.get("/metrics", async (_, res) => {
  res.set("Content-Type", register.contentType)
  res.send(await register.metrics())
})

export const startDebugServer = () => {
  app.listen(PORT, () => {
    console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`)
  })
}
