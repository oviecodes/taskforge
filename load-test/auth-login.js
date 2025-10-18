import http from "k6/http"
import { check, sleep } from "k6"
import { Trend, Rate } from "k6/metrics"
import { SharedArray } from "k6/data"

const users = new SharedArray(
  "users",
  () => JSON.parse(open(__ENV.USERS_FILE || "./testUsers.json")).users
)

export const options = {
  stages: [
    { duration: "1m", target: 10 },
    { duration: "3m", target: 200 },
    { duration: "5m", target: 1000 },
    { duration: "3m", target: 300 },
    { duration: "1m", target: 0 },
  ],
}

const loginLatency = new Trend("login_latency_ms")
const loginSuccess = new Rate("login_success_rate")

export default function () {
  // pick a user per VU deterministically
  const user = users[__VU % users.length]
  const payload = JSON.stringify({ email: user.email, password: user.password })

  const res = http.post(
    __ENV.LOGIN_URL || "https://api-taskforge.oviecodes.xyz/auth/login",
    payload,
    {
      headers: { "Content-Type": "application/json" },
      tags: { name: "auth_login" },
    }
  )

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "has token": (r) => !!(r.json("accessToken") || r.json("token")),
  })

  loginSuccess.add(ok)
  loginLatency.add(res.timings.duration)

  // small pause to model real user think-time
  sleep(Math.random() * 2 + 0.5)
}
