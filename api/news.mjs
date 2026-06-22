import { handler as netlifyHandler } from "../netlify/functions/news.mjs";

async function readBody(req) {
  if (req.body != null) {
    return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function queryFromReq(req) {
  const host = req.headers?.host || "localhost";
  const url = new URL(req.url || "/", `https://${host}`);
  return Object.fromEntries(url.searchParams.entries());
}

export default async function handler(req, res) {
  try {
    const event = {
      httpMethod: req.method || "GET",
      headers: req.headers || {},
      queryStringParameters: queryFromReq(req),
      body: ["GET", "HEAD", "OPTIONS"].includes(req.method || "GET") ? "" : await readBody(req),
    };

    const result = await netlifyHandler(event, {});
    const headers = result?.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      if (value != null) res.setHeader(key, value);
    }
    res.statusCode = result?.statusCode || 200;
    res.end(result?.body ?? "");
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok:false, error:err?.message || String(err) }));
  }
}
