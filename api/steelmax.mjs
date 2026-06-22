const STEELMAX_BASE = "https://steelmax.co.kr";
const UA = "ILJIN-Portal-Steelmax-Importer/1.0 (+personal-use; contact: portal-user)";

function send(res, status, data, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", extraHeaders["Cache-Control"] || "s-maxage=900, stale-while-revalidate=3600");
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(data));
}

function getQuery(req) {
  const host = req.headers?.host || "localhost";
  const url = new URL(req.url || "/", `https://${host}`);
  return Object.fromEntries(url.searchParams.entries());
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": UA,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Steelmax API ${res.status}: ${text.slice(0, 160)}`);
    return { data: JSON.parse(text), headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": UA,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Steelmax fetch ${res.status}: ${text.slice(0, 160)}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function stripHtml(html = "") {
  return decodeEntities(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function cleanSteelContent(text = "") {
  const lines = String(text)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const dropLine = [
    /^STEELMAX\s+Steel\s+Story$/i,
    /^Steel\s+Story$/i,
    /^STEELMAX$/i,
  ];
  const tailStart = [
    /스틸맥스는\s+연구소\s+수준/i,
    /Citius,\s*Altius,\s*Fortius/i,
    /^Tel\s*:/i,
    /^International\s*:/i,
    /구매.*문의.*견적/i,
    /Contact\s+us/i,
    /steelmax\.co\.kr\/contact/i,
  ];
  const kept = [];
  for (const line of lines) {
    if (tailStart.some((pattern) => pattern.test(line))) break;
    if (dropLine.some((pattern) => pattern.test(line))) continue;
    kept.push(line);
  }
  return kept.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizePost(post) {
  const title = stripHtml(post?.title?.rendered || post?.title || "제목 없음");
  const contentText = cleanSteelContent(stripHtml(post?.content?.rendered || post?.content || ""));
  const excerpt = cleanSteelContent(stripHtml(post?.excerpt?.rendered || post?.excerpt || "")).slice(0, 320);
  const categories = Array.isArray(post?.categories) ? post.categories : [];
  return {
    id: post?.id,
    title,
    excerpt: excerpt || contentText.slice(0, 260),
    content: contentText,
    date: post?.date || post?.modified || null,
    modified: post?.modified || null,
    url: post?.link || null,
    categories,
    source: "Steelmax",
  };
}

function buildWpUrl(path, params = {}) {
  const url = new URL(path, `${STEELMAX_BASE}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function listCategories() {
  const { data } = await fetchJson(buildWpUrl("/wp-json/wp/v2/categories", { per_page: 100, hide_empty: true }));
  return data.map((cat) => ({
    id: cat.id,
    name: stripHtml(cat.name),
    slug: cat.slug,
    count: cat.count,
    parent: cat.parent,
  })).filter((cat) => cat.count > 0);
}

async function searchPosts(query) {
  const q = (query.q || "").trim();
  const page = Math.max(1, Math.min(50, Number(query.page || 1) || 1));
  const perPage = Math.max(5, Math.min(50, Number(query.per_page || 20) || 20));
  const params = {
    per_page: perPage,
    page,
    search: q,
    orderby: query.orderby || (q ? "relevance" : "date"),
    order: "desc",
    _fields: "id,date,modified,link,title,excerpt,categories",
  };
  if (query.category) params.categories = query.category;
  const { data, headers } = await fetchJson(buildWpUrl("/wp-json/wp/v2/posts", params));
  return {
    items: data.map(normalizePost),
    page,
    perPage,
    total: Number(headers.get("x-wp-total") || 0),
    totalPages: Number(headers.get("x-wp-totalpages") || 0),
    query: q,
  };
}

async function getPost(query) {
  if (query.id) {
    const { data } = await fetchJson(buildWpUrl(`/wp-json/wp/v2/posts/${encodeURIComponent(query.id)}`, {
      _fields: "id,date,modified,link,title,excerpt,content,categories",
    }));
    return normalizePost(data);
  }
  if (query.url) {
    const url = new URL(query.url);
    if (!url.hostname.endsWith("steelmax.co.kr")) throw new Error("Steelmax URL만 조회할 수 있습니다.");
    const html = await fetchText(url.toString());
    const title = stripHtml((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [null, "제목 없음"])[1]);
    const article = (html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<body[\s\S]*?<\/body>/i) || [""])[0];
    return {
      id: null,
      title,
    excerpt: cleanSteelContent(stripHtml(article)).slice(0, 320),
    content: cleanSteelContent(stripHtml(article)),
      date: null,
      modified: null,
      url: url.toString(),
      categories: [],
      source: "Steelmax",
    };
  }
  throw new Error("id 또는 url이 필요합니다.");
}

async function sitemap(query) {
  const limit = Math.max(20, Math.min(500, Number(query.limit || 120) || 120));
  const candidates = [
    `${STEELMAX_BASE}/wp-sitemap-posts-post-1.xml`,
    `${STEELMAX_BASE}/post-sitemap.xml`,
    `${STEELMAX_BASE}/sitemap.xml`,
  ];
  const urls = [];
  for (const candidate of candidates) {
    try {
      const xml = await fetchText(candidate);
      const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)].map((m) => decodeEntities(m[1]).trim());
      for (const loc of matches) {
        if (loc.includes("steelmax.co.kr") && !urls.includes(loc)) urls.push(loc);
        if (urls.length >= limit) break;
      }
      if (urls.length) break;
    } catch {}
  }
  return { items: urls.slice(0, limit).map((url, idx) => ({ id: idx + 1, url })), total: urls.length };
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    const query = getQuery(req);
    const action = query.action || "search";
    if (action === "categories") return send(res, 200, { ok: true, categories: await listCategories() });
    if (action === "post") return send(res, 200, { ok: true, post: await getPost(query) });
    if (action === "sitemap") return send(res, 200, { ok: true, ...(await sitemap(query)) });
    return send(res, 200, { ok: true, ...(await searchPosts(query)) });
  } catch (err) {
    send(res, 500, {
      ok: false,
      error: err?.message || String(err),
      hint: "Steelmax 원본 사이트 또는 WordPress REST API 응답을 확인하세요.",
    }, { "Cache-Control": "no-store" });
  }
}
