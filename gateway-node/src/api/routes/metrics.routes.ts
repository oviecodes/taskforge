// src/routes/metrics.routes.ts

import express from "express"
import { register } from "../../lib/metrics"

const router = express.Router()

router.get("/", async (req, res) => {
  res.set("Content-Type", register.contentType)
  res.send(await register.metrics())
})

export default router
