# Database Resilience and Reconnection Logic

## Overview

This document explains the database resilience mechanisms implemented in the gateway-node service to handle PostgreSQL connection failures gracefully.

## Components

### 1. Enhanced Connection Pool

```typescript
const dbConnection = knex({
  ...connection,
  pool: {
    min: 2,              // Always keep 2 connections alive
    max: 10,             // Maximum 10 concurrent connections
    acquireTimeoutMillis: 30000,      // Wait 30s to get a connection
    createTimeoutMillis: 30000,       // Wait 30s to create new connection
    destroyTimeoutMillis: 5000,       // Wait 5s to destroy connection
    idleTimeoutMillis: 30000,         // Close idle connections after 30s
    reapIntervalMillis: 1000,         // Check for idle connections every 1s
    createRetryIntervalMillis: 200,   // Retry connection creation every 200ms
  },
  acquireConnectionTimeout: 60000,    // Overall timeout for acquiring connection
})
```

**Why this configuration?**
- **`min: 2`** - Maintains warm connections for faster response times
- **`max: 10`** - Prevents connection exhaustion under load
- **Long timeouts** - Gives more time for temporary network issues to resolve
- **Active reaping** - Cleans up dead connections quickly

### 2. Health Check Function

```typescript
export const isDatabaseHealthy = async (): Promise<boolean> => {
  try {
    await db.raw('SELECT 1')
    return true
  } catch (error) {
    logger.error('Database health check failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })
    return false
  }
}
```

**Purpose:**
- Quick connectivity test using minimal query
- Non-throwing function that returns boolean
- Used by health endpoints and middleware

### 3. Reconnection Logic with Exponential Backoff

```typescript
export const reconnectToDatabase = async (maxRetries = 5): Promise<void> => {
  let retries = 0
  const baseDelay = 1000 // 1 second

  while (retries < maxRetries) {
    try {
      logger.info(`Attempting database reconnection (${retries + 1}/${maxRetries})`)
      await db.raw('SELECT 1')
      logger.info('Database reconnection successful')
      return
    } catch (error) {
      retries++
      const delay = Math.min(baseDelay * Math.pow(2, retries - 1), 30000) // Max 30 seconds
      
      logger.error(`Database reconnection failed (${retries}/${maxRetries})`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        nextRetryIn: `${delay}ms`
      })

      if (retries >= maxRetries) {
        logger.error('Max database reconnection attempts reached')
        throw error
      }

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
```

## Why `await new Promise(resolve => setTimeout(resolve, delay))` Instead of Recursive Calls?

### ❌ Recursive Approach (Problematic):
```typescript
// DON'T DO THIS
const reconnectToDatabase = async (retryCount = 0, maxRetries = 5) => {
  try {
    await db.raw('SELECT 1')
    return
  } catch (error) {
    if (retryCount >= maxRetries) throw error
    
    setTimeout(() => {
      reconnectToDatabase(retryCount + 1, maxRetries) // ⚠️ PROBLEMS!
    }, delay)
  }
}
```

**Problems with recursive approach:**
1. **Lost Promise Chain** - `setTimeout` doesn't return a Promise, so the caller can't await the result
2. **Fire and Forget** - The recursive call happens in a callback, disconnected from the original call
3. **Error Handling Issues** - Errors in recursive calls don't bubble up properly
4. **Stack Complexity** - Creates complex call stack patterns

### ✅ Current Approach (Correct):
```typescript
await new Promise(resolve => setTimeout(resolve, delay))
```

**Benefits:**
1. **Maintains Promise Chain** - The caller can properly await the entire reconnection process
2. **Linear Execution** - Code reads top-to-bottom, easier to understand
3. **Proper Error Propagation** - Errors bubble up to the caller correctly
4. **Clean Stack** - Each retry is a new iteration, not a recursive call
5. **Controllable** - The calling code knows when reconnection succeeds or fails

## Exponential Backoff Explained

```typescript
const delay = Math.min(baseDelay * Math.pow(2, retries - 1), 30000)
```

**Retry Sequence:**
- Retry 1: 1000ms (1 second)
- Retry 2: 2000ms (2 seconds) 
- Retry 3: 4000ms (4 seconds)
- Retry 4: 8000ms (8 seconds)
- Retry 5: 16000ms (16 seconds)
- Max cap: 30000ms (30 seconds)

**Why exponential backoff?**
- **Reduces server load** during outages
- **Gives time for issues to resolve** (network problems, server restarts)
- **Prevents thundering herd** when multiple instances reconnect simultaneously
- **Standard industry practice** for resilient systems

## Circuit Breaker Pattern

```typescript
class DatabaseCircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private readonly maxFailures = 5
  private readonly timeout = 60000 // 1 minute
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
}
```

**States:**
- **CLOSED** - Normal operation, requests pass through
- **OPEN** - Too many failures, all requests fail fast  
- **HALF_OPEN** - Testing if service recovered, limited requests allowed

**Flow:**
1. Start in `CLOSED` state
2. After 5 consecutive failures → `OPEN` state
3. After 1 minute in `OPEN` → try `HALF_OPEN`
4. If `HALF_OPEN` succeeds → back to `CLOSED`
5. If `HALF_OPEN` fails → back to `OPEN`

## Health Check Endpoints

### `/health` - Readiness Probe
- **Purpose**: Is the service ready to handle traffic?
- **Checks**: Database connectivity with latency measurement
- **Response**: 200 (healthy) or 503 (unhealthy)
- **Used by**: Kubernetes readiness probe

### `/live` - Liveness Probe  
- **Purpose**: Is the service alive?
- **Checks**: Basic process health, memory usage
- **Response**: Always 200 (unless process is dead)
- **Used by**: Kubernetes liveness probe

### `/ready` - Custom Ready Check
- **Purpose**: Quick readiness check
- **Checks**: Fast database connectivity test
- **Response**: 200 (ready) or 503 (not ready)

## Kubernetes Integration

```yaml
readinessProbe:
  httpGet: { path: /health, port: 3000 }
  initialDelaySeconds: 30      # Wait 30s after startup
  periodSeconds: 10           # Check every 10s  
  timeoutSeconds: 5           # 5s timeout per check
  failureThreshold: 3         # Mark unhealthy after 3 failures
  successThreshold: 1         # Mark healthy after 1 success

livenessProbe:
  httpGet: { path: /live, port: 3000 }
  initialDelaySeconds: 45     # Wait 45s after startup
  periodSeconds: 20           # Check every 20s
  timeoutSeconds: 3           # 3s timeout per check  
  failureThreshold: 3         # Restart after 3 failures
```

## Failure Scenarios

### Scenario 1: Database Server Restart
1. Database goes down
2. Health checks start failing
3. Kubernetes marks pod as unready (stops sending traffic)
4. Circuit breaker opens (protects database from load)
5. Database comes back online
6. Health checks succeed
7. Kubernetes marks pod as ready (resumes traffic)

### Scenario 2: Network Partition
1. Network connection to database lost
2. Connection pool exhausted
3. Health checks fail with timeout
4. Automatic reconnection attempts with exponential backoff
5. Circuit breaker prevents further load
6. When network restored, reconnection succeeds
7. Service resumes normal operation

### Scenario 3: Database Overload
1. Database becomes slow/unresponsive
2. Connection timeouts increase
3. Health checks start timing out
4. Circuit breaker opens after 5 failures
5. Service fails fast instead of waiting
6. Reduces load on database
7. When database recovers, circuit breaker closes

## Benefits

1. **Automatic Recovery** - No manual intervention needed
2. **Fast Failure Detection** - Quick response to issues
3. **Load Protection** - Circuit breaker prevents overwhelming failed services
4. **Kubernetes Integration** - Works with K8s orchestration patterns
5. **Observability** - Structured logging for monitoring
6. **Graceful Degradation** - Proper error responses to clients

## Monitoring

Key metrics to monitor:
- Health check response times
- Database connection pool stats
- Circuit breaker state changes
- Reconnection attempt frequency
- Error rates and patterns

This resilience system ensures that the gateway-node service can handle database failures gracefully and recover automatically when services are restored.