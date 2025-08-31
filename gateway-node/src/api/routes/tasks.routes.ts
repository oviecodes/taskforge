import express from "express"
import { authenticate } from "../../middleware/auth.middleware"
import { tasksController } from "../controllers"

const router = express.Router()

router.post("/", authenticate, tasksController.createTask)

export default router
