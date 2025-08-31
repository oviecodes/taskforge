# Managing RabbitMQ Backpressure and Consumer Overload

## The Problem

When you have:
- High number of tasks in database
- Outbox publisher pushing to RabbitMQ every 5 seconds
- Consumer services that can become overwhelmed by intensive tasks

**RabbitMQ will deliver messages as fast as consumers can acknowledge them**, which can easily overwhelm your services if tasks are CPU/memory intensive.

## How RabbitMQ Message Delivery Works

### Default Behavior
- RabbitMQ uses **prefetch count** (default varies by client, often unlimited)
- Messages are pushed to consumers immediately when available
- No built-in awareness of consumer processing capacity
- Consumers can get flooded with more messages than they can handle

### The Flow Control Problem
```
Database -> Outbox Publisher -> RabbitMQ -> Consumer Services
   ↑              ↑               ↑             ↑
High volume    Every 5s         Fast push    Can't keep up
```

## Production Solutions

### 1. Consumer-Side Flow Control

#### **QoS/Prefetch Limiting**
```javascript
// Limit unacknowledged messages per consumer
channel.prefetch(1); // Only 1 unacked message at a time
// or
channel.prefetch(5); // Max 5 unacked messages
```

**Benefits:**
- Prevents message flooding
- Natural backpressure when consumer is busy
- Simple to implement

**Trade-offs:**
- May reduce throughput if set too low
- Doesn't account for task complexity variations

#### **Dynamic Prefetch Adjustment**
```javascript
class AdaptiveConsumer {
  constructor() {
    this.currentLoad = 0;
    this.maxConcurrent = 10;
  }

  async adjustPrefetch() {
    const loadPercent = this.currentLoad / this.maxConcurrent;
    const newPrefetch = Math.max(1, Math.floor(this.maxConcurrent * (1 - loadPercent)));
    await this.channel.prefetch(newPrefetch);
  }
}
```

### 2. Queue-Level Management

#### **Queue Length Limits**
```javascript
// Declare queue with max length
await channel.assertQueue('tasks', {
  arguments: {
    'x-max-length': 10000,           // Max messages
    'x-max-length-bytes': 104857600, // Max 100MB
    'x-overflow': 'reject-publish'   // or 'drop-head'
  }
});
```

#### **TTL (Time To Live)**
```javascript
await channel.assertQueue('tasks', {
  arguments: {
    'x-message-ttl': 3600000 // 1 hour TTL
  }
});
```

### 3. Producer-Side Backpressure

#### **Queue Monitoring**
```javascript
class SmartOutboxPublisher {
  async checkQueueBacklog() {
    const queueInfo = await this.channel.checkQueue('tasks');
    const { messageCount, consumerCount } = queueInfo;
    
    // Calculate backlog per consumer
    const backlogPerConsumer = consumerCount > 0 
      ? messageCount / consumerCount 
      : messageCount;
    
    // Adaptive publishing rate
    if (backlogPerConsumer > 100) {
      this.publishInterval = 15000; // Slow down to 15s
    } else if (backlogPerConsumer > 50) {
      this.publishInterval = 10000; // 10s
    } else {
      this.publishInterval = 5000;  // Normal 5s
    }
  }
}
```

#### **Publisher Confirms with Timeout**
```javascript
async publishWithBackpressure(message) {
  try {
    await this.channel.publish('exchange', 'routing.key', message, {}, {
      timeout: 5000 // 5s timeout
    });
  } catch (error) {
    // Broker couldn't accept message - slow down
    this.publishInterval *= 2;
    throw error;
  }
}
```

### 4. Advanced Patterns

#### **Priority Queues**
```javascript
// High priority for lightweight tasks
await channel.assertQueue('tasks-high', {
  arguments: { 'x-max-priority': 10 }
});

// Low priority for heavy tasks  
await channel.assertQueue('tasks-low', {
  arguments: { 'x-max-priority': 10 }
});

// Publish with priority
channel.publish('exchange', 'routing.key', message, {
  priority: taskType === 'resize-image' ? 8 : 3
});
```

#### **Dead Letter Queues with Delays**
```javascript
// Main queue with DLX for retries
await channel.assertQueue('tasks', {
  arguments: {
    'x-dead-letter-exchange': 'tasks-retry',
    'x-dead-letter-routing-key': 'retry'
  }
});

// Retry queue with delay
await channel.assertQueue('tasks-retry', {
  arguments: {
    'x-message-ttl': 30000, // 30s delay
    'x-dead-letter-exchange': 'tasks-main',
    'x-dead-letter-routing-key': 'process'
  }
});
```

#### **Circuit Breaker Pattern**
```javascript
class ConsumerCircuitBreaker {
  constructor() {
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.threshold = 5;
  }

  async processMessage(message) {
    if (this.state === 'OPEN') {
      // Reject message, let it go to DLQ
      throw new Error('Circuit breaker OPEN');
    }

    try {
      await this.handleTask(message);
      this.onSuccess();
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      // Stop consuming temporarily
      setTimeout(() => this.state = 'HALF_OPEN', 60000);
    }
  }
}
```

### 5. Infrastructure Solutions

#### **Auto-Scaling Consumers**
```yaml
# Kubernetes HPA based on queue length
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: task-consumer-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: task-consumer
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: External
    external:
      metric:
        name: rabbitmq_queue_messages
      target:
        type: AverageValue
        averageValue: "10" # Scale up if >10 messages per pod
```

#### **Resource-Based Scaling**
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "1Gi" 
    cpu: "1000m"
metrics:
- type: Resource
  resource:
    name: memory
    target:
      type: Utilization
      averageUtilization: 70
```

### 6. Task Complexity Management

#### **Task Classification**
```javascript
const TASK_PROFILES = {
  'resize-image': { cpu: 0.5, memory: 100, avgTime: 2000 },
  'compress-video': { cpu: 2.0, memory: 500, avgTime: 30000 },
  'generate-pdf': { cpu: 1.0, memory: 200, avgTime: 5000 }
};

class SmartConsumer {
  canAcceptTask(taskType) {
    const profile = TASK_PROFILES[taskType];
    const currentLoad = this.getCurrentResourceUsage();
    
    return (
      currentLoad.cpu + profile.cpu <= this.maxCpu &&
      currentLoad.memory + profile.memory <= this.maxMemory
    );
  }
}
```

#### **Separate Queues by Complexity**
```javascript
// Route different task types to different queues
const routingMap = {
  'resize-image': 'tasks.light',      // Fast processing queue
  'compress-video': 'tasks.heavy',    // Resource-intensive queue  
  'generate-pdf': 'tasks.medium'      // Medium processing queue
};

// Different consumer pools for each complexity
// Light tasks: 10 consumers, prefetch=5
// Heavy tasks: 3 consumers, prefetch=1  
// Medium tasks: 6 consumers, prefetch=2
```

## Monitoring & Observability

### Key Metrics to Track
```javascript
// Publisher metrics
- published_messages_per_second
- publish_failures
- queue_length_before_publish

// Queue metrics  
- queue_depth
- message_rate_in
- message_rate_out
- consumer_count
- messages_unacknowledged

// Consumer metrics
- processing_time_per_task_type
- memory_usage_per_consumer
- cpu_usage_per_consumer  
- error_rate_per_task_type
- concurrent_tasks_per_consumer
```

### Alerting Rules
```yaml
# Alert if queue is backing up
- alert: RabbitMQQueueBacklog
  expr: rabbitmq_queue_messages > 1000
  for: 2m

# Alert if consumers are overwhelmed  
- alert: HighConsumerMemoryUsage
  expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.85
  for: 1m

# Alert if processing times are increasing
- alert: SlowTaskProcessing  
  expr: task_processing_duration_seconds{quantile="0.95"} > 60
  for: 5m
```

## Implementation Strategy

1. **Start Simple**: Implement basic prefetch limits (prefetch=1-3)
2. **Add Monitoring**: Track queue depths and processing times  
3. **Implement Backpressure**: Add queue monitoring to outbox publisher
4. **Optimize by Task Type**: Separate queues for different complexities
5. **Scale Infrastructure**: Add auto-scaling based on metrics
6. **Advanced Patterns**: Circuit breakers, priority queues, adaptive consumers

## Trade-offs Summary

| Approach | Pros | Cons |
|----------|------|------|
| Low Prefetch | Prevents overload, simple | May reduce throughput |
| Queue Limits | Prevents infinite growth | May lose messages |
| Separate Queues | Optimized per task type | More complex routing |
| Auto-scaling | Handles load spikes | Resource costs, scaling lag |
| Circuit Breakers | Prevents cascade failures | May drop valid work |

The key is to implement these solutions incrementally, starting with basic prefetch limits and queue monitoring, then adding complexity as needed based on your specific traffic patterns and resource constraints.