export interface TaskStatusUpdate {
  status: string
  progress?: number
  url?: string | null
}

export interface ClientMessage {
  type: "subscribe"
  taskId: string
}
