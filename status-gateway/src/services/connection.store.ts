import Redis from "ioredis"
import dotenv from "dotenv"

dotenv.config()
const redis = new Redis(process.env.REDIS_URL!)

const TTL = 60 * 60 // 1 hour (auto-expires stale sockets)

export class ConnectionStore {
  async registerConnection(userId: string, socketId: string): Promise<void> {
    await redis.sadd(`user:${userId}:sockets`, socketId)
    await redis.set(`socket:${socketId}:user`, userId, "EX", TTL)
  }

  async getUserSocketIds(userId: string): Promise<string[]> {
    return await redis.smembers(`user:${userId}:sockets`)
  }

  async getSocketUser(socketId: string): Promise<string | null> {
    return await redis.get(`socket:${socketId}:user`)
  }

  async removeConnection(socketId: string): Promise<void> {
    const userId = await redis.get(`socket:${socketId}:user`)
    if (userId) {
      await redis.srem(`user:${userId}:sockets`, socketId)
    }
    await redis.del(`socket:${socketId}:user`)
  }

  async cleanupUser(userId: string): Promise<void> {
    const sockets = await this.getUserSocketIds(userId)
    const pipeline = redis.pipeline()
    sockets.forEach((socketId) => {
      pipeline.del(`socket:${socketId}:user`)
    })
    pipeline.del(`user:${userId}:sockets`)
    await pipeline.exec()
  }
}
