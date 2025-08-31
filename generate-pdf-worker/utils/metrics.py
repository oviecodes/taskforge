from prometheus_client import (
    Counter, 
    generate_latest, 
    CONTENT_TYPE_LATEST, 
    CollectorRegistry, 
    platform_collector,
    process_collector,
    gc_collector,
    Histogram)

registry = CollectorRegistry()
gc_collector.GCCollector(registry=registry)
platform_collector.PlatformCollector(registry=registry)
process_collector.ProcessCollector(registry=registry)

task_processed_total = Counter("task_processed_total", "Total number of task processed", ["type", "status"], registry=registry)
task_retry_attempts_total = Counter("task_retry_attempts_total", "Total number of retry attempts", ["type"], registry=registry)
task_dropped_total = Counter('task_dropped_total', "Tasks dropped to DLQ", ["type"], registry=registry)
task_processing_duration_seconds = Histogram("task_processing_duration_seconds", "Time spent on task", ["type"], registry=registry)