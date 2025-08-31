import express, { Router } from "express"
const router: Router = express.Router()
import taskRoutes from "./tasks.routes"
import authRoutes from "./auth.routes"
import metricsRoutes from "./metrics.routes"

router.use("/auth", authRoutes)
router.use("/tasks", taskRoutes)
router.use("/metrics", metricsRoutes)

export default router
