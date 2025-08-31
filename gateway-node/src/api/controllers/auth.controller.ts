import { Request, Response, NextFunction, Express } from "express"
import jwt from "jsonwebtoken"
import createError from "http-errors"
import { config } from "../../config"
import { userService } from "../../services"
import { authSessionService as sessionService } from "../../services"
import { db } from "../../lib/db.lib"

const ACCESS_TOKEN_TTL = 15 * 60 // 15 min

class AuthController {
  async signUp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body
      if (!email || !password)
        throw createError(400, "Email and password required")

      const existing = await userService.getUserByEmail(email)
      if (existing) throw createError(409, "User already exists")

      const user = await userService.createUser(email, password)

      const accessToken = jwt.sign(
        { id: user.id, email: user.email },
        config.jwtSecret,
        { expiresIn: "15m" }
      )
      const refreshToken = jwt.sign({ id: user.id }, config.jwtSecret, {
        expiresIn: "7d",
      })

      await userService.updateRefreshToken(user.id, refreshToken)
      await sessionService.create(user.id, accessToken, ACCESS_TOKEN_TTL)

      res.status(201).json({
        success: true,
        accessToken,
        refreshToken,
      })
    } catch (err: any) {
      return next(createError(err))
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body
      if (!email || !password)
        throw createError(400, "Email and password required")

      const user = await userService.getUserByEmail(email)
      if (!user) throw createError(404, "User not found")

      const passwordMatch = await userService.compare(password, user.password)
      if (!passwordMatch) {
        await Promise.all([
          sessionService.deleteAll(user.id),
          userService.clearRefreshToken(user.id),
        ])
        throw createError(401, "Invalid credentials")
      }

      const accessToken = jwt.sign(
        { id: user.id, email: user.email },
        config.jwtSecret,
        { expiresIn: "15m" }
      )
      const refreshToken = jwt.sign({ id: user.id }, config.jwtSecret, {
        expiresIn: "7d",
      })

      await sessionService.deleteAll(user.id)
      await userService.updateRefreshToken(user.id, refreshToken)
      await sessionService.create(user.id, accessToken, ACCESS_TOKEN_TTL)

      res.status(200).json({
        success: true,
        accessToken,
        refreshToken,
      })
    } catch (err) {
      next(err)
    }
  }

  async refresh(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body
      if (!refreshToken) throw createError(400, "Refresh token required")

      const payload = jwt.verify(refreshToken, config.jwtSecret) as {
        id: string
      }
      const user = await userService.getUserById(payload.id)

      if (!user || !user.refreshToken) throw createError(403, "Access denied")

      const valid = refreshToken === user.refreshToken
      if (!valid) {
        await userService.clearRefreshToken(user.id) // revoke all sessions
        throw createError(403, "Token reuse detected")
      }

      const newAccessToken = jwt.sign(
        { id: user.id, email: user.email },
        config.jwtSecret,
        { expiresIn: "15m" }
      )
      const newRefreshToken = jwt.sign({ id: user.id }, config.jwtSecret, {
        expiresIn: "7d",
      })

      await sessionService.deleteAll(user.id)
      await userService.updateRefreshToken(user.id, newRefreshToken)
      await sessionService.create(user.id, newAccessToken, ACCESS_TOKEN_TTL)

      res.status(200).json({
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      })
    } catch (err) {
      next(err)
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) throw createError(401, "Unauthorized")
      await userService.clearRefreshToken(req.user.id)
      await sessionService.deleteAll(req.user.id)
      res.status(200).json({ success: true, message: "Logged out" })
    } catch (err) {
      next(err)
    }
  }

  async removeTestUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await userService.removeAllLoadTestingUsers()
      res.status(200).json({
        success: true,
        message: "All users",
        users,
      })
    } catch (e) {
      next(e)
    }
  }
}

export default new AuthController()
