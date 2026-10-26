#!/usr/bin/env python3
"""Quarterback server: professor dashboard + API. Run: python server.py [--port 8765]"""
import argparse, hashlib, io, json, os, re, secrets, threading, time, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
DBF, LOCK = os.path.join(HERE, "data.json"), threading.Lock()
DB = {"users": {}, "tokens": {}, "tests": {}, "attempts": {}}
if os.path.exists(DBF):
    DB.update(json.load(open(DBF)))
EV = {"leave", "allowed", "blocked", "attempt", "fs", "qmove", "gap", "done"}
FORM = re.compile(r"docs\.google\.com/forms/d/e/([\w-]+)/viewform")
save = lambda: json.dump(DB, open(DBF, "w"))
hpw = lambda pw, salt: hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 100000).hex()
lst = lambda s: [x.lower() for x in re.split(r"[,\s]+", s or "") if x]


def score(a):
    ev = a["events"]
    n = lambda t: sum(1 for e in ev if e["t"] == t)
    secs = sum(e["secs"] for e in ev if e["t"] == "leave")
    return max(0, round(100 - 10 * n("leave") - min(30, .5 * secs) - 15 * n("blocked")
                        - 5 * n("qmove") - min(10, 2 * n("attempt"))))


def state(a, t):
    cur = a["strikes"] - a["base"]
    if t["mode"] == "enforce" and cur >= t["max"] and a["status"] == "active":
        a["status"] = "locked"
    return {"status": a["status"], "cur": cur, "max": t["max"], "mode": t["mode"],
            "live": t["live"] and not t["ended"]}


def handle(p, q, d, tok):
    now, T, A = time.time(), DB["tests"], DB["attempts"]
    if p in ("/api/login", "/api/register"):
        e, pw = d.get("email", "").strip().lower(), d.get("password", "")
        u = DB["users"].get(e)
        if p == "/api/register":
            if u or "@" not in e or len(pw) < 6:
                return {"error": "Use a valid, unused email and a password of 6+ characters."}, 400
            salt = secrets.token_hex(8)
            DB["users"][e] = {"salt": salt, "hash": hpw(pw, salt)}
        elif not u or u["hash"] != hpw(pw, u["salt"]):
            return {"error": "Wrong email or password."}, 401
        t = secrets.token_hex(16)
        DB["tokens"][t] = e
        save()
        return {"token": t}, 200
    if p == "/api/lookup":
        for t in T.values():
            if t["form"] == q.get("f", [""])[0] and t["live"] and not t["ended"]:
                return {"cfg": {k: t[k] for k in ("id", "title", "mode", "max", "fullscreen", "block_copy", "blocked", "allow")}}, 200
        return {}, 200
    if p == "/api/start":
        t = T.get(d.get("test"))
        em, nm = d.get("email", "").strip().lower(), d.get("name", "").strip()[:80]
        if not t or not t["live"] or t["ended"]:
            return {"error": "Test is not live."}, 404
        if not em or not nm:
            return {"error": "Name and email required."}, 400
        k = t["id"] + "|" + em
        a = A.setdefault(k, {"key": k, "test": t["id"], "name": nm, "email": em, "status": "active",
                             "strikes": 0, "base": 0, "q": 0, "seen": now, "events": []})
        a["seen"] = now
        save()
        return {"key": k, "state": state(a, t)}, 200
    if p in ("/api/ev", "/api/hb"):
        a = A.get(d.get("key"))
        if not a:
            return {"error": "Unknown attempt."}, 404
        t = T[a["test"]]
        if now - a["seen"] > 30:
            a["events"].append({"t": "gap", "ts": now, "secs": round(now - a["seen"]), "q": a["q"]})
        a["seen"] = now
        if p == "/api/hb":
            a["q"] = int(d.get("q") or a["q"])
        else:
            e = d.get("e", {})
            if e.get("t") in EV:
                ev = {"t": e["t"], "ts": now, "secs": min(86400, max(0, int(e.get("secs") or 0))),
                      "q": int(e.get("q") or a["q"])}
                if e.get("what"): ev["what"] = str(e["what"])[:40]
                dm = e.get("domains") or ([e["domain"]] if e.get("domain") else [])
                if dm: ev["domain"] = ",".join(map(str, dm))[:200]
                a["events"].append(ev)
                a["strikes"] = sum(1 for x in a["events"] if x["t"] == "leave")
                if ev["t"] == "done" and a["status"] == "active":
                    a["status"] = "done"
            save()
        return {"state": state(a, t)}, 200
    me = DB["tokens"].get(tok)
    if not me:
        return {"error": "Sign in first."}, 401
    if p == "/api/tests":
        if d:
            m = FORM.search(d.get("form", ""))
            if not m:
                return {"error": "Paste the Form link ending in /viewform (Send > link), not the editor link."}, 400
            tid = d.get("id") or secrets.token_hex(4)
            old = T.get(tid, {"live": False, "ended": False, "owner": me})
            if old["owner"] != me:
                return {"error": "Not your test."}, 403
            T[tid] = {**old, "id": tid, "title": d.get("title", "Untitled")[:80], "form": m.group(1),
                      "max": max(1, int(d.get("max") or 3)), "mode": "record" if d.get("mode") == "record" else "enforce",
                      "fullscreen": bool(d.get("fullscreen")), "block_copy": bool(d.get("block_copy")),
                      "blocked": lst(d.get("blocked")), "allow": lst(d.get("allow")), "formurl": d["form"]}
            save()
        return [t for t in T.values() if t["owner"] == me], 200
    t = T.get(d.get("id") or q.get("test", [""])[0])
    if not t or t["owner"] != me:
        return {"error": "Unknown test."}, 404
    if p == "/api/live":
        t["live"], t["ended"] = bool(d.get("on")), False
    elif p == "/api/end":
        t["live"], t["ended"] = False, True
    elif p == "/api/unlock":
        a = A.get(d.get("key"))
        if a and a["test"] == t["id"]:
            a["status"], a["base"] = "active", a["strikes"]
    elif p == "/api/attempts":
        return [dict(a, score=score(a), online=now - a["seen"] < 10) for a in A.values() if a["test"] == t["id"]], 200
    else:
        return {"error": "Not found."}, 404
    save()
    return {}, 200


PUBLIC = "http://localhost:8765"


def ext_zip():
    """Student download: the dist folder with this server's address already set."""
    root, buf = os.path.join(HERE, "..", "dist"), io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in os.listdir(root):
            data = open(os.path.join(root, f), "rb").read()
            if f == "config.js":
                data = f'export const SERVER = "{PUBLIC}";\n'.encode()
            z.writestr("quarterback-extension/dist/" + f, data)
    return buf.getvalue()


class H(BaseHTTPRequestHandler):
    def log_message(s, *a): pass

    def go(s, m):
        u = urlparse(s.path)
        if m == "GET" and u.path == "/extension.zip":
            b, ct, code = ext_zip(), "application/zip", 200
        elif m == "GET" and not u.path.startswith("/api/"):
            b, ct, code = open(os.path.join(HERE, "dashboard.html"), "rb").read(), "text/html", 200
        else:
            d = json.loads(s.rfile.read(int(s.headers.get("Content-Length", 0))) or b"{}") if m == "POST" else {}
            try:
                with LOCK:
                    r, code = handle(u.path, parse_qs(u.query), d, s.headers.get("Authorization", ""))
            except Exception as e:
                r, code = {"error": str(e)}, 400
            b, ct = json.dumps(r).encode(), "application/json"
        s.send_response(code)
        s.send_header("Content-Type", ct)
        if ct == "application/zip":
            s.send_header("Content-Disposition", "attachment; filename=quarterback-extension.zip")
        s.send_header("Content-Length", str(len(b)))
        s.end_headers()
        s.wfile.write(b)

    do_GET = lambda s: s.go("GET")
    do_POST = lambda s: s.go("POST")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--public", default="", help="address students use, if not the LAN address")
    a = ap.parse_args()
    import socket
    try:
        x = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); x.connect(("10.255.255.255", 1)); ip = x.getsockname()[0]
    except OSError:
        ip = "127.0.0.1"
    PUBLIC = (a.public or f"http://{ip}:{a.port}").rstrip("/")
    print(f"Quarterback running.\n  Dashboard:          {PUBLIC}\n  Student extension:  {PUBLIC}/extension.zip", flush=True)
    ThreadingHTTPServer(("0.0.0.0", a.port), H).serve_forever()
