import express from "express"
import cors from "cors"
import morgan from "morgan"
import routes from "./src/api/routes"
import { healthRoutes } from "./src/api/routes/health.routes"
import { errorHandler } from "./src/middleware/error.middleware"
import * as dotenv from "dotenv"
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(morgan("dev"))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/", routes)
app.use("/health", healthRoutes)

app.use(errorHandler)

export default app
