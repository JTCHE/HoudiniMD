import { Browser } from "playwright-core";

let launchInProgress: Promise<Browser> | null = null;

export default async function launchBrowser(): Promise<Browser> {
  // Wait if another launch is in progress
  if (launchInProgress) {
    await launchInProgress;
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
  launchInProgress = null;

  setTimeout(() => {
    browser.close().catch(() => {});
  }, 30000);

  return browser;
}
