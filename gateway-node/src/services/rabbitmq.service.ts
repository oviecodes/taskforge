import amqp, { Channel, ChannelModel, Connection } from "amqplib"
import { config } from "../config"
import { TaskMessage } from "../types/task.types"

let connection: ChannelModel
let channel: Channel

const EXCHANGE_NAME = "task.exchange"
const DLX_NAME = "task.dlx"

const RETRY_INTERVAL = 3000
const MAX_RETRIES = 10

export const connectToRabbitMQ = async () => {
  let attempts = 0

  while (attempts < MAX_RETRIES) {
    try {
      console.log(`Connecting to RabbitMQ (Attempt ${attempts + 1})...`)
      connection = await amqp.connect(config.rabbitmqUrl)
      channel = await connection.createChannel()
      await channel.assertExchange(EXCHANGE_NAME, "direct", { durable: true })
      await channel.assertExchange(DLX_NAME, "direct", { durable: true })

      console.log("✅ Connected to RabbitMQ. Exchanges ready.")
      return
    } catch (err: any) {
      attempts++
      console.error(`RabbitMQ connection failed: ${err.message}`)

      if (attempts >= MAX_RETRIES) {
        console.error("Max retries reached. Exiting...")
        process.exit(1)
      }

      await new Promise((res) => setTimeout(res, RETRY_INTERVAL))
    }
  }
}

export const publishToQueue = async (routingKey: string, task: TaskMessage) => {
  if (!channel) throw new Error("RabbitMQ channel not initialized")

  const success = channel.publish(
    EXCHANGE_NAME,
    routingKey,
    Buffer.from(JSON.stringify(task)),
    { persistent: true }
  )

  if (!success) {
    console.warn(`Failed to publish task with ID: ${task.id}`)
  }
}

export const logQueueStats = async (queueName: string) => {
  if (!channel) throw new Error("RabbitMQ channel not initialized")

  const stats = await channel.checkQueue(queueName)

  console.log(`📊 Queue "${queueName}" Stats:`)
  console.log(`  - Messages Ready: ${stats.messageCount}`)
  console.log(`  - Consumers: ${stats.consumerCount}`)
}

export const setupDeadLetterQueue = async () => {
  if (!channel) throw new Error("RabbitMQ channel not initialized")

  await channel.assertExchange(DLX_NAME, "direct", { durable: true })
  await channel.assertQueue("queue.dlq", { durable: true })
  await channel.bindQueue("queue.dlq", DLX_NAME, "dead")

  console.log("Dead Letter Queue setup complete.")
}

export const setupRetryQueue = async (
  originalRoutingKey: string,
  delayMs: number
) => {
  if (!channel) throw new Error("RabbitMQ channel not initialized")

  const queueName = `queue.${originalRoutingKey}.retry.${delayMs}ms`

  await channel.assertQueue(queueName, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": EXCHANGE_NAME,
      "x-dead-letter-routing-key": originalRoutingKey,
      "x-message-ttl": delayMs,
    },
  })

  console.log(`Retry queue "${queueName}" created.`)
  return queueName
}

export const sendToRetryQueue = async (
  originalRoutingKey: string,
  task: TaskMessage,
  delayMs: number
) => {
  if (!channel) throw new Error("RabbitMQ channel not initialized")

  const retryQueue = `queue.${originalRoutingKey}.retry.${delayMs}ms`

  await setupRetryQueue(originalRoutingKey, delayMs)

  channel.sendToQueue(retryQueue, Buffer.from(JSON.stringify(task)), {
    persistent: true,
  })

  console.log(`Task ${task.id} sent to retry queue (${delayMs}ms)`)
}
