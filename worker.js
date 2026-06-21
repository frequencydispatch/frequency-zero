// FREQUENCY ZERO — combined Worker entry point
// Handles /api/messages and /api/admin directly, serves every other
// request (index.html, archive.html, styles.css, mp3 files, etc.) as a
// static asset via the ASSETS binding.

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function sanitizeCallsign(raw) {
  if (!raw) return "";
  return String(raw).trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "").slice(0, 32);
}

function isAuthorized(request, env) {
  const provided = request.headers.get("x-admin-key") || "";
  return Boolean(env.ADMIN_KEY) && provided === env.ADMIN_KEY;
}

/* ---------------- /api/messages (public) ---------------- */

async function handleMessagesGet(request, env) {
  if (!env.MESSAGES_KV) {
    return jsonResponse({ error: "KV namespace MESSAGES_KV is not bound to this Worker." }, 500);
  }
  const url = new URL(request.url);
  const callsign = sanitizeCallsign(url.searchParams.get("callsign"));
  if (!callsign) return jsonResponse({ error: "missing callsign" }, 400);

  const data = await env.MESSAGES_KV.get(`thread:${callsign}`);
  const thread = data ? JSON.parse(data) : [];
  return jsonResponse({ callsign, thread });
}

async function handleMessagesPost(request, env) {
  if (!env.MESSAGES_KV) {
    return jsonResponse({ error: "KV namespace MESSAGES_KV is not bound to this Worker." }, 500);
  }
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse({ error: "invalid JSON body" }, 400); }

  const callsign = sanitizeCallsign(body.callsign);
  const text = String(body.text || "").trim().slice(0, 1000);
  if (!callsign) return jsonResponse({ error: "missing or invalid callsign" }, 400);
  if (!text) return jsonResponse({ error: "missing message text" }, 400);

  const key = `thread:${callsign}`;
  const existing = await env.MESSAGES_KV.get(key);
  const thread = existing ? JSON.parse(existing) : [];
  thread.push({ from: "visitor", text, ts: Date.now() });
  await env.MESSAGES_KV.put(key, JSON.stringify(thread.slice(-200)));

  const indexData = await env.MESSAGES_KV.get("thread-index");
  const index = indexData ? JSON.parse(indexData) : [];
  if (!index.includes(callsign)) {
    index.push(callsign);
    await env.MESSAGES_KV.put("thread-index", JSON.stringify(index));
  }

  return jsonResponse({ ok: true });
}

/* ---------------- /api/admin (password protected) ---------------- */

async function handleAdminGet(request, env) {
  if (!env.MESSAGES_KV) {
    return jsonResponse({ error: "KV namespace MESSAGES_KV is not bound to this Worker." }, 500);
  }
  if (!isAuthorized(request, env)) return jsonResponse({ error: "unauthorized" }, 401);

  const indexData = await env.MESSAGES_KV.get("thread-index");
  const index = indexData ? JSON.parse(indexData) : [];
  const threads = {};
  for (const callsign of index) {
    const data = await env.MESSAGES_KV.get(`thread:${callsign}`);
    threads[callsign] = data ? JSON.parse(data) : [];
  }
  return jsonResponse({ threads });
}

async function handleAdminPost(request, env) {
  if (!env.MESSAGES_KV) {
    return jsonResponse({ error: "KV namespace MESSAGES_KV is not bound to this Worker." }, 500);
  }
  if (!isAuthorized(request, env)) return jsonResponse({ error: "unauthorized" }, 401);

  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse({ error: "invalid JSON body" }, 400); }

  const callsign = sanitizeCallsign(body.callsign);
  const text = String(body.text || "").trim().slice(0, 2000);
  if (!callsign) return jsonResponse({ error: "missing or invalid callsign" }, 400);
  if (!text) return jsonResponse({ error: "missing reply text" }, 400);

  const key = `thread:${callsign}`;
  const existing = await env.MESSAGES_KV.get(key);
  const thread = existing ? JSON.parse(existing) : [];
  thread.push({ from: "operator", text, ts: Date.now() });
  await env.MESSAGES_KV.put(key, JSON.stringify(thread.slice(-200)));

  return jsonResponse({ ok: true });
}

/* ---------------- router ---------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/messages") {
      if (request.method === "GET") return handleMessagesGet(request, env);
      if (request.method === "POST") return handleMessagesPost(request, env);
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/api/admin") {
      if (request.method === "GET") return handleAdminGet(request, env);
      if (request.method === "POST") return handleAdminPost(request, env);
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    // Everything else: serve the static site (HTML, CSS, JS, MP3s).
    return env.ASSETS.fetch(request);
  }
};
