import amqp, { Channel, ChannelModel, Connection } from "amqplib"
import { withLogContext } from "./lib/log-context"

let connection: ChannelModel
let channel: Channel
let isConnected = false
let isReconnecting = false

const DLX_NAME = "task.dlx"
const RETRY_INTERVAL = 3000
const MAX_RETRIES = 10

const RABBITMQ_URL = process.env.RABBITMQ_URL!
const EXCHANGE_NAME = process.env.EXCHANGE_NAME!

const log = withLogContext({ service: "outbox-publisher-rabbitmq" })

export const connectToRabbitMQ = async () => {
  let attempts = 0
  while (attempts < MAX_RETRIES) {
    try {
      log.info(`🔌 Connecting to RabbitMQ (Attempt ${attempts + 1})...`)
      connection = await amqp.connect(RABBITMQ_URL)
      channel = await connection.createChannel()
      await channel.assertExchange(EXCHANGE_NAME, "direct", { durable: true })
      await channel.assertExchange(DLX_NAME, "direct", { durable: true })

      // channel.checkQueue("")

      isConnected = true
      isReconnecting = false

      // Add connection event listeners
      connection.on("error", (err) => {
        log.error({ error: err.message }, "RabbitMQ connection error")
        isConnected = false
      })

      connection.on("close", () => {
        log.warn("RabbitMQ connection closed")
        isConnected = false
        // Attempt to reconnect
        if (!isReconnecting) {
          setTimeout(() => reconnectToRabbitMQ(), 5000)
        }
      })

      log.info("✅ Connected to RabbitMQ. Exchanges ready.")
      return
    } catch (err: any) {
      attempts++
      log.error({ error: err.message }, `❌ RabbitMQ connection failed`)

      if (attempts >= MAX_RETRIES) {
        log.error("🚨 Max retries reached for initial connection. Exiting...")
        process.exit(1)
      }

      await new Promise((res) => setTimeout(res, RETRY_INTERVAL))
    }
  }
}

// Reconnection with exponential backoff
const reconnectToRabbitMQ = async (maxRetries = 5): Promise<void> => {
  if (isReconnecting) return // Prevent multiple reconnection attempts

  isReconnecting = true
  let retries = 0
  const baseDelay = 1000 // 1 second

  while (retries < maxRetries) {
    try {
      log.info(
        `Attempting RabbitMQ reconnection (${retries + 1}/${maxRetries})`
      )
      connection = await amqp.connect(RABBITMQ_URL)
      channel = await connection.createChannel()
      await channel.assertExchange(EXCHANGE_NAME, "direct", { durable: true })
      await channel.assertExchange(DLX_NAME, "direct", { durable: true })

      isConnected = true
      isReconnecting = false

      // Re-add event listeners
      connection.on("error", (err) => {
        log.error({ error: err.message }, "RabbitMQ connection error")
        isConnected = false
      })

      connection.on("close", () => {
        log.warn("RabbitMQ connection closed")
        isConnected = false
        if (!isReconnecting) {
          setTimeout(() => reconnectToRabbitMQ(), 5000)
        }
      })

      log.info("RabbitMQ reconnection successful")
      return
    } catch (error) {
      retries++
      const delay = Math.min(baseDelay * Math.pow(2, retries - 1), 30000) // Max 30 seconds

      log.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          retryAttempt: retries,
          maxRetries,
          nextRetryIn: `${delay}ms`,
        },
        "RabbitMQ reconnection failed"
      )

      if (retries >= maxRetries) {
        log.error("Max RabbitMQ reconnection attempts reached")
        isReconnecting = false
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export const publishToQueue = async (routingKey: string, task: any) => {
  if (!channel || !isConnected) {
    throw new Error("RabbitMQ channel not initialized or connection lost")
  }

  try {
    const success = channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(task)),
      { persistent: true, contentType: "application/json" }
    )

    if (!success) {
      log.warn(
        { taskId: task.id },
        `⚠️ Failed to publish task - channel returned false`
      )
      throw new Error(`Failed to publish task ${task.id}`)
    }
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        taskId: task.id,
        routingKey,
      },
      "❌ Error publishing to queue"
    )
    throw error
  }
}

// Health check function
export const isRabbitMQHealthy = (): boolean => {
  return isConnected && !!channel
}

class SmartOutboxPublisher {
  publishInterval: number
  channel: Channel
  intervalNumber: any
  type: string

  constructor(type: string) {
    this.type = type
    this.publishInterval = 0
    this.channel = channel
  }

  // public set setPublishInterval(interval: number) {
  //   this.publishInterval = interval
  // }

  async computeDynamicPublishingFrequency(routingKey: string) {
    const queues: Record<string, string> = {
      "generate-pdf": "task.generate-pdf",
      "resize-image": "task.resize-image",
      "compress-video": "task.compress-video",
    }

    try {
      const { messageCount, consumerCount } = await this.channel.checkQueue(
        queues[routingKey]
      )

      const backlogPerConsumer =
        consumerCount > 0 ? messageCount / consumerCount : messageCount

      let publishInterval = 5000

      if (backlogPerConsumer > 100) {
        publishInterval = 15000
      } else if (backlogPerConsumer > 50) {
        publishInterval = 10000
      } else {
        publishInterval = 5000
      }

      return publishInterval
    } catch (error) {
      log.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "❌ Invalid Queue - Queue doesn't exist"
      )
      return -1
    }
  }

  async setUpInterval(
    routingKey: string,
    publishCallback: () => Promise<void>
  ) {
    const publishInterval = await this.computeDynamicPublishingFrequency(
      routingKey
    )

    if (this.publishInterval === publishInterval || publishInterval === -1) {
      return
    }

    this.cancelInterval()

    this.intervalNumber = setInterval(async () => {
      try {
        await publishCallback()
      } catch (error) {
        log.error(
          {
            error: error instanceof Error ? error.message : "Unknown error",
          },
          `❌ Error in ${this.type} publish loop`
        )
      }
    }, this.publishInterval)

    this.publishInterval = publishInterval
  }

  cancelInterval() {
    clearInterval(this.intervalNumber)
  }
}

export const resizeImagePublisher = new SmartOutboxPublisher("resize-image")
export const compressVideoPublisher = new SmartOutboxPublisher("compress-video")
export const generatePdfPublisher = new SmartOutboxPublisher("generate-pdf")
