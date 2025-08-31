import { User } from "../config/index"

export * from "../config/index"

declare global {
  namespace Express {
    export interface Request {
      user: User
    }
  }
}
