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

const getQueueFromRoutingKey = async (
  routingKey: string,
  channel: Channel
): Promise<number> => {
  const queues: Record<string, string> = {
    "generate-pdf": "taskforge:",
    "resize-image": "",
    "compress-video": "",
  }

  const { messageCount, consumerCount } = await channel.checkQueue(
    queues[routingKey]
  )

  return 0
}

// Health check function
export const isRabbitMQHealthy = (): boolean => {
  return isConnected && !!channel
}
