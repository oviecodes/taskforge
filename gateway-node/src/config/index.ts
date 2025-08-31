import * as dotenv from "dotenv"
dotenv.config()

export const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET!,
  rabbitmqUrl: process.env.RABBITMQ_URL || "amqp://localhost",
  // rabbitmqUrl: "amqp://localhost",
  env: process.env.NODE_ENV || "development",
  database_url: process.env.DATABASE_URL || "",
  rappy: "",
}

export const SUPPORTED_TASK_TYPES = [
  "generate-pdf",
  "resize-image",
  "scrape-website",
  "screenshot-website",
  "compress-video",
  "generate-report",
  "etl-data",
]

export interface User {
  id: string
  email: string
}
