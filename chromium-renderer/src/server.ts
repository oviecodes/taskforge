import express from "express"
import dotenv from "dotenv"
import renderRoutes from "./routes/render"
import healthRoutes from "./routes/metrics"
import authMiddleware from "./middleware/auth"
import { errorHandler } from "./middleware/error.middleware"

dotenv.config()

const app = express()
app.use(express.json())

app.use("/", healthRoutes)
app.use("/render", authMiddleware, renderRoutes)

app.use(errorHandler)

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`🧠 Renderer listening on port ${port}`)
})
