// src/lib/metrics.ts

import client from "prom-client"

export const register = new client.Registry()

// Optional: set global default labels
register.setDefaultLabels({
  service: "gateway-node",
})

client.collectDefaultMetrics({ register })

// Custom metrics
export const taskCounter = new client.Counter({
  name: "tasks_created_total",
  help: "Total number of tasks created",
  labelNames: ["type"],
})

export const taskErrorCounter = new client.Counter({
  name: "task_errors_total",
  help: "Number of failed task creations",
})

export const taskDuration = new client.Histogram({
  name: "task_creation_duration_seconds",
  help: "Duration of task creation logic",
  buckets: [0.1, 0.5, 1, 2, 5],
})
register.registerMetric(taskCounter)
register.registerMetric(taskErrorCounter)
register.registerMetric(taskDuration)
