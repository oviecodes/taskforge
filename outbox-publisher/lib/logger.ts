// src/lib/logger.ts

import pino from "pino"

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: {
    service: "outbox-publisher"
  },
  formatters: {
    level: (label) => {
      return { level: label }
    },
    log: (object) => {
      return object
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Force JSON output even in development for container logging
  transport: undefined
})
