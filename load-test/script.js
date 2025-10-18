import http from "k6/http"
import ws from "k6/ws"
import { check, sleep } from "k6"
import { SharedArray } from "k6/data"

export const options = {
  vus: 1,
  duration: "15m",
  setupTimeout: "20m",
}

// Preload user credentials
const users = new SharedArray(
  "test users",
  () => JSON.parse(open("./testUsers.json")).users
)

// 🧠 Store per-VU persistent state
let socket
let user

// Setup: authenticate all users once
export function setup() {
  return users.map((u) => {
    const res = http.post(
      "https://api-taskforge.oviecodes.xyz/auth/login",
      JSON.stringify(u),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
    return { ...u, accessToken: res.json("accessToken") }
  })
  // const res = http.post(
  //   "https://api-taskforge.oviecodes.xyz/auth/login",
  //   JSON.stringify(users[1]),
  //   {
  //     headers: { "Content-Type": "application/json" },
  //   }
  // )
  // return { ...users[1], accessToken: res.json("accessToken") }
}

// 🧠 Default: each VU uses same user + same WS connection
export default function (authUsers) {
  // If this VU hasn’t initialized yet, do it now
  if (!user) {
    user = authUsers[__VU % authUsers.length] // stable assignment
    // user = authUsers
    const url = `wss://status-taskforge.oviecodes.xyz?token=${user.accessToken}`

    // console.log("here")

    // open once
    socket = ws.connect(url, {}, (sock) => {
      sock.on("open", () =>
        console.log(`VU ${__VU} connected as ${user.email}`)
      )
      sock.on("message", (msg) => {
        const data = JSON.parse(msg)
        console.log(`VU ${__VU} received update for task ${data.taskId}`)
      })
      socket.setInterval(
        () => socket.send(JSON.stringify({ type: "heartbeat" })),
        5000
      )
      sock.on("close", () => console.log(`VU ${__VU} socket closed`))

      sleep(10000000)
    })
  }

  // 👇 Create a new task for this same user
  const res = http.post(
    "https://api-taskforge.oviecodes.xyz/tasks",
    JSON.stringify({
      type: "resize-image",
      payload: {
        imageUrl:
          "https://images.unsplash.com/photo-1522202176988-66273c2fd55f",
        width: 400,
        height: 300,
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
    }
  )

  // console.log("task created", res)

  // check(res, { "task created": (r) => r.status === 201 })

  // Send subscription via the existing WS connection
  const taskId = res.json("taskId")
  if (socket) {
    socket.send(JSON.stringify({ type: "subscribe", taskId }))
  }

  sleep(5) // small delay between iterations
}
