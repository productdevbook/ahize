import * as chatwoot from "../../src/providers/chatwoot.ts"
import type { Verification } from "../../src/_types.ts"

// biome-ignore lint/style/noNonNullAssertion: playground fixtures
const $ = <T extends HTMLElement = HTMLInputElement>(id: string) =>
  document.getElementById(id) as T

const logEl = $<HTMLPreElement>("log")
const stateBadge = $<HTMLSpanElement>("state")

function log(label: string, value?: unknown): void {
  const stamp = new Date().toLocaleTimeString()
  const suffix = value === undefined ? "" : ` · ${JSON.stringify(value)}`
  logEl.textContent = `[${stamp}] ${label}${suffix}\n${logEl.textContent ?? ""}`
}

function refreshState(): void {
  const s = chatwoot.state()
  stateBadge.textContent = s
  stateBadge.className = `badge ${s === "ready" ? "ready" : s === "loading" ? "loading" : "idle"}`
}
setInterval(refreshState, 200)

chatwoot.onIdentityChange((next, prev) => {
  log("onIdentityChange", { from: prev.kind, to: next.kind })
})
chatwoot.on("ready", () => log("event: ready"))
chatwoot.on("message", (p) => log("event: message", p))
chatwoot.on("unreadCountChange", (p) => log("event: unreadCountChange", p))
chatwoot.on("error", (p) => log("event: error", p))
chatwoot.onUnreadCountChange((count) => log("onUnreadCountChange", count))

$("load").addEventListener("click", async () => {
  const websiteToken = ($<HTMLInputElement>("websiteToken").value || "").trim()
  const baseUrl = ($<HTMLInputElement>("baseUrl").value || "").trim() || undefined
  if (!websiteToken) {
    log("missing websiteToken — paste it from your Chatwoot inbox settings")
    return
  }
  log("load()", { websiteToken, baseUrl })
  try {
    await chatwoot.load({ websiteToken, baseUrl })
    log("load() resolved")
  } catch (err) {
    log("load() failed", String(err))
  }
})

$("identify").addEventListener("click", async () => {
  const id = $<HTMLInputElement>("uid").value.trim()
  const email = $<HTMLInputElement>("email").value.trim()
  const name = $<HTMLInputElement>("name").value.trim()
  const hash = $<HTMLInputElement>("hash").value.trim()
  const verification: Verification | undefined = hash ? { kind: "hmac", hash } : undefined
  log("identify()", { id, email, name, hasHmac: Boolean(hash) })
  try {
    await chatwoot.identify({ id, email, name, verification })
    log("identify() resolved")
  } catch (err) {
    log("identify() rejected", String(err))
  }
})

$("track").addEventListener("click", async () => {
  const event = $<HTMLInputElement>("event").value.trim()
  let meta: Record<string, unknown> | undefined
  try {
    const raw = $<HTMLInputElement>("meta").value.trim()
    meta = raw ? JSON.parse(raw) : undefined
  } catch {
    log("meta JSON is invalid — sending without metadata")
  }
  log("track()", { event, meta })
  // biome-ignore lint/suspicious/noExplicitAny: metadata shape is user-controlled here
  await chatwoot.track(event, meta as any)
})

$("pageView").addEventListener("click", async () => {
  log("pageView()", { path: location.pathname })
  await chatwoot.pageView({ path: location.pathname })
})

$("show").addEventListener("click", async () => {
  log("show()")
  await chatwoot.show()
})
$("hide").addEventListener("click", async () => {
  log("hide()")
  await chatwoot.hide()
})
$("setLocale").addEventListener("click", async () => {
  log("setLocale('tr')")
  await chatwoot.setLocale("tr")
})
$("setLabel").addEventListener("click", async () => {
  log("setLabel('vip')")
  await chatwoot.setLabel("vip")
})
$("shutdown").addEventListener("click", async () => {
  log("shutdown()")
  await chatwoot.shutdown()
})
$("destroy").addEventListener("click", async () => {
  log("destroy()")
  await chatwoot.destroy()
})

log("ready — paste your Chatwoot websiteToken and hit load()")
refreshState()
