import dotenv from "dotenv"
dotenv.config()

import { initWebSocket } from "./socket.server"
import "./redis.subscriber"
import { startDebugServer } from "./debug.server"

const PORT = Number(process.env.PORT || 4000)

initWebSocket(PORT)
startDebugServer()
