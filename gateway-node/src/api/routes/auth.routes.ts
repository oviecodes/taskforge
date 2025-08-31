import express, { Router } from "express"
const router = express.Router()
import authController from "../controllers/auth.controller"

router.post("/signup", authController.signUp)
router.post("/login", authController.login)
router.post("/refresh", authController.refresh)
router.post("/logout", authController.logout)

router.post("/remove-test-users", authController.removeTestUsers)

export default router
