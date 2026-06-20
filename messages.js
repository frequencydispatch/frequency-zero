// Cloudflare Pages Function: /api/messages
// Requires a KV namespace bound as MESSAGES_KV in the Pages project settings.

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

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.MESSAGES_KV) {
    return jsonResponse({ error: "KV namespace MESSAGES_KV is not bound to this Pages project." }, 500);
  }

  const url = new URL(request.url);
  const callsign = sanitizeCallsign(url.searchParams.get("callsign"));
  if (!callsign) {
    return jsonResponse({ error: "missing callsign" }, 400);
  }

  const data = await env.MESSAGES_KV.get(`thread:${callsign}`);
  const thread = data ? JSON.parse(data) : [];
  return jsonResponse({ callsign, thread });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.MESSAGES_KV) {
    return jsonResponse({ error: "KV namespace MESSAGES_KV is not bound to this Pages project." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }

  const callsign = sanitizeCallsign(body.callsign);
  const text = String(body.text || "").trim().slice(0, 1000);

  if (!callsign) return jsonResponse({ error: "missing or invalid callsign" }, 400);
  if (!text) return jsonResponse({ error: "missing message text" }, 400);

  const key = `thread:${callsign}`;
  const existing = await env.MESSAGES_KV.get(key);
  const thread = existing ? JSON.parse(existing) : [];

  thread.push({ from: "visitor", text, ts: Date.now() });

  // Cap thread length to keep KV values small
  const trimmed = thread.slice(-200);
  await env.MESSAGES_KV.put(key, JSON.stringify(trimmed));

  // Maintain an index of all callsigns so the admin console can list them
  const indexData = await env.MESSAGES_KV.get("thread-index");
  const index = indexData ? JSON.parse(indexData) : [];
  if (!index.includes(callsign)) {
    index.push(callsign);
    await env.MESSAGES_KV.put("thread-index", JSON.stringify(index));
  }

  return jsonResponse({ ok: true });
}
