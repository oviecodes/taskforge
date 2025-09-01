import {
  connectToRabbitMQ,
  // resizeImagePublisher,
  // compressVideoPublisher,
  generatePdfPublisher,
} from "./rabbitmq.service"
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
    const channel = await connectToRabbitMQ()

    // await runServicePublishers(channel)

    // Start the publishing loop
    setInterval(async () => {
      try {
        await runServicePublishers(channel)
      } catch (error) {
        log.error(
          {
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "❌ Error in publish loop"
        )
      }
    }, 60 * 1000)

    log.info("✅ All services initialized successfully")
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "❌ Failed to initialize services"
    )
    process.exit(1)
  }
}

const runServicePublishers = async (channel: any) => {
  await Promise.all([
    // resizeImagePublisher
    //   .setChannel(channel)
    //   .setUpInterval("resize-image", () => publishOutbox("resize-image")),
    // compressVideoPublisher
    //   .setChannel(channel)
    //   .setUpInterval("compress-video", () => publishOutbox("compress-video")),
    generatePdfPublisher
      .setChannel(channel)
      .setUpInterval("generate-pdf", () => publishOutbox("generate-pdf")),
  ])
}

// Start services
initializeServices()
startHealthServer(HEALTH_PORT)
