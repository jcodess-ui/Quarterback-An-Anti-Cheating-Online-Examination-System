(async () => {
  const F = (location.pathname.match(/\/forms\/d\/e\/([^/]+)/) || [])[1];
  if (!F) return;
  const send = m => new Promise(r => chrome.runtime.sendMessage(m, x => r(x || {})));
  if (/formResponse/.test(location.pathname)) return send({ a: "done", f: F });
  const { cfg, saved } = await send({ a: "lookup", f: F });
  if (!cfg || !cfg.id) return;  // not a live Quarterback test

  const el = (t, s, ...c) => { const e = document.createElement(t); if (s) e.style.cssText = s; e.append(...c); return e; };
  const ov = el("div", "position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;font:16px system-ui;color:#fff");
  const bd = el("div", "position:fixed;top:8px;right:8px;z-index:2147483647;background:#8b1a1f;color:#fff;padding:4px 10px;border-radius:12px;font:600 13px system-ui;display:none");
  document.documentElement.append(ov, bd);
  let st = null, on = false, away = null, retAt = 0, lastQ = 0, tick = 0;
  const hide = () => { if (!st || st.status !== "locked") ov.style.display = "none"; };
  const fs = () => { if (cfg.fullscreen) document.documentElement.requestFullscreen().catch(() => {}); };

  const logo = n => {
    const NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 64 64"); s.setAttribute("width", n); s.setAttribute("height", n);
    [["path", { d: "M10 36C10 18 24 8 38 8c12 0 20 8 20 20v8l-8 2v6l-12 2c-4 6-14 8-20 4-6-4-8-8-8-14z", fill: "#8b1a1f", stroke: "#3b0a0d", "stroke-width": 2 }],
     ["path", { d: "M20 12C30 7 42 8 48 13", stroke: "#f2f2f2", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }],
     ["circle", { cx: 30, cy: 38, r: 4, fill: "#3b0a0d" }],
     ["path", { d: "M58 30H46v16M46 38h12M46 46h8", stroke: "#b8bcc4", "stroke-width": 3, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }]]
      .forEach(([t, a]) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); s.append(e); });
    return s;
  };

  function show(o) {
    ov.style.background = o.solid ? "#14161a" : "#000c"; ov.style.display = "flex"; ov.replaceChildren();
    const b = el("div", "max-width:540px;padding:24px;background:#24272d;border:1px solid #3a3e45;border-radius:12px;text-align:left"), v = {};
    b.append(el("div", "display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #3a3e45", logo(34), el("b", "font-size:20px;letter-spacing:.5px", "Quarterback")), el("h2", "margin:0 0 10px", o.title || ""), el("div", "white-space:pre-line;line-height:1.45", o.text || ""));
    (o.inputs || []).forEach(([k, ph]) => { const i = el("input", "display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:8px;border-radius:6px;border:0"); i.placeholder = ph; v[k] = i; b.append(i); });
    if (o.consent) { const l = el("label", "display:block;margin:8px 0"), c = el("input"); c.type = "checkbox"; l.append(c, " " + o.consent); v.consent = c; b.append(l); }
    const btn = (n, f, bg) => { const x = el("button", `margin:10px 8px 0 0;padding:9px 18px;border:0;border-radius:8px;background:${bg};color:#fff;font:inherit;cursor:pointer`, n); x.onclick = () => f(v); b.append(x); };
    if (o.btn) btn(o.btn, o.on, "#8b1a1f");
    if (o.btn2) btn(o.btn2[0], o.btn2[1], "#3a3e45");
    ov.append(b);
  }

  function apply(s) {
    if (!s || !s.status) return;
    const wasLocked = st && st.status === "locked"; st = s;
    if (!s.live) return show({ title: "Exam ended", text: "Your professor ended this test.", solid: 1 });
    if (s.mode === "enforce") { bd.style.display = "block"; bd.textContent = Math.min(s.cur, s.max) + "/" + s.max; }
    if (s.status === "locked") return show({ title: "Exam locked", text: "You reached the strike limit. Your answers are saved.\nKeep this tab open, contact your professor on another device (give your name and the email you used), and wait to be unlocked.", solid: 1 });
    if (wasLocked) ov.style.display = "none";
  }

  async function begin(name, email) {
    const r = await send({ a: "start", f: F, rules: cfg, b: { test: cfg.id, name, email } });
    if (!r.key) return show({ title: "Cannot connect", text: "Could not reach the exam server. Check your connection and refresh the page.", solid: 1 });
    on = true; st = r.state; ov.style.display = "none"; apply(r.state);
  }

  const qNow = () => {
    let best = 0, bd2 = 1e9;
    [...document.querySelectorAll("[role=listitem]")].filter(e => e.querySelector("input,textarea,[role=radio],[role=checkbox],[role=listbox]"))
      .forEach((e, i) => { const r = e.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - innerHeight / 2); if (d < bd2) { bd2 = d; best = i + 1; } });
    return best;
  };

  const out = () => { if (on && !away) away = Date.now(); };
  async function back() {
    if (!on || !away || document.hidden || !document.hasFocus()) return;
    const secs = Math.round((Date.now() - away) / 1e3), prev = st ? st.cur : 0; away = null; retAt = Date.now();
    const r = await send({ a: "ev", e: { t: "leave", secs, q: lastQ } });
    apply(r.state);
    const s = r.state;
    if (s && s.mode === "enforce" && s.status === "active" && s.cur > prev)
      show(s.cur === 1 ? { title: "Warning", text: "You left the exam tab.", btn: "Continue exam", on: hide }
        : { title: "Final warning", text: "You left the exam tab again. One more and the exam locks. Your questions are hidden until you return.", btn: "Return to exam", on: hide, solid: 1 });
  }
  addEventListener("blur", out); addEventListener("focus", back);
  document.addEventListener("visibilitychange", () => document.hidden ? out() : back());

  document.addEventListener("fullscreenchange", () => {
    if (!on || !cfg.fullscreen || document.fullscreenElement) return;
    send({ a: "ev", e: { t: "fs", q: lastQ } });
    if (cfg.mode === "enforce") show({ title: "Return to fullscreen", text: "This exam must stay in fullscreen.", btn: "Return", on: () => { fs(); hide(); }, solid: 1 });
  });

  const att = (what, e) => {
    if (!on || (what !== "devtools" && !cfg.block_copy)) return;
    if (cfg.mode === "enforce") e.preventDefault();
    send({ a: "ev", e: { t: "attempt", what, q: lastQ } });
  };
  ["copy", "paste", "cut", "contextmenu"].forEach(n => document.addEventListener(n, e => att(n, e), true));
  document.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (e.key === "F12" || (e.ctrlKey && e.shiftKey && "ijc".includes(k)) || (e.ctrlKey && k === "u")) att("devtools", e);
  }, true);

  setInterval(async () => {
    if (!on) return;
    const q = qNow();
    if (q && q !== lastQ) { if (lastQ && retAt && Date.now() - retAt <= 1e4) send({ a: "ev", e: { t: "qmove", q } }); retAt = 0; lastQ = q; }
    if (++tick % 3 === 0) apply((await send({ a: "hb", q: lastQ })).state);
  }, 1000);

  const BEFORE = `Quarterback monitors this exam. Your professor can see:\n• each time you leave the exam tab, how long you were away and which question you were on\n• the domain (never the content) of sites you open\n• leaving fullscreen; copy, paste and developer-tools attempts\n• your strikes, current question and when you were last online\n\nNever seen: your answers or anything you type, the content of other pages, your webcam or your screen.` +
    (cfg.mode === "enforce" ? `\n\nEvery time you leave the exam tab is a strike. At ${cfg.max} strikes the exam locks.` : "");
  if (saved && saved.test === cfg.id)
    show({ title: "Welcome back, " + saved.name, text: "Continue your exam.", btn: "Continue exam", solid: 1, on: () => { fs(); begin(saved.name, saved.email); } });
  else
    show({ title: "Before you begin", text: BEFORE, inputs: [["n", "Your name"], ["e", "Email you are signed in to Google with"]], consent: "I understand and agree to be monitored.", btn: "Start exam", solid: 1,
      on: v => { if (!v.n.value.trim() || !v.e.value.includes("@") || !v.consent.checked) return alert("Enter your name and email, and tick the consent box."); fs(); begin(v.n.value.trim(), v.e.value.trim()); },
      btn2: ["I don't agree", () => show({ title: "Nothing is recorded", text: "Contact your professor.", solid: 1 })] });
})();
