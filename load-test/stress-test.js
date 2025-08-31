#!/usr/bin/env node

const LoadTester = require('./load-test')
const axios = require('axios')

// Stress Test Configuration
const STRESS_CONFIG = {
  baseUrl: 'http://localhost:3000',
  wsUrl: 'ws://localhost:4000',
  phases: [
    { name: 'Warmup', concurrent: 10, duration: 30 },
    { name: 'Ramp Up', concurrent: 50, duration: 60 },
    { name: 'Peak Load', concurrent: 100, duration: 120 },
    { name: 'Spike Test', concurrent: 200, duration: 30 },
    { name: 'Cool Down', concurrent: 25, duration: 60 }
  ],
  testUser: {
    email: 'stresstest@example.com',
    password: 'stresspassword123'
  }
}

class StressTester extends LoadTester {
  constructor() {
    super()
    this.phaseResults = []
    this.overallStats = {
      totalRequests: 0,
      totalErrors: 0,
      totalWSConnections: 0,
      maxLatency: 0,
      avgThroughput: 0
    }
  }

  async runStressTest() {
    console.log('🔥 Starting Stress Test Suite...')
    console.log(`📋 ${STRESS_CONFIG.phases.length} phases planned`)
    
    await this.createTestUser()

    for (let i = 0; i < STRESS_CONFIG.phases.length; i++) {
      const phase = STRESS_CONFIG.phases[i]
      console.log(`\n🚀 Phase ${i + 1}: ${phase.name}`)
      console.log(`   Concurrent: ${phase.concurrent}, Duration: ${phase.duration}s`)
      
      const result = await this.runPhase(phase)
      this.phaseResults.push({ phase: phase.name, ...result })
      
      // Brief pause between phases
      if (i < STRESS_CONFIG.phases.length - 1) {
        console.log('⏳ Cooling down for 10 seconds...')
        await new Promise(resolve => setTimeout(resolve, 10000))
      }
    }

    this.generateStressReport()
  }

  async runPhase(phase) {
    // Update config for this phase
    const originalConfig = { ...CONFIG }
    CONFIG.concurrent = phase.concurrent
    CONFIG.duration = phase.duration

    const startTime = Date.now()

    try {
      // Run HTTP load test for this phase
      const httpResult = await this.runHttpLoadTest()
      
      // Also test WebSocket connections (limited to prevent overwhelming)
      const wsConnections = Math.min(phase.concurrent, 50)
      await this.runLimitedWebSocketTest(wsConnections)

      const endTime = Date.now()
      const phaseDuration = (endTime - startTime) / 1000

      const result = {
        duration: phaseDuration,
        requests: httpResult.requests.total,
        errors: httpResult.errors,
        avgLatency: httpResult.latency.average,
        maxLatency: httpResult.latency.max,
        throughput: httpResult.throughput.average,
        wsConnections: this.stats.wsConnections
      }

      // Update overall stats
      this.overallStats.totalRequests += result.requests
      this.overallStats.totalErrors += result.errors
      this.overallStats.totalWSConnections += result.wsConnections
      this.overallStats.maxLatency = Math.max(this.overallStats.maxLatency, result.maxLatency)

      console.log(`✅ Phase completed: ${result.requests} requests, ${result.errors} errors`)
      
      // Reset stats for next phase
      this.stats = {
        requests: 0,
        errors: 0,
        wsConnections: 0,
        wsErrors: 0
      }
      this.wsConnections = []

      return result
    } finally {
      // Restore original config
      Object.assign(CONFIG, originalConfig)
    }
  }

  async runLimitedWebSocketTest(maxConnections) {
    console.log(`🔌 Testing ${maxConnections} WebSocket connections...`)
    
    const promises = []
    for (let i = 0; i < maxConnections; i++) {
      promises.push(this.createWebSocketConnection(i))
      
      // Stagger connections
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    await Promise.allSettled(promises)
    
    // Brief activity simulation
    if (this.wsConnections.length > 0) {
      await this.simulateBriefWSActivity()
    }

    // Close connections
    this.wsConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    })
  }

  async simulateBriefWSActivity() {
    const activeConnections = this.wsConnections.filter(ws => ws.readyState === WebSocket.OPEN)
    
    // Send a few test messages
    for (let i = 0; i < 3; i++) {
      const sampleSize = Math.min(5, activeConnections.length)
      for (let j = 0; j < sampleSize; j++) {
        const randomWs = activeConnections[Math.floor(Math.random() * activeConnections.length)]
        randomWs.send(JSON.stringify({
          type: 'subscribe',
          taskId: `stress-task-${Date.now()}-${j}`
        }))
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  generateStressReport() {
    console.log('\n📊 STRESS TEST REPORT')
    console.log('=' .repeat(50))
    
    console.log('\n🔍 Phase Results:')
    this.phaseResults.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.phase}:`)
      console.log(`   Requests: ${result.requests}`)
      console.log(`   Errors: ${result.errors} (${((result.errors / result.requests) * 100).toFixed(2)}%)`)
      console.log(`   Avg Latency: ${result.avgLatency.toFixed(2)}ms`)
      console.log(`   Max Latency: ${result.maxLatency}ms`)
      console.log(`   Throughput: ${result.throughput.toFixed(2)} req/sec`)
      console.log(`   WS Connections: ${result.wsConnections}`)
    })

    // Calculate overall averages
    const totalDuration = this.phaseResults.reduce((sum, r) => sum + r.duration, 0)
    const avgThroughput = this.overallStats.totalRequests / totalDuration

    console.log('\n📈 Overall Summary:')
    console.log(`   Total Requests: ${this.overallStats.totalRequests}`)
    console.log(`   Total Errors: ${this.overallStats.totalErrors}`)
    console.log(`   Error Rate: ${((this.overallStats.totalErrors / this.overallStats.totalRequests) * 100).toFixed(2)}%`)
    console.log(`   Max Latency: ${this.overallStats.maxLatency}ms`)
    console.log(`   Average Throughput: ${avgThroughput.toFixed(2)} req/sec`)
    console.log(`   Total WS Connections: ${this.overallStats.totalWSConnections}`)

    // Performance assessment
    console.log('\n🎯 Performance Assessment:')
    const errorRate = (this.overallStats.totalErrors / this.overallStats.totalRequests) * 100
    
    if (errorRate < 1) {
      console.log('   ✅ EXCELLENT: Error rate under 1%')
    } else if (errorRate < 5) {
      console.log('   ⚠️  GOOD: Error rate under 5%')
    } else {
      console.log('   ❌ NEEDS IMPROVEMENT: High error rate')
    }

    if (this.overallStats.maxLatency < 1000) {
      console.log('   ✅ EXCELLENT: Max latency under 1 second')
    } else if (this.overallStats.maxLatency < 5000) {
      console.log('   ⚠️  ACCEPTABLE: Max latency under 5 seconds')
    } else {
      console.log('   ❌ SLOW: High latency detected')
    }

    if (avgThroughput > 100) {
      console.log('   ✅ EXCELLENT: High throughput achieved')
    } else if (avgThroughput > 50) {
      console.log('   ⚠️  GOOD: Moderate throughput')
    } else {
      console.log('   ❌ LOW: Throughput needs improvement')
    }

    // Save report to file
    this.saveReportToFile()
  }

  saveReportToFile() {
    const fs = require('fs')
    const reportData = {
      timestamp: new Date().toISOString(),
      phases: this.phaseResults,
      overall: this.overallStats,
      config: STRESS_CONFIG
    }

    const fileName = `stress-test-report-${Date.now()}.json`
    fs.writeFileSync(fileName, JSON.stringify(reportData, null, 2))
    console.log(`\n💾 Report saved to: ${fileName}`)
  }

  async createTestUser() {
    try {
      await axios.post(`${STRESS_CONFIG.baseUrl}/auth/signup`, STRESS_CONFIG.testUser)
      console.log('✅ Stress test user created')
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('✅ Stress test user already exists')
      } else {
        console.log('❌ Failed to create stress test user:', error.message)
      }
    }

    // Update base config with stress test user
    CONFIG.testUser = STRESS_CONFIG.testUser
  }
}

async function main() {
  const stressTester = new StressTester()
  
  try {
    await stressTester.runStressTest()
  } catch (error) {
    console.error('❌ Stress test failed:', error.message)
    process.exit(1)
  } finally {
    await stressTester.cleanup()
    console.log('✅ Stress test completed')
    process.exit(0)
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

if (require.main === module) {
  main()
}