import puppeteer from "puppeteer-core"

export async function launchBrowser() {
  return await puppeteer.launch({
    executablePath: "/usr/bin/chromium-browser",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
}
