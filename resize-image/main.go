package main

import (
	"fmt"
	"time"

	"taskforge/resize-image/consumer"
	"taskforge/resize-image/utils"

	"github.com/joho/godotenv"
)

var logger = utils.Log("resize-image")

func main() {
	// Load env
	if err := godotenv.Load(); err != nil {
		logger.Info().Msg("No .env file found, using environment variables")
	}

	fmt.Println("🚀 Resize Image Worker starting...")
	utils.InitRedis()
	
	logger.Info().Msg("🚀 Starting metrics server on :8200")
	go func() {
		if err := utils.Start_metrics_server(); err != nil {
			logger.Fatal().Err(err).Msg("❌ Metrics server failed")
		}
	}()
	
	// Give metrics server time to start
	time.Sleep(2 * time.Second)
	logger.Info().Msg("✅ Metrics server should be running")
	
	err := consumer.StartRabbitMQConsumer()
	if err != nil {
		logger.Fatal().Err(err).Msgf("❌ Failed to start RabbitMQ consumer")
	}
}
