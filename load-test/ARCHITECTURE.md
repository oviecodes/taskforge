# TaskForge Load Testing Architecture

## Overview

This document details the technical architecture, design decisions, and implementation strategies behind the TaskForge load testing suite. The system is designed to simulate realistic multi-user scenarios while providing comprehensive performance metrics for both HTTP APIs and WebSocket connections.

## Table of Contents

- [System Architecture](#system-architecture)
- [Design Patterns](#design-patterns)
- [User Management Strategy](#user-management-strategy)
- [Authentication Flow](#authentication-flow)
- [Load Testing Strategies](#load-testing-strategies)
- [WebSocket Testing Architecture](#websocket-testing-architecture)
- [Metrics Collection](#metrics-collection)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)
- [Scalability Design](#scalability-design)

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Load Testing Suite                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  LoadTester     │  │  StressTester   │  │  Configuration  │  │
│  │  (Main Engine)  │  │  (Multi-phase)  │  │  Management     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  User Pool      │  │  Token Manager  │  │  Connection     │  │
│  │  Management     │  │                 │  │  Pool           │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  HTTP Testing   │  │  WebSocket      │  │  Metrics        │  │
│  │  (Autocannon)   │  │  Testing        │  │  Collection     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Target System                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Gateway Node   │  │  Status Gateway │  │  Task Processor │  │
│  │  (HTTP API)     │  │  (WebSocket)    │  │  Services       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  PostgreSQL     │  │  RabbitMQ       │  │  Redis          │  │
│  │  Database       │  │  Message Queue  │  │  Cache/Session  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

#### LoadTester Class
The main orchestrator that manages the entire testing process:

```javascript
class LoadTester {
  constructor() {
    this.tokens = new Map()          // User authentication tokens
    this.wsConnections = []          // Active WebSocket connections
    this.createdTasks = []           // Track task IDs for subscriptions
    this.testUsers = []              // Pool of test users
    this.userPool = []               // Available users for assignment
    this.stats = { /* metrics */ }   // Performance statistics
  }
}
```

**Key Responsibilities:**
- User lifecycle management (creation, authentication, cleanup)
- Token management and refresh handling
- Test orchestration and coordination
- Metrics collection and aggregation
- Resource cleanup and error recovery

---

## Design Patterns

### 1. Factory Pattern - User Creation

```javascript
async createTestUsers() {
  for (let i = 1; i <= CONFIG.testUsers.count; i++) {
    const email = `${CONFIG.testUsers.emailPrefix}${i}@${CONFIG.testUsers.emailDomain}`
    const user = {
      email,
      password: CONFIG.testUsers.password,
      id: `user-${i}`
    }
    // Factory creates standardized user objects
  }
}
```

**Why Factory Pattern:**
- Ensures consistent user object structure
- Centralizes user creation logic
- Easy to modify user attributes globally
- Supports different user types in future

### 2. Strategy Pattern - User Assignment

```javascript
// Strategy 1: Random selection for HTTP requests
getRandomUser() {
  return this.userPool[Math.floor(Math.random() * this.userPool.length)]
}

// Strategy 2: Round-robin for WebSocket connections  
getUserByIndex(index) {
  return this.userPool[index % this.userPool.length]
}
```

**Why Strategy Pattern:**
- Different assignment strategies for different test types
- HTTP tests benefit from randomness (realistic user behavior)
- WebSocket tests benefit from even distribution (connection stability)
- Easy to add new assignment strategies

### 3. Observer Pattern - Event Handling

```javascript
ws.on('open', () => {
  this.stats.wsConnections++
  console.log(`📱 Client ${clientId} (${user.email}) connected`)
})

ws.on('message', (data) => {
  const message = JSON.parse(data)
  // Handle task status updates
})
```

**Why Observer Pattern:**
- Decoupled event handling
- Easy to add new event types
- Clean separation of concerns
- Supports multiple event listeners

---

## User Management Strategy

### Multi-User Architecture

#### User Pool Design
```
User Pool (20 users)
├── loadtest1@example.com  (user-1)
├── loadtest2@example.com  (user-2)  
├── ...
└── loadtest20@example.com (user-20)

Usage Patterns:
├── HTTP Requests → Random User Selection
├── WebSocket Conn → Round-Robin Assignment  
└── Task Subscriptions → User-Specific Task IDs
```

#### User Lifecycle Management

1. **Creation Phase** (Parallel)
```javascript
const creationPromises = users.map(user => 
  this.createSingleUser(user).catch(handleError)
)
await Promise.all(creationPromises)
```

2. **Authentication Phase** (Batch)
```javascript
const preAuthPromises = users.slice(0, 10).map(user => 
  this.getAuthTokens(user).catch(logError)
)
```

3. **Token Management** (Per-User)
```javascript
this.tokens.set(user.id, {
  accessToken,
  refreshToken,
  expiresAt: Date.now() + (14 * 60 * 1000),
  user: user  // Keep user reference for refresh
})
```

4. **Cleanup Phase** (Parallel Logout)
```javascript
const logoutPromises = Array.from(this.tokens.values()).map(tokenData =>
  axios.post('/auth/logout', {}, {
    headers: { authorization: `Bearer ${tokenData.accessToken}` }
  })
)
```

### Benefits of Multi-User Design

1. **Realistic Testing:**
   - User isolation testing
   - Database query distribution
   - Session management under load
   - Concurrent user scenarios

2. **Performance Insights:**
   - Per-user resource usage
   - Authentication bottlenecks
   - Session handling capabilities
   - User-specific error patterns

3. **Security Validation:**
   - User data isolation
   - Token management security
   - Session hijacking prevention
   - Authorization under load

---

## Authentication Flow

### Token Management Architecture

```
Authentication Flow:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Login    │───▶│  Token Storage  │───▶│  Token Usage    │
│                 │    │                 │    │                 │
│ POST /auth/login│    │ Map<userId,     │    │ Authorization   │
│ {email,password}│    │   tokenData>    │    │ Header          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Token Response  │    │ Expiry Tracking │    │ Automatic       │
│                 │    │                 │    │ Refresh         │
│ {accessToken,   │    │ expiresAt:      │    │                 │
│  refreshToken}  │    │ timestamp       │    │ POST /auth/     │
└─────────────────┘    └─────────────────┘    │ refresh         │
                                              └─────────────────┘
```

### Token Refresh Strategy

```javascript
async getValidToken(user) {
  const tokenData = this.tokens.get(userId)
  
  // Check if token is expired or missing
  if (!tokenData || Date.now() > tokenData.expiresAt) {
    if (tokenData?.refreshToken) {
      await this.refreshToken(userId)  // Try refresh first
    } else {
      await this.getAuthTokens(userObj) // Re-authenticate
    }
  }
  
  return this.tokens.get(userId).accessToken
}
```

**Key Design Decisions:**

1. **Proactive Refresh:** Check expiry before each request
2. **Graceful Degradation:** Fall back to re-auth if refresh fails
3. **Per-User Tracking:** Individual token state per user
4. **Memory Efficiency:** Store minimal token data

---

## Load Testing Strategies

### HTTP Load Testing (Autocannon)

#### Request Distribution Strategy

```javascript
const requests = [
  { method: 'GET', path: '/health', weight: 10 },
  { method: 'POST', path: '/tasks', setupRequest: generatePdfTask, weight: 30 },
  { method: 'POST', path: '/tasks', setupRequest: compressVideoTask, weight: 25 },
  { method: 'POST', path: '/tasks', setupRequest: resizeImageTask, weight: 35 },
  { method: 'GET', path: '/metrics', weight: 5 }
]
```

**Weight-Based Distribution Logic:**
- Higher weight = More frequent requests
- Mimics real-world usage patterns
- Adjustable based on actual application metrics
- Total weight = 100% of test traffic

#### Dynamic Request Generation

```javascript
setupRequest: async (req) => {
  const user = this.getRandomUser()           // Random user selection
  const token = await this.getValidToken(user) // Fresh token
  req.headers.authorization = `Bearer ${token}`
  req.body = JSON.stringify({
    type: 'generate-pdf',
    payload: { url: this.getRandomPdfUrl() }   // Random test data
  })
  return req
}
```

**Benefits:**
- Each request uses different user credentials
- Real authentication flow testing
- Dynamic payload generation
- Realistic API usage simulation

### WebSocket Testing Architecture

#### Connection Management Strategy

```javascript
Connection Distribution:
User Pool (20 users) → WebSocket Connections (50)
├── loadtest1@example.com → Connections 0, 20, 40
├── loadtest2@example.com → Connections 1, 21, 41  
├── loadtest3@example.com → Connections 2, 22, 42
└── ... (round-robin assignment)
```

#### Connection Lifecycle

1. **Establishment Phase**
```javascript
async createWebSocketConnection(clientId) {
  const user = this.getUserByIndex(clientId)      // Round-robin user
  const token = await this.getValidToken(user)    // Valid JWT token
  const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`)
  
  return new Promise((resolve) => {
    ws.on('open', () => {
      this.wsConnections.push(ws)
      resolve(ws)
    })
  })
}
```

2. **Activity Simulation**
```javascript
async simulateWebSocketActivity() {
  const timer = setInterval(() => {
    const activeConnections = this.wsConnections.filter(ws => 
      ws.readyState === WebSocket.OPEN
    )
    
    // Send realistic subscription messages
    for (let i = 0; i < sampleSize; i++) {
      const randomWs = activeConnections[random]
      const taskId = this.createdTasks.length > 0 
        ? this.createdTasks[random]  // Use real task ID
        : generateUUID()             // Fallback UUID
      
      randomWs.send(JSON.stringify({
        type: 'subscribe',
        taskId: taskId
      }))
    }
  }, 2000)
}
```

3. **Message Handling**
```javascript
ws.on('message', (data) => {
  const message = JSON.parse(data)
  // Track task status updates
  console.log(`📨 Status update for ${message.taskId}`)
})
```

**Design Benefits:**
- Realistic user-to-connection mapping
- Proper JWT authentication per connection
- Real task ID usage when available
- Graceful connection management

---

## Metrics Collection

### Performance Metrics Architecture

```javascript
this.stats = {
  // User Management
  usersCreated: 0,        // Successfully created users
  authFailures: 0,        // Authentication failures
  
  // HTTP Testing  
  requests: 0,            // Total HTTP requests sent
  errors: 0,              // HTTP error responses
  tasksCreated: 0,        // Successful task creations
  
  // WebSocket Testing
  wsConnections: 0,       // Successful WS connections
  wsErrors: 0,            // WebSocket errors
  subscriptions: 0,       // Subscription messages sent
}
```

### Real-Time Metrics Collection

#### HTTP Metrics (Autocannon Integration)
```javascript
instance.on('response', (client, statusCode, resBytes, responseTime) => {
  this.stats.requests++
  
  if (statusCode >= 400) {
    this.stats.errors++
  } else if (statusCode === 201) {
    this.stats.tasksCreated++
    
    // Extract task ID from response
    try {
      const data = JSON.parse(resBytes.toString())
      if (data.taskId || data.id) {
        this.createdTasks.push(data.taskId || data.id)
      }
    } catch (e) { /* ignore parse errors */ }
  }
})
```

#### WebSocket Metrics
```javascript
ws.on('open', () => {
  this.stats.wsConnections++
})

ws.on('error', (error) => {
  this.stats.wsErrors++
  console.error(`❌ WS Error: ${error.message}`)
})

// Track subscription messages
randomWs.send(JSON.stringify(subscriptionMessage))
this.stats.subscriptions++
```

### Comprehensive Reporting

```javascript
console.log('\n🏁 Combined Test Complete!')
console.log(`Test Users: ${this.stats.usersCreated}`)
console.log(`Total HTTP Requests: ${httpResult.requests.total}`)
console.log(`Tasks Created: ${this.stats.tasksCreated}`)
console.log(`WebSocket Connections: ${this.stats.wsConnections}`)
console.log(`Task Subscriptions: ${this.stats.subscriptions}`)
console.log(`Auth Failures: ${this.stats.authFailures}`)
console.log(`Total Errors: ${httpResult.errors + this.stats.wsErrors + this.stats.authFailures}`)
```

---

## Error Handling

### Layered Error Handling Strategy

#### 1. User Creation Errors
```javascript
const creationPromises = users.map(user =>
  this.createSingleUser(user).catch(error => {
    if (error.response?.status !== 409) { // Ignore "already exists"
      console.log(`⚠️  Failed to create ${user.email}:`, error.message)
    }
  })
)
```

#### 2. Authentication Errors
```javascript
async getAuthTokens(user) {
  try {
    const response = await axios.post('/auth/login', user)
    return response.data
  } catch (error) {
    this.stats.authFailures++
    console.error(`❌ Auth failed for ${user.email}:`, error.message)
    throw error  // Re-throw for higher-level handling
  }
}
```

#### 3. WebSocket Errors
```javascript
ws.on('error', (error) => {
  this.stats.wsErrors++
  console.error(`❌ WS Error for client ${clientId}:`, error.message)
  resolve(null)  // Return null instead of throwing
})

// Timeout handling
setTimeout(() => {
  if (ws.readyState === WebSocket.CONNECTING) {
    ws.terminate()
    this.stats.wsErrors++
    resolve(null)
  }
}, 10000)
```

#### 4. Cleanup Error Handling
```javascript
const logoutPromises = Array.from(this.tokens.values()).map(tokenData =>
  axios.post('/auth/logout', {}, {
    headers: { authorization: `Bearer ${tokenData.accessToken}` }
  }).catch(error => {
    // Ignore logout errors - they're not critical
  })
)

await Promise.allSettled(logoutPromises)
```

### Error Recovery Strategies

1. **Graceful Degradation:** Continue testing with fewer resources
2. **Automatic Retry:** Re-authenticate on token failures
3. **Isolation:** One user's failure doesn't affect others
4. **Logging:** Comprehensive error tracking for debugging

---

## Performance Considerations

### Memory Management

#### Token Storage Optimization
```javascript
this.tokens.set(user.id, {
  accessToken,      // ~200 bytes
  refreshToken,     // ~200 bytes  
  expiresAt,        // 8 bytes
  user: user        // Reference, not copy
})
```

#### Task ID Management
```javascript
if (this.createdTasks.length > 100) {
  this.createdTasks.shift()  // FIFO cleanup to prevent memory leaks
}
```

### Connection Management

#### Staggered Connection Creation
```javascript
for (let i = 0; i < connectionCount; i++) {
  promises.push(this.createWebSocketConnection(i))
  
  // Stagger connections to avoid overwhelming the server
  if (i % 10 === 0) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}
```

#### Connection Pool Limits
```javascript
const connectionCount = Math.min(CONFIG.concurrent, 100) // Hard limit
```

### Concurrent Operations

#### Parallel User Creation
```javascript
const creationPromises = users.map(user => this.createSingleUser(user))
await Promise.all(creationPromises)  // All users created in parallel
```

#### Batch Authentication
```javascript
const preAuthPromises = users.slice(0, 10).map(user => 
  this.getAuthTokens(user).catch(logError)
)
await Promise.all(preAuthPromises)  // Pre-auth 10 users in parallel
```

---

## Scalability Design

### Horizontal Scaling Considerations

#### User Pool Scaling
```javascript
testUsers: {
  count: 20,                    // Easily configurable
  emailPrefix: 'loadtest',      // Supports multiple prefixes
  emailDomain: 'example.com',   // Domain isolation
  password: 'testpassword123'   // Shared credential strategy
}
```

#### Connection Scaling
```javascript
concurrent: 50,  // Independent of user count
// 50 connections distributed across 20 users
// Average: 2.5 connections per user
```

### Resource Scaling Strategies

1. **User-to-Connection Ratio:** N users support M connections (M > N)
2. **Token Reuse:** Multiple connections per user token
3. **Staggered Startup:** Gradual resource allocation
4. **Memory Bounds:** Fixed-size arrays prevent unbounded growth

### Configuration Flexibility

```javascript
// Development
{ concurrent: 50, duration: 60, users: 20 }

// Staging  
{ concurrent: 100, duration: 300, users: 50 }

// Production
{ concurrent: 200, duration: 600, users: 100 }
```

---

## Implementation Best Practices

### 1. Separation of Concerns
- **LoadTester:** Orchestration and coordination
- **User Management:** Authentication and lifecycle
- **Connection Management:** WebSocket handling
- **Metrics Collection:** Performance tracking

### 2. Async/Await Patterns
```javascript
// Proper async handling
await Promise.all(creationPromises)      // Parallel operations
await Promise.allSettled(cleanupPromises) // Ignore individual failures
```

### 3. Resource Cleanup
```javascript
async cleanup() {
  // Close WebSocket connections
  this.wsConnections.forEach(ws => ws.close())
  
  // Logout all users
  await this.logoutAllUsers()
  
  // Clear data structures
  this.tokens.clear()
  this.wsConnections = []
}
```

### 4. Configuration Management
- Environment-specific configs
- Centralized test data
- Easy parameter tuning
- Runtime configuration validation

---

## Future Enhancements

### Potential Improvements

1. **Advanced Metrics:**
   - Latency percentiles per user
   - Connection stability metrics
   - Task completion tracking

2. **Enhanced User Management:**
   - Different user roles/permissions
   - Dynamic user creation during test
   - User behavior patterns

3. **Intelligent Load Generation:**
   - Adaptive load based on response times
   - Machine learning for realistic patterns
   - Geographic distribution simulation

4. **Integration Improvements:**
   - Prometheus metrics export
   - Real-time dashboard integration
   - Automated performance regression detection

This architecture provides a solid foundation for comprehensive load testing while maintaining flexibility for future enhancements and different testing scenarios.