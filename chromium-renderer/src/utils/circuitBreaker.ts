import { withLogContext } from "./log-context"
const log = withLogContext({ service: "chromium-renderer" })

class CircuitBreaker {
  failureCount: number
  state: "OPEN" | "HALF_OPEN" | "CLOSED"
  //   lastFailure: any
  threshold: number

  constructor() {
    this.failureCount = 0
    this.state = "CLOSED"
    // this.lastFailure = undefined
    this.threshold = 5
  }

  async execute(toExecute: () => Promise<any>) {
    if (this.state === "OPEN") {
      log.error({
        error: "circuit OPEN - Cannot process any PDF tasks at the moment",
      })
      throw new Error(
        "circuit OPEN - Cannot process any PDF tasks at the moment"
      )
    }

    try {
      const result = await toExecute()
      this.onSuccess()
      return result
    } catch (e: any) {
      log.error(
        {
          e,
        },
        "An error occured while generating PDF"
      )
      this.onFailure()
      throw new Error(e)
    }
  }

  onSuccess() {
    this.failureCount = 0
    this.state = "CLOSED"
  }

  onFailure() {
    this.failureCount++
    // this.lastFailure = new Date()

    if (this.failureCount >= this.threshold) {
      this.state = "OPEN"
      setTimeout(() => (this.state = "HALF_OPEN"), 60000)
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
    }
  }
}

export const circuitBreaker = new CircuitBreaker()
