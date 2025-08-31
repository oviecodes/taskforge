#!/usr/bin/env node

const autocannon = require("autocannon")
const WebSocket = require("ws")
const axios = require("axios")

// Configuration
const CONFIG = {
  baseUrl: "http://localhost:3000",
  wsUrl: "ws://localhost:4000",
  testUsers: {
    count: 20, // Number of test users to create
    emailPrefix: "loadtest",
    emailDomain: "example.com",
    password: "testpassword123",
  },
  concurrent: 20,
  duration: 60, // seconds
  warmup: 10, // seconds
}

class LoadTester {
  constructor() {
    this.tokens = new Map()
    this.wsConnections = []
    this.createdTasks = [] // Track task IDs for WebSocket subscriptions
    this.testUsers = [] // List of created test users
    this.userPool = [] // Available users for round-robin assignment
    this.stats = {
      requests: 0,
      errors: 0,
      wsConnections: 0,
      wsErrors: 0,
      tasksCreated: 0,
      subscriptions: 0,
      usersCreated: 0,
      authFailures: 0,
    }
  }

  async createTestUsers() {
    console.log(`🔧 Creating ${CONFIG.testUsers.count} test users...`)

    const creationPromises = []

    for (let i = 1; i <= CONFIG.testUsers.count; i++) {
      const email = `${CONFIG.testUsers.emailPrefix}${i}@${CONFIG.testUsers.emailDomain}`
      const user = {
        email,
        password: CONFIG.testUsers.password,
        id: `user-${i}`,
      }

      this.testUsers.push(user)
      this.userPool.push(user)

      // Create user account
      creationPromises.push(
        this.createSingleUser(user).catch((error) => {
          if (error.response?.status !== 409) {
            // Ignore "already exists"
            console.log(`⚠️  Failed to create ${email}:`, error.message)
          }
        })
      )
    }

    await Promise.all(creationPromises)
    console.log(`✅ ${CONFIG.testUsers.count} test users ready`)
  }

  async createSingleUser(user) {
    try {
      await axios.post(`${CONFIG.baseUrl}/auth/signup`, {
        email: user.email,
        password: user.password,
      })
      this.stats.usersCreated++
    } catch (error) {
      if (error.response?.status === 409) {
        // User already exists, that's fine
        this.stats.usersCreated++
      } else {
        throw error
      }
    }
  }

  async getAuthTokens(user) {
    try {
      const response = await axios.post(`${CONFIG.baseUrl}/auth/login`, {
        email: user.email,
        password: user.password,
      })
      const { accessToken, refreshToken } = response.data

      this.tokens.set(user.id, {
        accessToken,
        refreshToken,
        expiresAt: Date.now() + 14 * 60 * 1000, // 14 minutes (token expires in 15)
        user: user,
      })
      return { accessToken, refreshToken }
    } catch (error) {
      this.stats.authFailures++
      console.error(
        `❌ Auth failed for ${user.email}:`,
        error.response?.data || error.message
      )
      throw error
    }
  }

  async refreshToken(userId) {
    const tokenData = this.tokens.get(userId)
    if (!tokenData?.refreshToken) {
      throw new Error("No refresh token available")
    }

    try {
      const response = await axios.post(`${CONFIG.baseUrl}/auth/refresh`, {
        refreshToken: tokenData.refreshToken,
      })

      const { accessToken, refreshToken } = response.data

      this.tokens.set(userId, {
        ...tokenData,
        accessToken,
        refreshToken,
        expiresAt: Date.now() + 14 * 60 * 1000,
      })

      return { accessToken, refreshToken }
    } catch (error) {
      console.error(
        `❌ Token refresh failed for ${userId}:`,
        error.response?.data || error.message
      )
      // Re-authenticate if refresh fails
      return this.getAuthTokens(tokenData.user)
    }
  }

  async getValidToken(user) {
    const userId = typeof user === "string" ? user : user.id
    const tokenData = this.tokens.get(userId)

    if (!tokenData || Date.now() > tokenData.expiresAt) {
      if (tokenData?.refreshToken) {
        await this.refreshToken(userId)
      } else {
        const userObj =
          typeof user === "object"
            ? user
            : this.testUsers.find((u) => u.id === userId)
        if (!userObj) {
          throw new Error(`User not found: ${userId}`)
        }
        await this.getAuthTokens(userObj)
      }
    }

    return this.tokens.get(userId).accessToken
  }

  // Get a random user from the pool
  getRandomUser() {
    if (this.userPool.length === 0) {
      throw new Error("No users available in pool")
    }
    return this.userPool[Math.floor(Math.random() * this.userPool.length)]
  }

  // Get user by round-robin
  getUserByIndex(index) {
    return this.userPool[index % this.userPool.length]
  }

  // Random test data generators
  getRandomPdfUrl() {
    const urls = [
      "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3.html",
      "https://docs.aws.amazon.com/s3/index.html",
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      "https://nodejs.org/en/docs/",
      "https://reactjs.org/docs/getting-started.html",
      "https://kubernetes.io/docs/concepts/",
      "https://docker.com/get-started",
      "https://github.com/features",
      "https://stackoverflow.com/questions/tagged/javascript",
      "https://www.typescriptlang.org/docs/",
    ]
    return urls[Math.floor(Math.random() * urls.length)]
  }

  getRandomVideoUrl() {
    const videos = [
      "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_2mb.mp4",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    ]
    return videos[Math.floor(Math.random() * videos.length)]
  }

  getRandomImageUrl() {
    const images = [
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f",
      "https://images.unsplash.com/photo-1494790108755-2616b667c7e9",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d",
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80",
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e",
      "https://images.unsplash.com/photo-1554151228-14d9def656e4",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1",
      "https://images.unsplash.com/photo-1531427186611-ecfd6d936c79",
    ]
    return images[Math.floor(Math.random() * images.length)]
  }

  getRandomBitrate() {
    const bitrates = ["500k", "900k", "1200k", "1500k", "2000k"]
    return bitrates[Math.floor(Math.random() * bitrates.length)]
  }

  getRandomPreset() {
    const presets = ["fast", "medium", "slow", "veryfast", "slower"]
    return presets[Math.floor(Math.random() * presets.length)]
  }

  getRandomWidth() {
    const widths = [200, 300, 400, 500, 600, 800, 1000, 1200]
    return widths[Math.floor(Math.random() * widths.length)]
  }

  getRandomHeight() {
    const heights = [150, 200, 300, 400, 500, 600, 800, 900]
    return heights[Math.floor(Math.random() * heights.length)]
  }

  // HTTP Load Testing
  async runHttpLoadTest() {
    console.log("\n🚀 Starting HTTP Load Test...")

    // Pre-authenticate some users for load test
    console.log("🔑 Pre-authenticating users...")
    const preAuthPromises = this.testUsers
      .slice(0, Math.min(10, this.testUsers.length))
      .map((user) =>
        this.getAuthTokens(user).catch((err) => {
          console.log(`⚠️  Pre-auth failed for ${user.email}`)
        })
      )
    await Promise.all(preAuthPromises)

    // Run separate load tests for each endpoint
    const results = await Promise.all([
      // this.runHealthCheckTest(),
      this.runTaskCreationTest("generate-pdf", 30),
      this.runTaskCreationTest("compress-video", 25),
      this.runTaskCreationTest("resize-image", 35),
      // this.runMetricsTest()
    ])

    // Combine results
    const combinedResult = {
      requests: {
        total: results.reduce((sum, r) => sum + r.requests.total, 0),
      },
      errors: results.reduce((sum, r) => sum + r.errors, 0),
      latency: {
        average:
          results.reduce((sum, r) => sum + r.latency.average, 0) /
          results.length,
        max: Math.max(...results.map((r) => r.latency.max)),
      },
      // Calculate overall throughput as total requests / test duration
      throughput: {
        average:
          results.reduce((sum, r) => sum + r.requests.total, 0) /
          CONFIG.duration,
      },
    }

    console.log("\n📊 Combined HTTP Load Test Results:")
    console.log(`Total Requests: ${combinedResult.requests.total}`)
    console.log(`Total Errors: ${combinedResult.errors}`)
    console.log(`Avg Latency: ${combinedResult.latency.average.toFixed(2)}ms`)
    console.log(`Max Latency: ${combinedResult.latency.max}ms`)
    console.log(
      `Overall Throughput: ${combinedResult.throughput.average.toFixed(
        2
      )} req/sec`
    )

    return combinedResult
  }

  async runHealthCheckTest() {
    console.log("🏥 Running health check test...")
    const instance = autocannon({
      url: `${CONFIG.baseUrl}/health`,
      connections: Math.floor(CONFIG.concurrent * 0.1), // 10% of connections
      duration: CONFIG.duration,
      method: "GET",
    })

    return new Promise((resolve) => {
      instance.on("done", (result) => {
        console.log(`✅ Health check: ${result.requests.total} requests`)
        resolve(result)
      })
    })
  }

  async runTaskCreationTest(taskType, weight) {
    console.log(`📝 Running ${taskType} task creation test...`)

    // Get a valid token before starting the test
    const user = this.getRandomUser()
    const tokenData = this.tokens.get(user.id)

    if (!tokenData || Date.now() > tokenData.expiresAt) {
      console.log(`🔄 Refreshing token for ${user.id}`)
      await this.getAuthTokens(user)
    }

    const validToken = this.tokens.get(user.id)

    const connections = Math.floor(CONFIG.concurrent * (weight / 100))
    const instance = autocannon({
      url: `${CONFIG.baseUrl}/tasks`,
      connections: Math.max(1, connections),
      duration: CONFIG.duration,
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${validToken.accessToken}`,
      },
      body: JSON.stringify(this.getTaskPayload(taskType)),
    })

    instance.on("response", (client, statusCode, resBytes, responseTime) => {
      this.stats.requests++
      if (statusCode >= 400) {
        this.stats.errors++
      } else if (statusCode === 201) {
        this.stats.tasksCreated++
        try {
          const responseBody = resBytes.toString()
          const data = JSON.parse(responseBody)
          if (data.taskId || data.id) {
            this.createdTasks.push(data.taskId || data.id)
            if (this.createdTasks.length > 100) {
              this.createdTasks.shift()
            }
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    })

    return new Promise((resolve) => {
      instance.on("done", (result) => {
        console.log(`✅ ${taskType}: ${result.requests.total} requests`)
        resolve(result)
      })
    })
  }

  async runMetricsTest() {
    console.log("📊 Running metrics endpoint test...")
    const instance = autocannon({
      url: `${CONFIG.baseUrl}/metrics`,
      connections: Math.floor(CONFIG.concurrent * 0.05), // 5% of connections
      duration: CONFIG.duration,
      method: "GET",
    })

    return new Promise((resolve) => {
      instance.on("done", (result) => {
        console.log(`✅ Metrics: ${result.requests.total} requests`)
        resolve(result)
      })
    })
  }

  getTaskPayload(taskType) {
    switch (taskType) {
      case "generate-pdf":
        return {
          type: "generate-pdf",
          payload: {
            url: this.getRandomPdfUrl(),
          },
        }
      case "compress-video":
        return {
          type: "compress-video",
          payload: {
            videoUrl: this.getRandomVideoUrl(),
            format: "mp4",
            bitrate: this.getRandomBitrate(),
            preset: this.getRandomPreset(),
          },
        }
      case "resize-image":
        return {
          type: "resize-image",
          payload: {
            imageUrl: this.getRandomImageUrl(),
            width: this.getRandomWidth(),
            height: this.getRandomHeight(),
          },
        }
      default:
        throw new Error(`Unknown task type: ${taskType}`)
    }
  }

  // WebSocket Load Testing
  async runWebSocketLoadTest() {
    console.log("\n🔌 Starting WebSocket Load Test...")

    const promises = []
    const connectionCount = Math.min(CONFIG.concurrent, 100) // Limit WS connections

    for (let i = 0; i < connectionCount; i++) {
      promises.push(this.createWebSocketConnection(i))

      // Stagger connections to avoid overwhelming
      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    console.log("here we go!!!!")

    // Wait for all connections
    await Promise.allSettled(promises)
    console.log(`✅ Created ${this.wsConnections.length} WebSocket connections`)

    // Keep connections alive and send messages
    await this.simulateWebSocketActivity()

    // Close all connections
    this.wsConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    })

    console.log("\n📊 WebSocket Test Results:")
    console.log(`Connections: ${this.stats.wsConnections}`)
    console.log(`Subscriptions Sent: ${this.stats.subscriptions}`)
    console.log(`WS Errors: ${this.stats.wsErrors}`)
    console.log(`Task IDs Tracked: ${this.createdTasks.length}`)
  }

  async createWebSocketConnection(clientId) {
    try {
      const user = this.getUserByIndex(clientId)
      const token = await this.getValidToken(user)
      const ws = new WebSocket(
        `${CONFIG.wsUrl}?token=${encodeURIComponent(token)}`
      )

      return new Promise((resolve) => {
        ws.on("open", () => {
          this.stats.wsConnections++
          this.wsConnections.push(ws)
          console.log(`📱 Client ${clientId} (${user.email}) connected`)

          resolve(ws)
        })

        ws.on("message", (data) => {
          try {
            const message = JSON.parse(data)
            console.log(
              `📨 Client ${clientId} received:`,
              message.taskId || "ping"
            )
          } catch (e) {
            // Handle non-JSON messages
            console.log(e)
          }
        })

        ws.on("error", (error) => {
          this.stats.wsErrors++
          console.error(`❌ WS Error for client ${clientId}:`, error.message)
          resolve(null)
        })

        ws.on("close", () => {
          console.log(`❌ Client ${clientId} disconnected`)
        })

        // Timeout after 10 seconds
        setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.terminate()
            this.stats.wsErrors++
            resolve(null)
          }
        }, 10000)
      })
    } catch (error) {
      this.stats.wsErrors++
      console.error(
        `❌ Failed to create WS connection ${clientId}:`,
        error.message
      )
      return null
    }
  }

  async simulateWebSocketActivity() {
    console.log("🎬 Simulating WebSocket activity for 30 seconds...")

    const activityDuration = 30000 // 30 seconds
    const interval = 2000 // Send message every 2 seconds

    let count = 0
    const timer = setInterval(() => {
      // Send subscription messages from random clients
      const activeConnections = this.wsConnections.filter(
        (ws) => ws.readyState === WebSocket.OPEN
      )

      if (activeConnections.length === 0) {
        clearInterval(timer)
        return
      }

      // Random sample of connections to send messages
      const sampleSize = Math.min(10, activeConnections.length)
      for (let i = 0; i < sampleSize; i++) {
        const randomWs =
          activeConnections[
            Math.floor(Math.random() * activeConnections.length)
          ]

        // Use real task ID if available, otherwise generate one
        let taskId
        if (this.createdTasks.length > 0) {
          taskId =
            this.createdTasks[
              Math.floor(Math.random() * this.createdTasks.length)
            ]
        } else {
          // Generate realistic UUID-like task ID
          taskId = `${Math.random().toString(36).substr(2, 8)}-${Math.random()
            .toString(36)
            .substr(2, 4)}-${Math.random()
            .toString(36)
            .substr(2, 4)}-${Math.random()
            .toString(36)
            .substr(2, 4)}-${Math.random().toString(36).substr(2, 12)}`
        }

        const subscriptionMessage = {
          type: "subscribe",
          taskId: taskId,
        }

        randomWs.send(JSON.stringify(subscriptionMessage))
        this.stats.subscriptions++
      }

      count++
      console.log(
        `📡 Sent ${sampleSize} subscription messages (round ${count}) - Total subscriptions: ${this.stats.subscriptions}`
      )

      if (count * interval >= activityDuration) {
        clearInterval(timer)
      }
    }, interval)

    return new Promise((resolve) => {
      setTimeout(resolve, activityDuration + 1000)
    })
  }

  async runCombinedLoadTest() {
    console.log("🎯 Starting Combined Load Test (HTTP + WebSocket)...")

    // Start both tests concurrently
    const [httpResult] = await Promise.all([
      this.runHttpLoadTest(),
      this.runWebSocketLoadTest(),
    ])

    console.log("\n🏁 Combined Test Complete!")
    console.log(`Test Users: ${this.stats.usersCreated}`)
    console.log(`Total HTTP Requests: ${httpResult.requests.total}`)
    console.log(`Tasks Created: ${this.stats.tasksCreated}`)
    console.log(`WebSocket Connections: ${this.stats.wsConnections}`)
    console.log(`Task Subscriptions: ${this.stats.subscriptions}`)
    console.log(`Auth Failures: ${this.stats.authFailures}`)
    console.log(
      `Total Errors: ${
        httpResult.errors + this.stats.wsErrors + this.stats.authFailures
      }`
    )
  }

  async cleanup() {
    console.log("🧹 Cleaning up...")

    // Close WebSocket connections
    this.wsConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    })

    // Logout test users
    console.log("🔐 Logging out test users...")
    const logoutPromises = []

    for (const [userId, tokenData] of this.tokens) {
      logoutPromises.push(
        axios
          .post(
            `${CONFIG.baseUrl}/auth/logout`,
            {},
            {
              headers: { authorization: `Bearer ${tokenData.accessToken}` },
            }
          )
          .catch((error) => {
            // Ignore logout errors
          })
      )
    }

    await Promise.allSettled(logoutPromises)
    console.log(`✅ Logged out ${this.tokens.size} users`)
  }
}

// Main execution
async function main() {
  const testType = process.argv[2] || "combined"
  const tester = new LoadTester()

  try {
    // Setup
    console.log("🔧 Setting up load test...")
    await tester.createTestUsers()

    // Run tests based on argument
    switch (testType) {
      case "http":
        await tester.runHttpLoadTest()
        break
      case "ws":
      case "websocket":
        await tester.runWebSocketLoadTest()
        break
      case "combined":
      default:
        await tester.runCombinedLoadTest()
        break
    }
  } catch (error) {
    console.error("❌ Load test failed:", error.message)
    process.exit(1)
  } finally {
    await tester.cleanup()
    console.log("✅ Load test completed")
    process.exit(0)
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...")
  // tear down test users
  await axios.post(`${CONFIG.baseUrl}/auth/remove-test-users`, {})
  process.exit(0)
})

if (require.main === module) {
  main()
}

module.exports = LoadTester
