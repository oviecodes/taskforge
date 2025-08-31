package utils

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var TaskProcessedTotal = prometheus.NewCounterVec(
	prometheus.CounterOpts{
		Name: "task_processed_total",
		Help: "Success/failure per task",
	},
	[]string{"type", "status"},
)

var TaskProcessedDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
	Name:    "task_processing_duration_seconds",
	Help:    "A histogram of the Time spent on tasks in seconds.",
	Buckets: prometheus.ExponentialBuckets(0.1, 1.5, 5),
}, []string{"type"})

var TaskRetryAttempts = prometheus.NewCounterVec(prometheus.CounterOpts{
	Name: "task_retry_attempts_total",
	Help: "The number of retry attempts",
}, []string{"type"})

var TaskDroppedTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
	Name: "task_dropped_total",
	Help: "Tasks dropped to DLQ",
}, []string{"type"})

var S3UploadFailures = prometheus.NewCounterVec(prometheus.CounterOpts{
	Name: "s3_upload_failures_total",
	Help: "Tasks dropped to DLQ",
}, []string{"type"})

func Start_metrics_server() error {
	logger := Log("resize-image")
	logger.Info().Msg("🚀 Registering Prometheus metrics...")
	prometheus.MustRegister(
		TaskProcessedTotal,
		TaskProcessedDuration,
		TaskRetryAttempts,
		TaskDroppedTotal,
		S3UploadFailures,
	)

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		logger.Info().Msgf("Health check requested from %s", r.RemoteAddr)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
	mux.HandleFunc("/live", func(w http.ResponseWriter, r *http.Request) {
		logger.Info().Msgf("Liveness check requested from %s", r.RemoteAddr)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
	logger.Info().Msg("🚀 Starting HTTP server on :8200...")
	return http.ListenAndServe(":8200", mux)
}
