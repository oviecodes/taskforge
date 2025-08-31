package utils

import (
	"os"
	"time"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func Log(service string) zerolog.Logger {
	zerolog.SetGlobalLevel(zerolog.InfoLevel)
	zerolog.TimeFieldFormat = time.RFC3339
	
	// Set output to stdout for container logging
	log.Logger = log.Output(os.Stdout)
	
	return log.With().
		Str("service", service).
		Timestamp().
		Logger()
}
