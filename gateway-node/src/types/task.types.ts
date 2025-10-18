export interface TaskMessage {
  id: string
  type: TaskType
  userId: string
  payload: Record<string, any>
  createdAt: string
  traceId: string
}

export type TaskType =
  | "generate-pdf"
  | "resize-image"
  | "scrape-website"
  | "screenshot-website"
  | "compress-video"
  | "generate-report"
  | "etl-data"
