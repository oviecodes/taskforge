import { WebSocketServer, WebSocket } from "ws"
import { verifyToken } from "./auth"
import { SubscriptionService } from "./services/subscription.service"
import { ConnectionStore } from "./services/connection.store"
import { ClientMessage, TaskStatusUpdate } from "./types"
import { v4 as uuidv4 } from "uuid"
import { TaskStatusCache } from "./services/task-status.cache"
import { withLogContext } from "./lib/log-context"
import { clientConnectionsCounter, activeClientsGauge } from "./lib/metrics"

const statusCache = new TaskStatusCache()
const subscriptionService = new SubscriptionService()
const connectionStore = new ConnectionStore()

export const sockets = new Map<string, WebSocket>() // socketId → socket

const HEARTBEAT_INTERVAL = 30000 // 30s

type User = {
  email: string
  id: string
}

const log = withLogContext({ service: "status-gateway" })

export const initWebSocket = (serverPort: number) => {
  const wss = new WebSocketServer({ port: serverPort })
  log.info(`📡 WebSocket server listening on port ${serverPort}`)

  wss.on("connection", async (ws, req) => {
    clientConnectionsCounter.inc()
    activeClientsGauge.inc()
    const url = new URL(req.url || "", `http://${req.headers.host}`)
    const token = url.searchParams.get("token")
    const socketId = uuidv4()

    // is alive
    ;(ws as any).isAlive = true

    ws.on("pong", () => {
      ;(ws as any).isAlive = true
    })

    try {
      const user: User = await verifyToken(token || "")
      const userId = user.id

      // Save socket reference
      sockets.set(socketId, ws)

      // Register in Redis
      await connectionStore.registerConnection(userId, socketId)
      log.info(`✅ Client connected: ${user.email} [${socketId}]`)

      // Handle incoming messages
      ws.on("message", async (raw) => {
        log.info(JSON.parse(raw.toString()))
        try {
          const msg = JSON.parse(raw.toString()) as ClientMessage
          if (msg.type === "subscribe" && msg.taskId) {
            await subscriptionService.addSubscriber(msg.taskId, userId)

            // 🔁 Immediately respond with current status (if exists)
            const cached = await statusCache.getStatus(msg.taskId)
            if (cached) {
              ws.send(JSON.stringify({ taskId: msg.taskId, ...cached }))
            }

            log.info(`🔔 ${user.email} subscribed to ${msg.taskId}`)
          }
        } catch {
          log.warn("⚠️ Invalid message")
        }
      })

      // Cleanup on disconnect
      ws.on("close", async () => {
        activeClientsGauge.dec()
        log.info(`❌ Disconnected: ${user.email} [${socketId}]`)
        sockets.delete(socketId)
        await connectionStore.removeConnection(socketId)

        // Optional: clean all subscriptions
        const taskIds = await subscriptionService.getUserTasks(userId)
        for (const taskId of taskIds) {
          await subscriptionService.removeSubscriber(taskId, userId)
        }
      })
    } catch (err: any) {
      console.log(err)
      log.error("❌ Invalid token:", err.message)
      ws.close()
    }
  })

  setInterval(async () => {
    for (const [socketId, ws] of sockets.entries()) {
      const alive = (ws as any).isAlive

      if (!alive) {
        console.log(`💀 Socket ${socketId} unresponsive. Terminating...`)
        ws.terminate()
        sockets.delete(socketId)
        await connectionStore.removeConnection(socketId)
        continue
      }

      ;(ws as any).isAlive = false
      ws.ping()
    }
  }, HEARTBEAT_INTERVAL)
}

export const broadcastToTask = async (
  taskId: string,
  data: TaskStatusUpdate
) => {
  // console.log(`setting ${taskId} cache here`)
  // await statusCache.setStatus(taskId, data)
  // 🧠 Clear from cache if final state
  if (["completed", "failed"].includes(data.status)) {
    await statusCache.clearStatus(taskId)
  } else {
    await statusCache.setStatus(taskId, data)
  }

  const userIds = await subscriptionService.getSubscribers(taskId)

  for (const userId of userIds) {
    const socketIds = await connectionStore.getUserSocketIds(userId)
    for (const socketId of socketIds) {
      const socket = sockets.get(socketId)
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ taskId, ...data }))
      }
    }
  }
}
