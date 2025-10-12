import http from "k6/http"
import { expect } from "https://jslib.k6.io/k6-testing/0.5.0/index.js"

import { sleep, check } from "k6"
import { Trend } from "k6/metrics"

export const publishDuration = new Trend("publish_duration", true)
export const successRate = new Trend("success_rate", true)

export const options = {
  vus: 10, // number of concurrent users
  duration: "1m",
  thresholds: {
    publish_duration: ["p(95)<2000"], // 95% of publishes < 2s
  },
}

// These are passed as environment variables
const PREFETCH = __ENV.PREFETCH_COUNT || 1
const WORKER = __ENV.TEST_WORKER || "resize-image"
const TASK_COUNT = __ENV.TASK_COUNT || 500
const API_URL =
  __ENV.TASK_ENDPOINT || "https://api-taskforge.oviecodes.xyz/tasks"
const TOKEN =
  __ENV.TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZmNmJiNjkwLTNlY2MtNGM2Mi04ZjRhLWUwN2I1OTlhOWU4YSIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTc2MDEzMjE1NSwiZXhwIjoxNzYwMTMzMDU1fQ.NlU--UV8YDvrtxJKtO4te-2BG3FVLi5ld0VwauMtP98"

export default function () {
  const payload = JSON.stringify({
    id: "abcd1234-5678-9012-efgh-3456ijkl7890",
    type: "resize-image",
    userId: "test-user",
    traceId: "trace-001",
    createdAt: "2025-07-15T12:00:00Z",
    payload: {
      imageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f",
      width: 400,
      height: 300,
    },
  })

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
  }

  const start = Date.now()
  const res = http.post(API_URL, payload, { headers })
  const end = Date.now()

  publishDuration.add(end - start)

  check(res, {
    "status is 200 or 201": (r) => r.status === 200 || r.status === 201,
  }) && successRate.add(1)

  sleep(0.1)
}
