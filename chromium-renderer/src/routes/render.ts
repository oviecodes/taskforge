import express from "express"
import { launchBrowser } from "../utils/browser"
import { Request, Response } from "express"
import { uploadBufferToS3 } from "../utils/s3"
import { withLogContext } from "../utils/log-context"

const log = withLogContext({ service: "chromium-renderer" })

import {
  pdfErrorCounter,
  pdfProcessedCounter,
  pdfProcessingDuration,
  pdfTasksCounter,
} from "../utils/metrics"

const router = express.Router()

router.post("/pdf", async (req: Request, res: Response) => {
  const { task_id, url, options } = req.body
  pdfTasksCounter.inc()

  if (!url) {
    pdfErrorCounter.inc()
    return res.status(400).json({ error: "Missing URL" })
  }

  const end = pdfProcessingDuration.startTimer()

  try {
    const browser = await launchBrowser()
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      ...options,
    })
    await browser.close()

    const s3Url = await uploadBufferToS3(task_id, pdfBuffer, "pdf")

    pdfProcessedCounter.labels("success").inc()

    log.info({
      message: "PDF processed and uploaded successfully",
    })

    return res.status(200).json({
      success: true,
      url: s3Url,
    })
  } catch (err: any) {
    log.error(
      {
        err,
      },
      "An error occured, failed to render and upload PDF"
    )
    pdfErrorCounter.inc()
    return res.status(500).json({ error: "Failed to render and upload PDF" })
  } finally {
    end()
  }
})

router.post("/screenshot", async (req: Request, res: Response) => {
  const { url, options } = req.body
  if (!url) return res.status(400).json({ error: "Missing URL" })

  const browser = await launchBrowser()
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: "networkidle2" })

  const buffer = await page.screenshot({ type: "png", ...options })
  await browser.close()

  res.set("Content-Type", "image/png")
  res.send(buffer)
})

export default router
