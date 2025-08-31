import dotenv from "dotenv"
dotenv.config()

import { initWebSocket } from "./socket.server"
import "./redis.subscriber" // Import to initialize Redis connection (subscription happens via callback)
import { startDebugServer } from "./debug.server"

const PORT = Number(process.env.PORT || 4000)

initWebSocket(PORT)
// Subscription happens automatically via Redis reconnection callback
startDebugServer()
