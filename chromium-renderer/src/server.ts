import express from "express"
import dotenv from "dotenv"
import renderRoutes from "./routes/render"
import authMiddleware from "./middleware/auth"

dotenv.config()

const app = express()
app.use(express.json())
app.use(authMiddleware)
app.use("/render", renderRoutes)

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`🧠 Renderer listening on port ${port}`)
})
