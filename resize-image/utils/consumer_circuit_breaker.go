package utils

import (
	"errors"
	"sync"
	"time"
)

type CircuitBreaker struct {
	mu           sync.RWMutex
	failureCount int
	state        string
	threshold    int
	timeout      time.Duration
	lastFailTime time.Time
}

func NewCircuitBreaker(threshold int, timeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		state:     "CLOSED",
		threshold: threshold,
		timeout:   timeout,
	}
}

func (cb *CircuitBreaker) Execute(fn func() error) error {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if cb.state == "OPEN" {
		if time.Since(cb.lastFailTime) > cb.timeout {
			cb.state = "HALF_OPEN"
		} else {
			return errors.New("circuit breaker is OPEN")
		}
	}

	err := fn()
	if err != nil {
		cb.onFailure()
		return err
	}

	cb.onSuccess()
	return nil
}

func (cb *CircuitBreaker) onSuccess() {
	cb.failureCount = 0
	cb.state = "CLOSED"
}

func (cb *CircuitBreaker) onFailure() {
	cb.failureCount++
	cb.lastFailTime = time.Now()

	if cb.failureCount >= cb.threshold {
		cb.state = "OPEN"
	}
}
