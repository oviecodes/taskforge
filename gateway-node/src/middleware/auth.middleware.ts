import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { config } from "../config"
import { userService } from "../services"
import crypto from "crypto"
import sessionStore from "../services/auth-session.service"

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const authHeader = req.headers.authorization

  console.log("authentication headers", authHeader)

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      id: string
      email: string
    }

    const isValidSession = sessionStore.isValidSession(decoded.id, token)

    if (!isValidSession) {
      res.status(401).json({ message: "Unauthorized" })
    }

    const user = await userService.getUserByEmail(decoded.email)
    if (!user) res.status(401).json({ message: "Unauthorized" })

    req.user = { id: decoded.id, email: decoded.email }
    next()
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}
