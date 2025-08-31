# TaskForge Load Testing Suite

Comprehensive load testing for TaskForge services including HTTP APIs and WebSocket connections.

## Installation

```bash
cd load-test
npm install
```

## Usage

### Basic Load Tests

```bash
# Run combined HTTP + WebSocket test
npm test

# HTTP API load test only
npm run test:http

# WebSocket connections test only  
npm run test:ws

# Full stress test suite
npm run stress
```

## Test Types

### 1. HTTP Load Test
- Tests authenticated API endpoints
- Automatic token refresh handling
- Concurrent request simulation
- Metrics collection

### 2. WebSocket Load Test  
- Multiple concurrent WebSocket connections
- Real-time message simulation
- Connection stability testing
- Activity pattern simulation

### 3. Stress Test Suite
- Multi-phase testing (warmup → peak → spike → cooldown)
- Performance assessment
- Detailed reporting
- JSON report generation

## Configuration

Edit the configuration in `load-test.js`:

```javascript
const CONFIG = {
  baseUrl: 'http://localhost:3000',      // API base URL
  wsUrl: 'ws://localhost:4000',          // WebSocket URL
  testUsers: {
    count: 20,                           // Number of test users to create
    emailPrefix: 'loadtest',             // Email prefix (loadtest1@example.com)
    emailDomain: 'example.com',          // Email domain
    password: 'testpassword123'          // Shared password for all test users
  },
  concurrent: 50,                        // Concurrent connections
  duration: 60,                          // Test duration (seconds)
  warmup: 10,                           // Warmup duration (seconds)
}
```

## Endpoints Tested

### Authentication & Health
- `GET /health` - Health check
- `POST /auth/login` - Authentication
- `POST /auth/refresh` - Token refresh
- `GET /metrics` - Metrics endpoint

### Task Creation (All Service Types)
- `POST /tasks` with `type: "generate-pdf"` - PDF generation tasks
  - Random URLs: AWS docs, MDN, Node.js docs, etc.
- `POST /tasks` with `type: "compress-video"` - Video compression tasks
  - Sample videos: Big Buck Bunny, Elephant's Dream, etc.
  - Random bitrates: 500k-2000k
  - Various presets: fast, medium, slow, etc.
- `POST /tasks` with `type: "resize-image"` - Image resizing tasks
  - Unsplash stock photos for testing
  - Random dimensions: 200x150 to 1200x900

### WebSocket Testing  
- WebSocket connections on port 4000
- Task subscription messages: `{"type": "subscribe", "taskId": "uuid"}`
- Real-time status updates from task processing
- Uses actual task IDs from HTTP responses when available

## Features

### Multi-User Authentication
- **20 test users** created automatically (loadtest1@example.com - loadtest20@example.com)
- **Round-robin user assignment** for WebSocket connections
- **Random user selection** for HTTP requests  
- **JWT token management** per user
- **Automatic token refresh** before expiration
- **Parallel authentication** for faster startup
- **Session cleanup** for all users

### WebSocket Testing
- Concurrent connection simulation
- Message broadcasting testing
- Connection stability monitoring
- Graceful disconnection

### Reporting
- Real-time console output
- Detailed performance metrics
- Error tracking and reporting
- JSON report export for stress tests

## Sample Output

```
🔧 Creating 20 test users...
✅ 20 test users ready
🚀 Starting HTTP Load Test...
🔑 Pre-authenticating users...
📊 HTTP Load Test Results:
Requests: 3000
Errors: 5
Avg Latency: 45ms
Max Latency: 250ms
Throughput: 95.2 req/sec

🔌 Starting WebSocket Load Test...
📱 Client 0 (loadtest1@example.com) connected
📱 Client 1 (loadtest2@example.com) connected
...
✅ Created 50 WebSocket connections
📊 WebSocket Test Results:
Connections: 50
Subscriptions Sent: 150
WS Errors: 0

🏁 Combined Test Complete!
Test Users: 20
Total HTTP Requests: 3000
Tasks Created: 450
WebSocket Connections: 50
Task Subscriptions: 150
Auth Failures: 0
Total Errors: 5
```

## Stress Test Phases

1. **Warmup** (10 concurrent, 30s) - System warming
2. **Ramp Up** (50 concurrent, 60s) - Gradual load increase  
3. **Peak Load** (100 concurrent, 120s) - Sustained high load
4. **Spike Test** (200 concurrent, 30s) - Traffic spike simulation
5. **Cool Down** (25 concurrent, 60s) - Load reduction

## Performance Thresholds

### ✅ Excellent
- Error rate < 1%
- Max latency < 1000ms  
- Throughput > 100 req/sec

### ⚠️ Good/Acceptable
- Error rate < 5%
- Max latency < 5000ms
- Throughput > 50 req/sec

### ❌ Needs Improvement
- Error rate ≥ 5%
- Max latency ≥ 5000ms
- Throughput ≤ 50 req/sec

## Advanced Usage

### Custom Test Duration
```bash
# Modify CONFIG.duration in load-test.js
node load-test.js combined
```

### Debug Mode
```bash
# Add console logging for debugging
DEBUG=* node load-test.js
```

### Performance Profiling
```bash
# Install clinic for advanced profiling
npm install -g clinic
clinic doctor -- node load-test.js
```

## Troubleshooting

### Connection Refused
- Ensure services are running on correct ports
- Check firewall settings
- Verify URLs in configuration

### Authentication Failures
- Verify test user credentials
- Check if user already exists with different password
- Ensure auth endpoints are accessible

### WebSocket Issues
- Verify WebSocket server is running
- Check token format for WS authentication
- Monitor connection limits

## Reports

Stress test reports are saved as `stress-test-report-[timestamp].json` with:
- Phase-by-phase results
- Overall performance summary
- Configuration used
- Performance assessment

Perfect for:
- Performance regression testing
- Capacity planning
- Interview demonstrations
- Production readiness assessment