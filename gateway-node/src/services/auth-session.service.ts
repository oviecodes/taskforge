import Redis from "ioredis"
import crypto from "crypto"
import dotenv from "dotenv"
import {
  redisWithResilience,
  redisCircuitBreaker,
} from "../lib/redis-resilience"

dotenv.config()
const redis = redisWithResilience(process.env.REDIS_URL!)

// redis resilient connection

const SESSION_PREFIX = "auth:session"

export class AuthSessionService {
  private hash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex")
  }

  async create(
    userId: string,
    token: string,
    ttlInSeconds: number
  ): Promise<void> {
    const hash = this.hash(token)
    console.log(`${SESSION_PREFIX}:${userId}:${hash}`)

    await redisCircuitBreaker.execute(
      async () =>
        await redis.set(
          `${SESSION_PREFIX}:${userId}:${hash}`,
          "valid",
          "EX",
          ttlInSeconds
        )
    )
  }

  async isValidSession(userId: string, token: string): Promise<boolean> {
    const hash = this.hash(token)
    const sessionKey = `${SESSION_PREFIX}:${userId}:${hash}`
    const exists = await redisCircuitBreaker.execute(
      async () => await redis.exists(sessionKey)
    )
    return exists === 1
  }

  async delete(userId: string, token: string): Promise<void> {
    const hash = this.hash(token)
    await redisCircuitBreaker.execute(
      async () => await redis.del(`${SESSION_PREFIX}:${userId}:${hash}`)
    )
  }

  async deleteAll(userId: string): Promise<void> {
    const keys = await redisCircuitBreaker.execute(
      async () => await redis.keys(`${SESSION_PREFIX}:${userId}:*`)
    )
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }
}

export default new AuthSessionService()
