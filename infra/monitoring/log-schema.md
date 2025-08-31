# Standard Log Schema

## Required Fields
```json
{
  "timestamp": "2025-08-17T08:57:54.478Z",
  "level": "info|warn|error|debug",
  "message": "Human readable message",
  "service": "service-name"
}
```

## Optional Fields
```json
{
  "traceId": "trace-123",
  "requestId": "req-456", 
  "userId": "user-789",
  "taskId": "task-101",
  "duration": 150,
  "error": "error details",
  "metadata": {}
}
```

## Implementation Examples

### Node.js (Winston)
```javascript
logger.info('Request processed', {
  requestId: req.id,
  userId: req.user?.id,
  duration: Date.now() - startTime
});
```

### Python
```python
logger.info('Task completed', extra={
    'taskId': task_id,
    'userId': user_id,
    'duration': duration
})
```