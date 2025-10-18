import pino from "pino"

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: {
    service: "status-gateway",
  },
  formatters: {
    level: (label) => {
      return { level: label }
    },
    log: (object) => {
      return object
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: undefined,
})
