import { Browser } from "playwright-core";

let browserInstance: Browser | null = null;
let launchInProgress: Promise<Browser> | null = null;

export default async function launchBrowser(): Promise<Browser> {
  // Return existing browser if still connected
  if (browserInstance?.isConnected()) {
    return browserInstance;
  }

  // Wait and return if another launch is in progress
  if (launchInProgress) {
    return await launchInProgress;
  }

  const isDev = process.env.IS_NETLIFY ? process.env.IS_NETLIFY === "false" : false;

  const launch = async () => {
    if (isDev) {
      const { chromium } = await import("playwright");
      return await chromium.launch({ headless: true });
    } else {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { chromium: playwright } = require("playwright-core");
      const chromium = (await import("@sparticuz/chromium")).default;

      return await playwright.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    }
  };

  launchInProgress = launch();
  const browser = await launchInProgress;
  browserInstance = browser;
  launchInProgress = null;

  // Auto-close browser after 55 seconds (just before Lambda's 60s timeout)
  // This ensures cleanup happens before Lambda terminates
  setTimeout(() => {
    browser.close().catch(() => {});
    browserInstance = null;
  }, 55000);

  return browser;
}
