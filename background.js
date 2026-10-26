import { SERVER } from "./config.js";
const S = chrome.storage.session, L = chrome.storage.local;
const api = async (p, b) => {
  try {
    const r = await fetch(SERVER + p, { method: b ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
    return await r.json();
  } catch { return { offline: true }; }
};
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const inList = (h, l) => (l || []).some(d => h === d || h.endsWith("." + d));

async function seen(tab) {
  const { ex } = await S.get("ex");
  if (!ex || !tab || !tab.active || tab.id === ex.tab || !tab.url) return;
  const h = host(tab.url);
  if (!h || (ex.dom || []).includes(h)) return;
  ex.dom = [...(ex.dom || []), h];
  await S.set({ ex });
  if (inList(h, ex.blocked) && !inList(h, ex.allow)) api("/api/ev", { key: ex.key, e: { t: "blocked", domain: h } });
}
chrome.tabs.onActivated.addListener(async i => seen(await chrome.tabs.get(i.tabId)));
chrome.tabs.onUpdated.addListener((id, c, t) => { if (c.url) seen(t); });

chrome.runtime.onMessage.addListener((m, s, send) => {
  (async () => {
    const { ex } = await S.get("ex");
    if (m.a === "lookup") {
      const r = await api("/api/lookup?f=" + m.f), k = "a_" + m.f;
      return send({ ...r, saved: (await L.get(k))[k] });
    }
    if (m.a === "start") {
      const r = await api("/api/start", m.b);
      if (r.key) {
        await S.set({ ex: { tab: s.tab.id, key: r.key, blocked: m.rules.blocked, allow: m.rules.allow, dom: [] } });
        await L.set({ ["a_" + m.f]: { test: m.b.test, name: m.b.name, email: m.b.email } });
      }
      return send(r);
    }
    if (!ex) return send({});
    if (m.a === "ev") {
      const e = m.e;
      if (e.t === "leave") {
        e.domains = ex.dom || [];
        if (e.domains.length && e.domains.every(d => inList(d, ex.allow))) e.t = "allowed";
        ex.dom = [];
        await S.set({ ex });
      }
      return send(await api("/api/ev", { key: ex.key, e }));
    }
    if (m.a === "hb") return send(await api("/api/hb", { key: ex.key, q: m.q }));
    if (m.a === "done") {
      await api("/api/ev", { key: ex.key, e: { t: "done" } });
      await S.remove("ex"); await L.remove("a_" + m.f);
      return send({});
    }
  })();
  return true;
});
