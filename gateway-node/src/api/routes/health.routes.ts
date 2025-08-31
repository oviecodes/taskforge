import { Router } from "express"
import { isDatabaseHealthy } from "../../lib/db.lib"
import { isRedisHealthy, redisWithResilience } from "../../lib/redis-resilience"
import { logger } from "../../lib/logger"

const router = Router()

// Create Redis instance for health checks
const redis = redisWithResilience(process.env.REDIS_URL!)

interface HealthStatus {
  status: "healthy" | "unhealthy"
  timestamp: string
  services: {
    database: { status: "up" | "down"; latency?: number; error?: string }
    redis: { status: "up" | "down"; latency?: number; error?: string }
  }
  uptime: number
}

// Readiness probe - checks if app can serve traffic
router.get("/", async (req, res) => {
  const healthStatus: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: { status: "up" },
      redis: { status: "up" }
    },
    uptime: process.uptime(),
  }

  try {
    // Test database connectivity with latency measurement
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
    logger.error("Database health check failed", { error: error.message })
  }

  try {
    // Test Redis connectivity with latency measurement
    const redisStart = Date.now()
    const isRedisHealthyResult = await isRedisHealthy(redis)
    healthStatus.services.redis.latency = Date.now() - redisStart

    if (!isRedisHealthyResult) {
      healthStatus.services.redis.status = "down"
      healthStatus.services.redis.error = "Redis connection failed"
      healthStatus.status = "unhealthy"
    }
  } catch (error: any) {
    healthStatus.services.redis.status = "down"
    healthStatus.services.redis.error = error.message
    healthStatus.status = "unhealthy"
    logger.error("Redis health check failed", { error: error.message })
  }

  const statusCode = healthStatus.status === "healthy" ? 200 : 503
  res.status(statusCode).json(healthStatus)
})

// Liveness probe - checks if app is alive (simpler check)
router.get("/live", (_, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

// Ready probe - checks if app is ready to serve traffic
router.get("/ready", async (_, res) => {
  try {
    const isDbHealthy = await isDatabaseHealthy()
    const isRedisHealthyResult = await isRedisHealthy(redis)

    if (isDbHealthy && isRedisHealthyResult) {
      res.status(200).json({ status: "ready" })
    } else {
      const reasons = []
      if (!isDbHealthy) reasons.push("Database unavailable")
      if (!isRedisHealthyResult) reasons.push("Redis unavailable")
      
      res.status(503).json({ 
        status: "not ready", 
        reasons: reasons.join(", ")
      })
    }
  } catch (error: any) {
    res.status(503).json({ status: "not ready", reason: error.message })
  }
})

export { router as healthRoutes }
