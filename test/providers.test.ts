import { describe, expect, it } from "vitest";
import * as intercom from "../src/providers/intercom.ts";
import * as crisp from "../src/providers/crisp.ts";
import * as tawk from "../src/providers/tawk.ts";
import * as zendesk from "../src/providers/zendesk.ts";
import * as hubspot from "../src/providers/hubspot.ts";

const providers = { intercom, crisp, tawk, zendesk, hubspot };

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
      });

      it("is SSR-safe on load()", async () => {
        await expect(
          (provider.load as (o: Record<string, string>) => Promise<void>)({
            appId: "x",
            websiteId: "x",
            propertyId: "x",
            key: "x",
            portalId: "x",
          }),
        ).resolves.toBeUndefined();
      });
    });
  }
});
