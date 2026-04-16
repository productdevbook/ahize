// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { waitForDefer } from "../src/_defer.ts";

describe("waitForDefer", () => {
  it("resolves immediately for 'immediate'", async () => {
    const start = Date.now();
    await waitForDefer("immediate");
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("resolves under 'idle' within timeout even without requestIdleCallback", async () => {
    const start = Date.now();
    await waitForDefer("idle", 1000);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("resolves on 'interaction' pointerdown", async () => {
    const p = waitForDefer("interaction", 5000);
    await new Promise((r) => setTimeout(r, 10));
    window.dispatchEvent(new Event("pointerdown"));
    await p;
  });

  it("resolves on 'interaction' timeout when no event fires", async () => {
    const start = Date.now();
    await waitForDefer("interaction", 150);
    expect(Date.now() - start).toBeGreaterThanOrEqual(140);
  });
});
