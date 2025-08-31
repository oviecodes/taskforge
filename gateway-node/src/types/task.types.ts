export interface TaskMessage {
  id: string // UUID v4
  type: TaskType // One of the supported task types
  userId: string
  payload: Record<string, any> // Type-specific data
  createdAt: string // ISO timestamp
  traceId: string // Unique per request
}

// List of supported task types
export type TaskType =
  | "generate-pdf"
  | "resize-image"
  | "scrape-website"
  | "screenshot-website"
  | "compress-video"
  | "generate-report"
  | "etl-data"
