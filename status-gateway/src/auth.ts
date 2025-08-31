import jwt from "jsonwebtoken"
import { SessionStore } from "./services/session.store"
import dotenv from "dotenv"
dotenv.config()

const sessionStore = new SessionStore()

export const verifyToken = async (
  token: string
): Promise<{ id: string; email: string }> => {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
    id: string
    email: string
  }

  const isValid = await sessionStore.isValidSession(payload.id, token)

  if (!isValid) {
    throw new Error("Invalid session")
  }

  return payload
}
