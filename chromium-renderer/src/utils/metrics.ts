// src/lib/metrics.ts

import client from "prom-client"

export const register = new client.Registry()

// Optional: set global default labels
register.setDefaultLabels({
  service: "chromium-renderer",
})

client.collectDefaultMetrics({ register })

// Custom metrics
export const pdfTasksCounter = new client.Counter({
  name: "pdf_tasks_recieved_total",
  help: "Total number of PDF generation tasks recieved",
})

export const pdfProcessedCounter = new client.Counter({
  name: "pdf_processed_total",
  help: "Total number of tasks processed sucessfully",
  labelNames: ["status"],
})

export const pdfErrorCounter = new client.Counter({
  name: "pdf_errors_total",
  help: "Number of failed PDF processing tasks",
})

export const pdfProcessingDuration = new client.Histogram({
  name: "pdf_processing_duration_seconds",
  help: "Duration of processing PDFs",
  buckets: [0.1, 0.5, 1, 2, 5],
})

register.registerMetric(pdfProcessedCounter)
register.registerMetric(pdfErrorCounter)
register.registerMetric(pdfProcessingDuration)
register.registerMetric(pdfTasksCounter)
