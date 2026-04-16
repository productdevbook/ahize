// Skeleton e2e test — wire real credentials before running.
//
//   E2E_INTERCOM_APP_ID=abc pnpm e2e
//
// Asserts:
//   1. <script id="ahize-intercom"> is injected.
//   2. window.Intercom becomes a function.
//   3. provider.isReady() flips to true.

import { test, expect } from "@playwright/test";

const APP_ID = process.env["E2E_INTERCOM_APP_ID"];

test.skip(!APP_ID, "E2E_INTERCOM_APP_ID env var required");

test("intercom boots and exposes window.Intercom", async ({ page }) => {
  await page.goto("/e2e/fixtures/intercom.html");
  const ok = await page.evaluate(async (appId) => {
    // @ts-expect-error — fixture imports the built dist
    const intercom = await import("/dist/providers/intercom.mjs");
    await intercom.load({ appId });
    await intercom.ready();
    return (
      intercom.isReady() &&
      typeof (window as unknown as { Intercom?: unknown }).Intercom === "function"
    );
  }, APP_ID);
  expect(ok).toBe(true);
});
