// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountFacade } from "../src/facade.ts";

describe("mountFacade", () => {
  it("mounts a floating button with data-ahize-facade attribute", () => {
    const boot = vi.fn().mockResolvedValue(undefined);
    const handle = mountFacade({ provider: "intercom", boot });
    const el = handle.element() as HTMLElement | undefined;
    expect(el).toBeTruthy();
    expect(el?.getAttribute("data-ahize-facade")).toBe("intercom");
    handle.destroy();
  });

  it("calls boot() on pointerenter exactly once", async () => {
    const boot = vi.fn().mockResolvedValue(undefined);
    const handle = mountFacade({ provider: "crisp", boot });
    const el = handle.element() as HTMLElement;
    el.dispatchEvent(new Event("pointerenter"));
    el.dispatchEvent(new Event("pointerenter"));
    await new Promise((r) => setTimeout(r, 0));
    expect(boot).toHaveBeenCalledTimes(1);
  });

  it("calls boot() on click too (and is still deduped)", async () => {
    const boot = vi.fn().mockResolvedValue(undefined);
    const handle = mountFacade({ provider: "tawk", boot });
    const el = handle.element() as HTMLElement;
    el.click();
    await handle.boot();
    expect(boot).toHaveBeenCalledTimes(1);
  });

  it("is SSR-safe", async () => {
    const savedWindow = globalThis.window;
    const savedDocument = globalThis.document;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: test shim
      (globalThis as any).window = undefined;
      // biome-ignore lint/suspicious/noExplicitAny: test shim
      (globalThis as any).document = undefined;
      const handle = mountFacade({ provider: "hubspot", boot: vi.fn() });
      expect(handle.element()).toBeUndefined();
    } finally {
      // biome-ignore lint/suspicious/noExplicitAny: test shim
      (globalThis as any).window = savedWindow;
      // biome-ignore lint/suspicious/noExplicitAny: test shim
      (globalThis as any).document = savedDocument;
    }
  });
});
