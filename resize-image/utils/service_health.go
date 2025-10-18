package utils

import (
	"encoding/json"
	"net/http"
)

type HealthStatus struct {
	Status   string            `json:"status"`
	Services map[string]string `json:"services"`
}

type LivenessStatus struct {
	Status string `json:"status"`
}

// Function pointers to avoid circular imports
var RabbitMQHealthChecker func() bool
var RedisHealthChecker func() bool

func CheckServicesHealth() HealthStatus {
	logger := Log("resize-image")

	healthStatus := HealthStatus{
		Status: "Healthy",
		Services: map[string]string{
			"redis":    "UP",
			"rabbitMQ": "UP",
		},
	}

	if RabbitMQHealthChecker != nil && !RabbitMQHealthChecker() {
		logger.Info().Msg("rabbitmq is not healthy")
		healthStatus.Status = "Unhealthy"
		healthStatus.Services["rabbitMQ"] = "DOWN"
	}

	if RedisHealthChecker != nil && !RedisHealthChecker() {
		logger.Info().Msg("redis is not healthy")
		healthStatus.Status = "Unhealthy"
		healthStatus.Services["redis"] = "DOWN"
	}

	return healthStatus
}

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	logger := Log("resize-image")
	logger.Info().Msgf("Health check requested from %s", r.RemoteAddr)

	health := CheckServicesHealth()

	w.Header().Set("Content-Type", "application/json")
	if health.Status == "Healthy" {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusInternalServerError)
	}

	json.NewEncoder(w).Encode(health)
}

func LivenessHandler(w http.ResponseWriter, r *http.Request) {
	logger := Log("resize-image")
	logger.Info().Msgf("Liveness check requested from %s", r.RemoteAddr)

	liveness := LivenessStatus{Status: "Alive"}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(liveness)
}
