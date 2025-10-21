// tests/task-creation.test.js
import http from "k6/http"
import { check, sleep } from "k6"
import { Trend, Rate } from "k6/metrics"
import { SharedArray } from "k6/data"

// Load pre-authenticated users from login API or JSON file
let users = new SharedArray(
  "users",
  () => JSON.parse(open(__ENV.USERS_FILE || "./testUsers.json")).users
)

users = users.slice(0, 800)

export const options = {
  stages: [
    { duration: "1m", target: 20 },
    { duration: "3m", target: 100 },
    { duration: "2m", target: 1000 },
    { duration: "2m", target: 0 },
  ],

  setupTimeout: "6m",
}

// Custom metrics
const taskLatency = new Trend("task_creation_latency_ms")
const taskSuccess = new Rate("task_create_success_rate")
const taskFailure = new Rate("task_create_failure_rate")

const payloads = [
  {
    type: "resize-image",
    payload: {
      imageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f",
      width: 800,
      height: 600,
    },
  },
  {
    type: "generate-pdf",
    payload: {
      url: "https://example.com",
    },
  },
  {
    type: "compress-video",
    payload: {
      videoUrl:
        "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      format: "mp4",
      bitrate: "900k",
      preset: "fast",
    },
  },
]

export function setup() {
  // Login all test users once, reuse tokens during test
  return users.map((u) => {
    const res = http.post(
      __ENV.LOGIN_URL || "https://api-taskforge.oviecodes.xyz/auth/login",
      JSON.stringify(u),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
    return { ...u, token: res.json("accessToken") }
  })
}

export default function (authUsers) {
  const user = authUsers[__VU % authUsers.length]

  const payload = JSON.stringify(payloads[Math.floor(Math.random() * 3)])

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${user.token}`,
  }

  const res = http.post(
    __ENV.TASK_URL || "https://api-taskforge.oviecodes.xyz/tasks",
    payload,
    { headers, tags: { name: "task_create" } }
  )

  const ok = check(res, {
    "status is 201": (r) => r.status === 201,
    "has taskId": (r) => !!r.json("taskId"),
  })

  if (ok) {
    taskSuccess.add(1)
  } else {
    taskFailure.add(1)
  }

  taskLatency.add(res.timings.duration)

  // Simulate think time
  sleep(Math.random() * 2 + 1)
}
