// 카카오 채널 게시물 URL에서 og:image를 추출합니다.
// 카카오가 SSR 메타 태그를 제공하지 않거나 접근을 제한할 경우, 프론트엔드는 링크형 fallback으로 저장합니다.

const DEFAULT_POST_URL = 'https://pf.kakao.com/_uFfAX/113306857';
const DEFAULT_WEEKLY_URL = 'https://pf.kakao.com/_uFfAX/posts';

function extractImageUrl(html = '') {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /"imageUrl"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"image_url"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /src=["'](https:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"']*)?)["']/i,
  ];

  for (const pat of patterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      try {
        return m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
      } catch {
        return m[1];
      }
    }
  }
  return null;
}

export const handler = async (event) => {
  const headers = {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Cache-Control':'s-maxage=300',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode:200, headers, body:'' };
  }

  try {
    const { url = DEFAULT_POST_URL } = JSON.parse(event.body ?? '{}');
    const targetUrl = String(url || DEFAULT_POST_URL).trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      return { statusCode:400, headers, body:JSON.stringify({ ok:false, error:'valid url required' }) };
    }

    const userAgents = [
      'Twitterbot/1.0',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
    ];

    let lastError = null;
    for (const ua of userAgents) {
      try {
        const res = await fetch(targetUrl, {
          headers:{ 'User-Agent':ua, Accept:'text/html,application/xhtml+xml' },
          signal:AbortSignal.timeout(9000),
          redirect:'follow',
        });
        const html = await res.text();
        const imageUrl = extractImageUrl(html);
        if (imageUrl) {
          return {
            statusCode:200,
            headers,
            body:JSON.stringify({ ok:true, imageUrl, postUrl:targetUrl, weeklyUrl:DEFAULT_WEEKLY_URL }),
          };
        }
        lastError = `image not found, status ${res.status}, html ${html.length}`;
      } catch (e) {
        lastError = e?.message || String(e);
      }
    }

    return {
      statusCode:200,
      headers,
      body:JSON.stringify({
        ok:false,
        error:'카카오 게시물에서 이미지를 자동 추출하지 못했습니다.',
        detail:lastError,
        postUrl:targetUrl,
        weeklyUrl:DEFAULT_WEEKLY_URL,
        fallback:'link',
      }),
    };
  } catch (e) {
    return { statusCode:500, headers, body:JSON.stringify({ ok:false, error:e?.message || String(e), fallback:'link' }) };
  }
};
