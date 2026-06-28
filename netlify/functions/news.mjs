// ILJIN Portal news proxy
// Domestic feeds include Google News RSS as a resilient fallback because some
// publisher RSS endpoints intermittently block serverless fetches.

const gnewsKo = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
const gnewsEn = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const FEEDS = [
  // ── 국내 (다양한 언론사) ──
  { name:"한국경제", url:"https://www.hankyung.com/feed/economy", type:"ko" },
  { name:"한국경제", url:"https://www.hankyung.com/feed/politics", type:"ko" },
  { name:"연합뉴스", url:"https://www.yna.co.kr/rss/economy.xml", type:"ko" },
  { name:"연합뉴스", url:"https://www.yna.co.kr/rss/industry.xml", type:"ko" },
  { name:"매일경제", url:"https://www.mk.co.kr/rss/30000001/", type:"ko" },
  { name:"한겨레", url:"https://www.hani.co.kr/rss/economy/", type:"ko" },
  { name:"Google 뉴스", url:"https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko", type:"ko" },
  { name:"Google 뉴스", url:gnewsKo("철강 OR 강관 OR 관세 OR 무계목"), type:"ko" },
  { name:"Google 뉴스", url:gnewsKo("포스코 OR 현대제철 OR 세아 OR 원자재 가격"), type:"ko" },
  // ── 해외 ──
  { name:"Bloomberg", url:"https://feeds.bloomberg.com/markets/news.rss", type:"en" },
  { name:"Mining.com", url:"https://www.mining.com/feed/", type:"en" },
  { name:"Google News", url:"https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en", type:"en" },
  { name:"Google News", url:gnewsEn("steel price OR steel tariff OR iron ore OR nickel"), type:"en" },
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

// ── 중복 기사 제거 ──
// 같은 기사가 여러 소스(언론사 직접 피드 / 구글 / 네이버)에서 중복 수집되므로,
// 제목을 정규화(괄호·말머리·언론사 꼬리표·기호 제거)하고 링크를 표준화해서 비교한다.
function normTitle(t = "") {
  return String(t)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")              // [속보] [단독] 등 말머리
    .replace(/\([^)]*\)/g, " ")               // (종합) 등
    .replace(/[“”"'‘’`]/g, "")
    .replace(/\s*[-–—|·:]\s*[^-–—|·:]{1,25}$/, "") // 끝에 붙는 " - 언론사" / 섹션명
    .replace(/[^\p{L}\p{N}]+/gu, "")          // 공백·기호 모두 제거
    .trim();
}

function normLink(l = "") {
  try {
    const u = new URL(l);
    return (u.hostname.replace(/^www\./, "") + u.pathname).toLowerCase().replace(/\/+$/, "");
  } catch {
    return String(l || "").toLowerCase().split(/[?#]/)[0];
  }
}

// 해외(영어) 섹션 필터: Bloomberg 등 일부 영어 피드에 일본어/중국어 기사가 섞여 들어오므로
// 일본어 가나·한중일 한자·한글이 포함된 제목은 제외하고, 라틴 문자가 있는 영어 기사만 남긴다.
function isEnglishText(t = "") {
  const s = String(t);
  if (/[぀-ヿ一-鿿가-힣]/u.test(s)) return false;
  return /[A-Za-z]/.test(s);
}

function dedupe(items) {
  const seenTitle = new Set();
  const seenLink = new Set();
  const out = [];
  for (const it of items) {
    const nt = normTitle(it.title);
    const nl = normLink(it.link);
    const titleDup = nt.length >= 6 && seenTitle.has(nt);
    const linkDup = nl && seenLink.has(nl);
    if (titleDup || linkDup) continue;
    if (nt.length >= 6) seenTitle.add(nt);
    if (nl) seenLink.add(nl);
    out.push(it);
  }
  return out;
}

// ── 네이버 뉴스 ───────────────────────────────────────────────
// 환경변수(NAVER_CLIENT_ID/SECRET)가 있으면 공식 검색 API를 사용하고,
// 없으면 네이버 뉴스 검색결과 페이지를 스크래핑해서 제목/링크를 가져온다.
const NAVER_QUERIES = ["철강", "강관", "포스코 현대제철", "원자재 가격", "국내 경제"];

function getNaverKeys() {
  const id = process.env.NAVER_CLIENT_ID || process.env.NAVER_ID || process.env.X_NAVER_CLIENT_ID || "";
  const secret = process.env.NAVER_CLIENT_SECRET || process.env.NAVER_SECRET || process.env.X_NAVER_CLIENT_SECRET || "";
  return id && secret ? { id, secret } : null;
}

function stripHtml(value = "") {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ""));
}

async function fetchNaverApi(keys) {
  const out = [];
  await Promise.allSettled(NAVER_QUERIES.map(async (q) => {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=10&sort=date`;
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": keys.id,
        "X-Naver-Client-Secret": keys.secret,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`Naver API HTTP ${res.status}`);
    const json = await res.json();
    for (const it of json.items || []) {
      const title = stripHtml(it.title);
      const link = it.originallink || it.link || "";
      if (title && title.length > 3) out.push({ title, link, pub: it.pubDate || "", source: "네이버뉴스", feedType: "ko" });
    }
  }));
  return out;
}

async function fetchNaverScrape() {
  const out = [];
  await Promise.allSettled(NAVER_QUERIES.map(async (q, qi) => {
    const url = `https://search.naver.com/search.naver?where=news&sort=1&query=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`Naver HTTP ${res.status}`);
    const html = await res.text();
    const seen = new Set();
    // 네이버 뉴스 검색결과(2024+ sds-comps 레이아웃): 제목 링크는 data-heatmap-target=".tit",
    // 제목 텍스트는 headline1 스팬에 들어있다.
    const rx = /<a\b([^>]*data-heatmap-target="\.tit"[^>]*)>\s*<span[^>]*sds-comps-text-type-headline1[^>]*>([\s\S]*?)<\/span>/gi;
    let m;
    let i = 0;
    while ((m = rx.exec(html)) !== null && i < 8) {
      const href = (m[1].match(/href="([^"]*)"/) || [])[1] || "";
      const title = stripHtml(m[2]);
      if (title && title.length > 3 && href && !seen.has(title)) {
        seen.add(title);
        out.push({
          title,
          link: href,
          // 스크래핑 항목은 정확한 게시시각이 없어, 최근 몇 시간에 걸쳐 분산시켜
          // 한국경제/구글 등 실제 게시시각 항목과 자연스럽게 섞이도록 한다.
          pub: new Date(Date.now() - (5 + qi * 40 + i * 15) * 60000).toISOString(),
          source: "네이버뉴스",
          feedType: "ko",
        });
        i += 1;
      }
    }
  }));
  return out;
}

async function fetchNaver() {
  try {
    const keys = getNaverKeys();
    return keys ? await fetchNaverApi(keys) : await fetchNaverScrape();
  } catch {
    return [];
  }
}

export const handler = async () => {
  const headers = {
    "Content-Type":"application/json; charset=utf-8",
    "Access-Control-Allow-Origin":"*",
    "Cache-Control":"s-maxage=300, stale-while-revalidate=900",
  };

  try {
    const [results, naverItems] = await Promise.all([
      Promise.allSettled(FEEDS.map(async feed => {
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
      })),
      fetchNaver(),
    ]);

    const all = dedupe(
      results
        .flatMap(r => r.status === "fulfilled" ? r.value : [])
        .concat(naverItems)
    )
      .map(item => ({
        ...item,
        priority:rankItem(item),
        matchedKeywords:STEEL_KW.filter(kw => item.title.toLowerCase().includes(kw.toLowerCase())).slice(0, 3),
      }))
      .sort(sortNews);

    const domestic = all.filter(i => i.feedType === "ko");
    const international = all.filter(i => i.feedType === "en" && isEnglishText(i.title));
    const domesticTop = domestic.slice(0, 8);
    // 철강·관세 체크 섹션은 '국내 주요 뉴스'에 이미 노출된 기사와 겹치지 않게 한다.
    const shownLinks = new Set(domesticTop.map(i => normLink(i.link)));
    const steel = all.filter(i => i.priority > 0 && !shownLinks.has(normLink(i.link)));
    const failed = results
      .map((r, idx) => r.status === "rejected" ? `${FEEDS[idx].name}: ${r.reason?.message || r.reason}` : null)
      .filter(Boolean);

    return {
      statusCode:200,
      headers,
      body:JSON.stringify({
        ok:true,
        updatedAt:new Date().toISOString(),
        counts:{ domestic:domestic.length, international:international.length, steel:steel.length, naver:all.filter(i => i.source === "네이버뉴스").length },
        failed,
        domestic:domesticTop,
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
