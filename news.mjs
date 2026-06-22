// ILJIN Portal news proxy
// Domestic feeds include Google News RSS as a resilient fallback because some
// publisher RSS endpoints intermittently block serverless fetches.

const FEEDS = [
  { name:"한국경제", url:"https://www.hankyung.com/feed/economy", type:"ko" },
  { name:"한국경제", url:"https://www.hankyung.com/feed/politics", type:"ko" },
  { name:"Google 뉴스", url:"https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", type:"ko" },
  { name:"Google 뉴스", url:"https://news.google.com/rss/search?q=%EC%B2%A0%EA%B0%95%20OR%20%EA%B0%95%EA%B4%80%20OR%20%EA%B4%80%EC%84%B8&hl=ko&gl=KR&ceid=KR:ko", type:"ko" },
  { name:"Bloomberg", url:"https://feeds.bloomberg.com/markets/news.rss", type:"en" },
  { name:"Google News", url:"https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", type:"en" },
  { name:"Google News", url:"https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en", type:"en" },
];

const STEEL_KW = [
  "철강","강관","파이프","POSCO","포스코","현대제철","무계목","SMLS","관세",
  "steel","pipe","tariff","iron","nickel","니켈","알루미늄","구리","LME",
];

function decodeEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .trim();
}

function extractTag(str, tag) {
  const rx = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = str.match(rx);
  return m ? decodeEntities(m[1]) : "";
}

function extractLink(str) {
  let m = str.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
  if (m) {
    const text = decodeEntities(m[1]);
    const href = text.match(/https?:\/\/[^\s<"]+/i);
    if (href) return href[0];
  }
  m = str.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (m) return decodeEntities(m[1]);
  m = str.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  if (m) {
    const text = decodeEntities(m[1]);
    const href = text.match(/https?:\/\/[^\s<"]+/i);
    if (href) return href[0];
  }
  return "";
}

function normalizeGoogleTitle(title, source) {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

function parseRSS(xml, feed) {
  const items = [];
  const itemRx = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = itemRx.exec(xml)) !== null) {
    const chunk = m[2];
    const source = extractTag(chunk, "source") || feed.name;
    const title = normalizeGoogleTitle(extractTag(chunk, "title"), source);
    const link = extractLink(chunk);
    const pub = extractTag(chunk, "pubDate") || extractTag(chunk, "updated") || extractTag(chunk, "published");
    if (title && title.length > 3) {
      items.push({ title, link, pub, source, feedType:feed.type });
    }
  }
  return items;
}

function isSteelRelated(text = "") {
  const low = text.toLowerCase();
  return STEEL_KW.some(kw => low.includes(kw.toLowerCase()));
}

function rankItem(item) {
  return isSteelRelated(`${item.title} ${item.link}`) ? 8 : 0;
}

function sortNews(a, b) {
  const at = Date.parse(a.pub || "") || 0;
  const bt = Date.parse(b.pub || "") || 0;
  return bt - at;
}

export const handler = async () => {
  const headers = {
    "Content-Type":"application/json; charset=utf-8",
    "Access-Control-Allow-Origin":"*",
    "Cache-Control":"s-maxage=300, stale-while-revalidate=900",
  };

  try {
    const results = await Promise.allSettled(FEEDS.map(async feed => {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent":"Mozilla/5.0 (compatible; IljinPortal/1.0; +https://iljin.com)",
          "Accept":"application/rss+xml, application/xml, text/xml, */*",
        },
        signal:AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`${feed.name} HTTP ${res.status}`);
      const xml = await res.text();
      return parseRSS(xml, feed);
    }));

    const all = results
      .flatMap(r => r.status === "fulfilled" ? r.value : [])
      .filter((item, idx, arr) => arr.findIndex(other => other.title === item.title) === idx)
      .map(item => ({
        ...item,
        priority:rankItem(item),
        matchedKeywords:STEEL_KW.filter(kw => item.title.toLowerCase().includes(kw.toLowerCase())).slice(0, 3),
      }))
      .sort(sortNews);

    const domestic = all.filter(i => i.feedType === "ko");
    const international = all.filter(i => i.feedType === "en");
    const steel = all.filter(i => i.priority > 0);
    const failed = results
      .map((r, idx) => r.status === "rejected" ? `${FEEDS[idx].name}: ${r.reason?.message || r.reason}` : null)
      .filter(Boolean);

    return {
      statusCode:200,
      headers,
      body:JSON.stringify({
        ok:true,
        updatedAt:new Date().toISOString(),
        counts:{ domestic:domestic.length, international:international.length, steel:steel.length },
        failed,
        domestic:domestic.slice(0, 8),
        international:international.slice(0, 8),
        steel:steel.slice(0, 4),
        items:all.slice(0, 30),
      }),
    };
  } catch (err) {
    return {
      statusCode:500,
      headers,
      body:JSON.stringify({ ok:false, error:err?.message || String(err) }),
    };
  }
};
