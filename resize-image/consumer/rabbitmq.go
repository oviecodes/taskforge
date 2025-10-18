package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
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

var connection *amqp.Connection
var channel *amqp.Channel

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
	var err error
	var prefetchCount int

	prefetchCount, err = strconv.Atoi(os.Getenv("PREFETCH_COUNT"))

	if err != nil {
		prefetchCount = 1
	}

	logger.Info().Msgf("Current prefetch count - %d", prefetchCount)

	rabbitmqURL := os.Getenv("RABBITMQ_URL")
	queueName := os.Getenv("QUEUE_NAME")
	exchangeName := os.Getenv("EXCHANGE_NAME")
	routingKey := os.Getenv("ROUTING_KEY")
	const MAX_RETRIES = 3

	retryExchange := exchangeName + ".retry"
	retryQueue := queueName + ".retry"
	finalDLQ := queueName + ".dead"

	connection, err = amqp.Dial(rabbitmqURL)
	if err != nil {
		return fmt.Errorf("RabbitMQ connect error: %w", err)
	}
	channel, err = connection.Channel()
	if err != nil {
		return fmt.Errorf("channel error: %w", err)
	}

	err = channel.ExchangeDeclare(exchangeName, "direct", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("main exchange declare error: %w", err)
	}

	err = channel.ExchangeDeclare(retryExchange, "direct", true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("retry exchange declare error: %w", err)
	}

	_, err = channel.QueueDeclare(retryQueue, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    exchangeName,
		"x-dead-letter-routing-key": routingKey,
		"x-message-ttl":             int32(30000),
	})
	if err != nil {
		return fmt.Errorf("retry queue declare error: %w", err)
	}
	err = channel.QueueBind(retryQueue, routingKey, retryExchange, false, nil)
	if err != nil {
		return fmt.Errorf("retry queue bind error: %w", err)
	}

	_, err = channel.QueueDeclare(queueName, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    retryExchange,
		"x-dead-letter-routing-key": routingKey,
	})
	if err != nil {
		return fmt.Errorf("main queue declare error: %w", err)
	}
	err = channel.QueueBind(queueName, routingKey, exchangeName, false, nil)
	if err != nil {
		return fmt.Errorf("main queue bind error: %w", err)
	}

	_, err = channel.QueueDeclare(finalDLQ, true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("final DLQ declare error: %w", err)
	}

	logger.Info().Msgf("Pure DLX Ready → Queue: %s | Retry: %s | TTL: 30s", queueName, retryExchange)

	err = channel.Qos(prefetchCount, 0, false)
	if err != nil {
		return fmt.Errorf("QoS error: %w", err)
	}

	msgs, err := channel.Consume(queueName, "", false, false, false, false, nil)
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

			retryCount := getRetryCount(msg.Headers)

			err := circuitBreaker.Execute(func() error {
				return image.ProcessResizeTask(context.Background(), task.ID, task.Payload)
			})

			if err != nil {
				contextLogger.Info().Msgf("Task %s failed [retry %d/%d]", task.ID, retryCount, MAX_RETRIES)
				utils.TaskProcessedTotal.With(prometheus.Labels{"type": "resize-image", "status": "failed"}).Inc()

				if retryCount >= MAX_RETRIES {
					// Final failure - send to DLQ manually
					contextLogger.Info().Msgf("Task %s exceeded retry limit, sending to final DLQ", task.ID)
					utils.TaskDroppedTotal.With(prometheus.Labels{"type": "resize-image"}).Inc()

					err := channel.Publish("", finalDLQ, false, false, amqp.Publishing{
						ContentType: "application/json",
						Body:        msg.Body,
					})
					if err != nil {
						contextLogger.Error().Msgf("DLQ publish failed: %v", err)
					}
					_ = msg.Ack(false)
				} else {

					utils.TaskRetryAttempts.With(prometheus.Labels{"type": "resize-image"}).Inc()
					_ = msg.Nack(false, false)
				}
				continue
			}

			duration := time.Since(start)

			utils.TaskProcessedDuration.With(prometheus.Labels{"type": "resize"}).Observe(duration.Seconds())

			utils.TaskProcessedTotal.With(prometheus.Labels{"type": "resize", "status": "success"}).Inc()
			_ = msg.Ack(false)
		}
	}()

	select {} // block
}

func IsRabbitMQHealthy() bool {
	if connection == nil || channel == nil {
		return false
	}

	// Check if connection is still open and channel is usable
	if connection.IsClosed() {
		return false
	}

	// For amqp.Channel, we need to check if it's nil or closed differently
	select {
	case <-channel.NotifyClose(make(chan *amqp.Error, 1)):
		return false
	default:
		return true
	}
}
