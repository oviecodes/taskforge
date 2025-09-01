import { Request, Response, NextFunction } from "express"

interface AppError extends Error {
  statusCode?: number
  isOperational?: boolean
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const status = err.statusCode || 500
  const message = err.message || "Something went wrong"

  if (process.env.NODE_ENV !== "production") {
    console.error(`[ERROR]: ${err.stack}`)
  }

  res.status(status).json({
    success: false,
    error: {
      message,
      status,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    },
  })
}
