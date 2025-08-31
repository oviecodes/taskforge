// src/lib/metrics.ts

import client from "prom-client"

export const register = new client.Registry()
register.setDefaultLabels({ service: "status-gateway" })
client.collectDefaultMetrics({ register })

// === METRICS ===
export const statusUpdateCounter = new client.Counter({
  name: "task_status_updates_total",
  help: "Total number of task status updates received via Redis",
})

export const clientConnectionsCounter = new client.Counter({
  name: "client_connections_total",
  help: "Total number of clients connected since start",
})

export const activeClientsGauge = new client.Gauge({
  name: "connected_clients_gauge",
  help: "Current number of active websocket connections",
})

register.registerMetric(statusUpdateCounter)
register.registerMetric(clientConnectionsCounter)
register.registerMetric(activeClientsGauge)
