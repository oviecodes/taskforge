import Redis from "ioredis"
import dotenv from "dotenv"
import crypto from "crypto"

dotenv.config()
const redis = new Redis(process.env.REDIS_URL!)

export class SessionStore {
  private prefix = "auth:session"

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex")
  }

  async isValidSession(userId: string, token: string): Promise<boolean> {
    const hash = this.hashToken(token)
    const sessionKey = `${this.prefix}:${userId}:${hash}`
    const exists = await redis.exists(sessionKey)
    return exists === 1
  }
}
