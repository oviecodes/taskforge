import { logger } from "./logger"

export const withLogContext = (context: Record<string, any>) => {
  return logger.child(context)
}
