const store = globalThis.__iljinFocusStore || (globalThis.__iljinFocusStore = new Map());
const TTL_MS = 1000 * 60 * 20;

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Cache-Control": "no-store",
};

function nowIso() {
  return new Date().toISOString();
}

function prune() {
  const now = Date.now();
  for (const [id, item] of store.entries()) {
    if (!item.updatedAtMs || now - item.updatedAtMs > TTL_MS) store.delete(id);
  }
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  prune();

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, updatedAt: nowIso(), sessions: [...store.values()] }),
    };
  }

  if (event.httpMethod === "POST") {
    const body = parseBody(event);
    const id = String(body.id || "").trim();
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "id required" }) };

    const item = {
      id,
      name: String(body.name || "익명").trim().slice(0, 12) || "익명",
      animal: ["cat", "hamster", "dog"].includes(body.animal) ? body.animal : "hamster",
      status: ["idle", "running", "paused"].includes(body.status) ? body.status : "idle",
      elapsed: Math.max(0, Math.floor(Number(body.elapsed) || 0)),
      x: Number.isFinite(Number(body.x)) ? Number(body.x) : null,
      y: Number.isFinite(Number(body.y)) ? Number(body.y) : null,
      order: Math.max(0, Math.floor(Number(body.order) || 0)),
      updatedAt: nowIso(),
      updatedAtMs: Date.now(),
    };
    store.set(id, item);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, item, sessions: [...store.values()] }),
    };
  }

  if (event.httpMethod === "DELETE") {
    const body = parseBody(event);
    const id = String(body.id || event.queryStringParameters?.id || "").trim();
    if (id) store.delete(id);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "method not allowed" }) };
};
