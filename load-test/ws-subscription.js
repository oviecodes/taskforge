import http from "k6/http"
import ws from "k6/ws"
import { check, sleep } from "k6"
import { Trend, Counter } from "k6/metrics"
import { SharedArray } from "k6/data"

// --- Metrics ---
const connectDuration = new Trend("ws_connect_duration", true)
const messageDelay = new Trend("ws_message_delay", true)
const connectionErrors = new Counter("ws_connection_errors")
const messagesReceived = new Counter("ws_messages_total")

export const options = {
  vus: 200,
  duration: "10m",
  setupTimeout: "8m",
  thresholds: {
    ws_connection_errors: ["count < 5"],
    ws_connect_duration: ["p(95)<500"],
    ws_message_delay: ["p(95)<2000"],
  },
}

const users = new SharedArray("users", function () {
  return JSON.parse(open("./testUsers.json")).users
})

users = users.slice(0, 800)

export function setup() {
  // Authenticate all users
  return users.map((u) => {
    const res = http.post(
      "https://api-taskforge.oviecodes.xyz/auth/login",
      JSON.stringify(u),
      { headers: { "Content-Type": "application/json" } }
    )
    return { ...u, accessToken: res.json("accessToken") }
  })
}

export default function (authUsers) {
  const user = authUsers[__VU % authUsers.length]
  const token = user.accessToken
  const taskId = `task-${__VU}`
  const url = `wss://status-taskforge.oviecodes.xyz?token=${token}`

  const start = Date.now()

  const res = ws.connect(url, {}, function (socket) {
    socket.on("open", () => {
      connectDuration.add(Date.now() - start)
      console.log(`VU ${__VU} connected`)

      // Subscribe to updates for a task
      socket.send(JSON.stringify({ type: "subscribe", taskId }))

      // Listen for messages
      socket.on("message", (msg) => {
        messagesReceived.add(1)
        const data = JSON.parse(msg)

        if (data?.timestamp) {
          const delay = Date.now() - new Date(data.timestamp).getTime()
          messageDelay.add(delay)
        }
      })
    })

    socket.on("error", (e) => {
      connectionErrors.add(1)
      console.error(`VU ${__VU} WS error: ${e.error()}`)
    })

    socket.on("close", () => {
      console.log(`VU ${__VU} disconnected`)
    })

    // Keep connection alive for some time
    socket.setInterval(() => {
      socket.send(JSON.stringify({ type: "ping" }))
    }, 5000)

    sleep(30)
  })

  check(res, {
    "status is 101 (Switching Protocols)": (r) => r && r.status === 101,
  })
}
