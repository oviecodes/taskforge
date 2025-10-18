import client from "prom-client"

export const register = new client.Registry()

register.setDefaultLabels({
  service: "outbox-publisher",
})

client.collectDefaultMetrics({ register })

// Custom metrics
export const taskCounter = new client.Counter({
  name: "tasks_dispatched_total",
  help: "Total number of tasks dispatched",
  labelNames: ["type"],
})

export const taskErrorCounter = new client.Counter({
  name: "task_dispatch_errors_total",
  help: "Number of failed task dispatch",
})

export const taskDuration = new client.Histogram({
  name: "task_dipatch_duration_seconds",
  help: "Duration of task creation logic",
  buckets: [0.1, 0.5, 1, 2, 5],
})

register.registerMetric(taskCounter)
register.registerMetric(taskErrorCounter)
register.registerMetric(taskDuration)
