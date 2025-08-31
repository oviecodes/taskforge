import { db, dbCircuitBreaker } from "../lib/db.lib"
import bcrypt from "bcrypt"

export class UserService {
  async getUserByEmail(email: string) {
    return dbCircuitBreaker.execute(() => db("User").where({ email }).first())
  }

  async createUser(email: string, password: string) {
    const hashed = await bcrypt.hash(password, 10)
    const [user] = await dbCircuitBreaker.execute(async () =>
      db("User").insert({ email, password: hashed }).returning(["id", "email"])
    )
    return user
  }

  async updateRefreshToken(id: string, refreshToken: string) {
    // Store refresh token as-is (not hashed)
    // Refresh tokens should be cryptographically secure random strings
    return dbCircuitBreaker.execute(async () =>
      db("User").update({ refreshToken }).where({ id })
    )
  }

  async compare(plain: string, hashed: string) {
    return bcrypt.compare(plain, hashed)
  }

  async getUserById(id: string) {
    return dbCircuitBreaker.execute(() => db("User").where("id", id).first())
  }

  async clearRefreshToken(id: string) {
    return dbCircuitBreaker.execute(() =>
      db("User").update({ refreshToken: null }).where({ id })
    )
  }

  async removeAllLoadTestingUsers() {
    return dbCircuitBreaker.execute(() =>
      db("User").whereILike(`email`, `load%`).del()
    )
  }
}

export default new UserService()
