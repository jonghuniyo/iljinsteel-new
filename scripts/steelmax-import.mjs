import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://steelmax.co.kr";
const OUT = "data/steelmax-posts.json";
const UA = "ILJIN-Portal-Steelmax-Importer/1.0 (+permission-based-personal-use)";
const LIMIT = Number(process.env.STEELMAX_IMPORT_LIMIT || 0);

function stripHtml(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
  return { data: JSON.parse(text), headers: res.headers };
}

const posts = [];
for (let page = 1; page < 999; page++) {
  const url = new URL("/wp-json/wp/v2/posts", BASE);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("_fields", "id,date,modified,link,title,excerpt,content,categories");
  const { data, headers } = await getJson(url);
  for (const post of data) {
    posts.push({
      id: post.id,
      title: stripHtml(post.title?.rendered || ""),
      excerpt: stripHtml(post.excerpt?.rendered || ""),
      content: stripHtml(post.content?.rendered || ""),
      date: post.date,
      modified: post.modified,
      url: post.link,
      categories: post.categories || [],
      source: "Steelmax",
    });
  }
  console.log(`page ${page}: ${posts.length} posts`);
  const totalPages = Number(headers.get("x-wp-totalpages") || page);
  if (page >= totalPages) break;
  if (LIMIT && posts.length >= LIMIT) break;
  await new Promise((resolve) => setTimeout(resolve, 350));
}

await mkdir("data", { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: BASE, count: posts.length, posts }, null, 2));
console.log(`saved ${posts.length} posts to ${OUT}`);
