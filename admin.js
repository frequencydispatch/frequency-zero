// Cloudflare Pages Function: /api/admin
// Requires:
//   - KV namespace bound as MESSAGES_KV
//   - Environment variable / secret ADMIN_KEY (set in Pages project settings)

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function isAuthorized(request, env) {
  const provided = request.headers.get("x-admin-key") || "";
  return Boolean(env.ADMIN_KEY) && provided === env.ADMIN_KEY;
}

function sanitizeCallsign(raw) {
  if (!raw) return "";
  return String(raw).trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "").slice(0, 32);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.MESSAGES_KV) {
    return jsonResponse({ error: "KV namespace MESSAGES_KV is not bound to this Pages project." }, 500);
  }
  if (!isAuthorized(request, env)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const indexData = await env.MESSAGES_KV.get("thread-index");
  const index = indexData ? JSON.parse(indexData) : [];

  const threads = {};
  for (const callsign of index) {
    const data = await env.MESSAGES_KV.get(`thread:${callsign}`);
    threads[callsign] = data ? JSON.parse(data) : [];
  }

  return jsonResponse({ threads });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.MESSAGES_KV) {
    return jsonResponse({ error: "KV namespace MESSAGES_KV is not bound to this Pages project." }, 500);
  }
  if (!isAuthorized(request, env)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }

  const callsign = sanitizeCallsign(body.callsign);
  const text = String(body.text || "").trim().slice(0, 2000);

  if (!callsign) return jsonResponse({ error: "missing or invalid callsign" }, 400);
  if (!text) return jsonResponse({ error: "missing reply text" }, 400);

  const key = `thread:${callsign}`;
  const existing = await env.MESSAGES_KV.get(key);
  const thread = existing ? JSON.parse(existing) : [];

  thread.push({ from: "operator", text, ts: Date.now() });

  const trimmed = thread.slice(-200);
  await env.MESSAGES_KV.put(key, JSON.stringify(trimmed));

  return jsonResponse({ ok: true });
}
