import { describe, expect, it } from "vitest";
import { cspDirectives, mergeCsp, toHeaderString } from "../src/csp.ts";

describe("cspDirectives", () => {
  it("returns Intercom-specific directives with 'self' by default", () => {
    const d = cspDirectives("intercom");
    expect(d["script-src"]).toContain("'self'");
    expect(d["script-src"]).toContain("https://widget.intercom.io");
    expect(d["connect-src"]).toContain("wss://nexus-websocket-a.intercom.io");
  });

  it("omits 'self' when includeSelf: false", () => {
    const d = cspDirectives("intercom", { includeSelf: false });
    expect(d["script-src"]).not.toContain("'self'");
  });

  it("zendesk includes wss://widget-mediator.zopim.com", () => {
    const d = cspDirectives("zendesk");
    expect(d["connect-src"]).toContain("wss://widget-mediator.zopim.com");
  });

  it("chatwoot uses the overridden baseUrl for all directives", () => {
    const d = cspDirectives("chatwoot", { chatwootBaseUrl: "https://chat.acme.com" });
    expect(d["script-src"]).toContain("https://chat.acme.com");
    expect(d["connect-src"]).toContain("wss://chat.acme.com/cable");
  });

  it("chatwoot defaults to app.chatwoot.com", () => {
    const d = cspDirectives("chatwoot");
    expect(d["script-src"]).toContain("https://app.chatwoot.com");
  });
});

describe("mergeCsp", () => {
  it("deduplicates identical entries across sets", () => {
    const a = cspDirectives("intercom");
    const b = cspDirectives("intercom");
    const merged = mergeCsp(a, b);
    const selves = merged["script-src"].filter((v) => v === "'self'");
    expect(selves).toHaveLength(1);
  });

  it("unions distinct provider directive sets", () => {
    const merged = mergeCsp(cspDirectives("intercom"), cspDirectives("crisp"));
    expect(merged["script-src"]).toContain("https://widget.intercom.io");
    expect(merged["script-src"]).toContain("https://client.crisp.chat");
  });
});

describe("toHeaderString", () => {
  it("emits a CSP header string with directives separated by '; '", () => {
    const header = toHeaderString(cspDirectives("intercom"));
    expect(header).toContain("script-src 'self' https://widget.intercom.io");
    expect(header).toContain("; connect-src ");
  });

  it("skips directives with no entries", () => {
    const header = toHeaderString({
      "script-src": ["https://x.com"],
      "connect-src": [],
      "frame-src": [],
      "style-src": [],
      "img-src": [],
      "font-src": [],
      "media-src": [],
    });
    expect(header).toBe("script-src https://x.com");
  });
});
