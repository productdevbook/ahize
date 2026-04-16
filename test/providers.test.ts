import { describe, expect, it } from "vitest";
import * as intercom from "../src/providers/intercom.ts";
import * as crisp from "../src/providers/crisp.ts";
import * as tawk from "../src/providers/tawk.ts";
import * as zendesk from "../src/providers/zendesk.ts";
import * as hubspot from "../src/providers/hubspot.ts";
import * as chatwoot from "../src/providers/chatwoot.ts";

const providers = { intercom, crisp, tawk, zendesk, hubspot, chatwoot };

describe("providers", () => {
  for (const [name, provider] of Object.entries(providers)) {
    describe(name, () => {
      it("implements the unified surface", () => {
        expect(typeof provider.load).toBe("function");
        expect(typeof provider.identify).toBe("function");
        expect(typeof provider.track).toBe("function");
        expect(typeof provider.show).toBe("function");
        expect(typeof provider.hide).toBe("function");
        expect(typeof provider.shutdown).toBe("function");
        expect(typeof provider.destroy).toBe("function");
        expect(typeof provider.getIdentity).toBe("function");
        expect(typeof provider.onIdentityChange).toBe("function");
        expect(typeof provider.isReady).toBe("function");
        expect(typeof provider.state).toBe("function");
      });

      it("is SSR-safe on load()", async () => {
        await expect(
          (provider.load as (o: unknown) => Promise<void>)({
            appId: "x",
            websiteId: "x",
            websiteToken: "x",
            propertyId: "x",
            key: "x",
            portalId: "x",
          }),
        ).resolves.toBeUndefined();
      });

      it("is SSR-safe on every method (no hang)", async () => {
        await expect(
          (provider.identify as (v: unknown) => Promise<void>)({ id: "u1" }),
        ).resolves.toBeUndefined();
        await expect(provider.track("evt")).resolves.toBeUndefined();
        await expect(provider.show()).resolves.toBeUndefined();
        await expect(provider.hide()).resolves.toBeUndefined();
        await expect(provider.shutdown()).resolves.toBeUndefined();
      });

      it("starts with anonymous identity", () => {
        expect(provider.getIdentity()).toEqual({ kind: "anonymous" });
      });

      it("starts in idle state, not ready", () => {
        expect(provider.state()).toBe("idle");
        expect(provider.isReady()).toBe(false);
      });

      it("destroy() is SSR-safe", async () => {
        await expect(provider.destroy()).resolves.toBeUndefined();
      });
    });
  }
});
