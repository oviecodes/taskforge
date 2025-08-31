import { connectToRabbitMQ } from "./rabbitmq.service"
import { publishOutbox } from "./publisher"
import { startHealthServer } from "./health.server"
import { isDatabaseHealthy } from "./connectors/db"
import dotenv from "dotenv"
import { withLogContext } from "./lib/log-context"

dotenv.config()

const log = withLogContext({ service: "outbox-publisher-main" })
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 8200)

// Enhanced startup with health checks
const initializeServices = async () => {
  try {
    // Connect to RabbitMQ (has built-in retry logic)
    await connectToRabbitMQ()

    // Start the publishing loop
    setInterval(async () => {
      try {
        await publishOutbox()
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }, '❌ Error in publish loop')
      }
    }, 5000)

    log.info("✅ All services initialized successfully")
  } catch (error) {
    log.error({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, '❌ Failed to initialize services')
    process.exit(1)
  }
}

// Start services
initializeServices()
startHealthServer(HEALTH_PORT)
