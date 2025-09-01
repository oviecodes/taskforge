import express, { NextFunction, Request, Response } from "express"
const router = express.Router()
import { register } from "../utils/metrics"
import { circuitBreaker } from "../utils/circuitBreaker"

router.get(
  "/metrics",
  async (req: Request, res: Response, next: NextFunction) => {
    res.set("Content-Type", register.contentType)
    res.send(await register.metrics())
  }
)

router.get("/health", (req: Request, res: Response, next: NextFunction) => {
  const healthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      state: "CLOSED",
    },
    uptime: process.uptime(),
  }

  const breaker = circuitBreaker.getState()

  // check failure rate from circuit breaker
  if (breaker.state === "OPEN") {
    healthStatus.services.state = breaker.state
  }

  if (breaker.failureCount > 8) {
    healthStatus.status = "unhealthy"
  }

  const statusCode = healthStatus.status === "healthy" ? 200 : 503
  res.status(statusCode).json(healthStatus)
})

router.get("/live", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

export default router
