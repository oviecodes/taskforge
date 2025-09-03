package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"taskforge/resize-image/image"
	"taskforge/resize-image/utils"

	"github.com/prometheus/client_golang/prometheus"
	amqp "github.com/streadway/amqp"
)

type TaskMessage struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	UserID    string                 `json:"userId"`
	Payload   map[string]interface{} `json:"payload"`
	TraceID   string                 `json:"traceId"`
	CreatedAt string                 `json:"createdAt"`
}

var logger = utils.Log("resize-image")

// getRetryCount extracts retry count from RabbitMQ's x-death headers (automatic DLX tracking)
func getRetryCount(headers amqp.Table) int {
	if headers == nil {
		return 0
	}

	if xDeath, ok := headers["x-death"]; ok {
		if deaths, ok := xDeath.([]interface{}); ok && len(deaths) > 0 {
			if death, ok := deaths[0].(amqp.Table); ok {
				if count, ok := death["count"]; ok {
					if countInt, ok := count.(int64); ok {
						return int(countInt)
					}
				}
			}
		}
	}
	return 0
}

func StartRabbitMQConsumer() error {
	rabbitmqURL := os.Getenv("RABBITMQ_URL")
	queueName := os.Getenv("QUEUE_NAME")
	exchangeName := os.Getenv("EXCHANGE_NAME")
	routingKey := os.Getenv("ROUTING_KEY")
	// Pure DLX Pattern: Single retry queue with RabbitMQ x-death tracking
	const MAX_RETRIES = 3

	// Retry infrastructure
	retryExchange := exchangeName + ".retry"
	retryQueue := queueName + ".retry"
	finalDLQ := queueName + ".dead"

	// Connect
	conn, err := amqp.Dial(rabbitmqURL)
	if err != nil {
		return fmt.Errorf("RabbitMQ connect error: %w", err)
	}
	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("channel error: %w", err)
	}

	// 1. Declare main exchange
	err = ch.ExchangeDeclare(exchangeName, "direct", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("main exchange declare error: %w", err)
	}

	// 2. Declare retry exchange
	err = ch.ExchangeDeclare(retryExchange, "direct", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("retry exchange declare error: %w", err)
	}

	// 3. Declare retry queue - routes back to main queue after TTL
	// Uses RabbitMQ's x-death headers to track retry count automatically
	_, err = ch.QueueDeclare(retryQueue, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    exchangeName, // Back to main queue after TTL
		"x-dead-letter-routing-key": routingKey,
		"x-message-ttl":             int32(30000), // Start with 30s, will use exponential backoff in consumer
	})
	if err != nil {
		return fmt.Errorf("retry queue declare error: %w", err)
	}
	err = ch.QueueBind(retryQueue, routingKey, retryExchange, false, nil)
	if err != nil {
		return fmt.Errorf("retry queue bind error: %w", err)
	}

	// 4. Declare main task queue - routes to retry exchange on failure
	_, err = ch.QueueDeclare(queueName, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    retryExchange, // Failure → retry queue
		"x-dead-letter-routing-key": routingKey,
	})
	if err != nil {
		return fmt.Errorf("main queue declare error: %w", err)
	}
	err = ch.QueueBind(queueName, routingKey, exchangeName, false, nil)
	if err != nil {
		return fmt.Errorf("main queue bind error: %w", err)
	}

	// 5. Declare final dead letter queue (no TTL - manual intervention required)
	_, err = ch.QueueDeclare(finalDLQ, true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("final DLQ declare error: %w", err)
	}

	logger.Info().Msgf("✅ Pure DLX Ready → Queue: %s | Retry: %s | TTL: 30s", queueName, retryExchange)

	err = ch.Qos(1, 0, false)
	// ch.QueueInspect(queueName)

	// 7. Start consuming with manual ack
	msgs, err := ch.Consume(queueName, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("failed to start consumer: %w", err)
	}

	var circuitBreaker = utils.NewCircuitBreaker(5, 60)

	go func() {
		for msg := range msgs {
			start := time.Now()
			var task TaskMessage
			if err := json.Unmarshal(msg.Body, &task); err != nil {
				log.Printf("❌ Invalid task format: %v", err)
				_ = msg.Nack(false, false) // discard malformed task
				continue
			}

			contextLogger := logger.With().Str("taskId", task.ID).Logger()

			contextLogger.Info().Msgf("📦 Received task: %s", task.ID)

			// Pure DLX Pattern: Check x-death headers to determine retry count
			retryCount := getRetryCount(msg.Headers)

			err := circuitBreaker.Execute(func() error {
				return image.ProcessResizeTask(context.Background(), task.ID, task.Payload)
			})

			if err != nil {
				contextLogger.Info().Msgf("⛔ Task %s failed [retry %d/%d]", task.ID, retryCount, MAX_RETRIES)
				utils.TaskProcessedTotal.With(prometheus.Labels{"type": "resize-image", "status": "failed"}).Inc()

				if retryCount >= MAX_RETRIES {
					// Final failure - send to DLQ manually
					contextLogger.Info().Msgf("💀 Task %s exceeded retry limit, sending to final DLQ", task.ID)
					utils.TaskDroppedTotal.With(prometheus.Labels{"type": "resize-image"}).Inc()

					err := ch.Publish("", finalDLQ, false, false, amqp.Publishing{
						ContentType: "application/json",
						Body:        msg.Body,
					})
					if err != nil {
						contextLogger.Error().Msgf("❌ DLQ publish failed: %v", err)
					}
					_ = msg.Ack(false) // Ack to prevent redelivery
				} else {
					// Let RabbitMQ DLX handle retry (automatic routing to retry queue)
					utils.TaskRetryAttempts.With(prometheus.Labels{"type": "resize-image"}).Inc()
					_ = msg.Nack(false, false) // Nack without requeue → triggers DLX → retry queue
				}
				continue
			}

			duration := time.Since(start)

			utils.TaskProcessedDuration.With(prometheus.Labels{"type": "resize"}).Observe(duration.Seconds())

			utils.TaskProcessedTotal.With(prometheus.Labels{"type": "resize", "status": "success"}).Inc()
			_ = msg.Ack(false) // ✅ success
		}
	}()

	select {} // block
}
