import http from "k6/http"
import ws from "k6/ws"
import { check, sleep } from "k6"
import { SharedArray } from "k6/data"
import { Trend, Counter, Gauge } from "k6/metrics"

const connectDuration = new Trend("ws_connect_duration", true)
const connectionErrors = new Counter("ws_connection_errors")
const activeConnections = new Gauge("ws_active_connections")

export const options = {
  vus: 10000,
  duration: "10m",
  setupTimeout: "8m",
  thresholds: {
    ws_connection_errors: ["count < 20"],
    ws_connect_duration: ["p(95)<1000"],
  },
}

// Load test users
let users = new SharedArray(
  "users",
  () => JSON.parse(open("./testUsers.json")).users
).slice(0, 800)

// users = users.slice(0, 800)

export function setup() {
  // Authenticate all users once
  return users.map((u) => {
    const res = http.post(
      "https://api-taskforge.oviecodes.xyz/auth/login",
      JSON.stringify(u),
      { headers: { "Content-Type": "application/json" } }
    )
    const token = res.json("accessToken")
    check(res, {
      "login successful": (r) =>
        (r.status === 200 || r.status === 201) && !!token,
    })
    return { ...u, token }
  })
}

export default function (authUsers) {
  // Randomly pick a user and reuse its token
  const user = authUsers[__VU % authUsers.length]
  const url = `wss://status-taskforge.oviecodes.xyz?token=${user.token}`
  const start = Date.now()

  const res = ws.connect(url, {}, function (socket) {
    socket.on("open", () => {
      connectDuration.add(Date.now() - start)
      activeConnections.add(1)
      console.log(`VU ${__VU} connected as ${user.email}`)
    })

    socket.on("error", (e) => {
      connectionErrors.add(1)
      console.error(`VU ${__VU} error: ${e.error()}`)
    })

    socket.on("close", () => {
      activeConnections.add(-1)
      console.log(`VU ${__VU} closed`)
    })

    socket.setInterval(() => {
      socket.send(JSON.stringify({ type: "ping" }))
    }, 5000)

    sleep(1000000)
  })
}
