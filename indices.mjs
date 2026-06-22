// ILJIN Portal — 글로벌 주요 지수 프록시 (Yahoo Finance)
// 코스피(^KS11), 코스닥(^KQ11), 나스닥(^IXIC), 다우존스(^DJI)
// 주의: Yahoo Finance 비공식 API 참고값이며 실시간 시세가 아닙니다.

const INDICES = [
  { symbol: '^KS11', name: '코스피',  market: 'KRX',    color: '#0C4199' },
  { symbol: '^KQ11', name: '코스닥',  market: 'KOSDAQ',  color: '#3b82f6' },
  { symbol: '^IXIC', name: '나스닥',  market: 'NASDAQ',  color: '#22c55e' },
  { symbol: '^DJI',  name: '다우지수', market: 'NYSE',   color: '#f97316' },
];

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
  Accept: 'application/json,*/*',
};

async function fetchIndex(item) {
  const enc = encodeURIComponent(item.symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=5d`;

  try {
    const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

    const j = await res.json();
    const result = j?.chart?.result?.[0];
    const err = j?.chart?.error;
    if (!result) throw new Error(err?.description || err?.code || 'no result');

    const meta = result.meta ?? {};
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const cleanCloses = closes.filter(v => Number.isFinite(Number(v))).map(Number);

    const raw = Number(meta.regularMarketPrice ?? cleanCloses.at(-1));
    const prevRaw = Number(meta.previousClose ?? meta.regularMarketPreviousClose ?? cleanCloses.at(-2));

    if (!Number.isFinite(raw)) throw new Error('no market price');

    const price = Math.round(raw * 100) / 100;
    const prev  = Number.isFinite(prevRaw) ? Math.round(prevRaw * 100) / 100 : null;
    const change = prev != null ? Math.round((price - prev) * 100) / 100 : null;
    const changePct = prev ? Math.round((change / prev) * 10000) / 100 : null;

    return { ...item, price, prev, change, changePct, ok: true };
  } catch (e) {
    return { ...item, price: null, prev: null, change: null, changePct: null, ok: false, error: e?.message || String(e) };
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: '',
    };
  }

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 's-maxage=120, stale-while-revalidate=300',
  };

  try {
    const results = await Promise.all(INDICES.map(fetchIndex));
    const allFailed = results.every(r => !r.ok);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: !allFailed,
        updatedAt: new Date().toISOString(),
        indices: results,
        notes: [
          'Yahoo Finance 비공식 API 기반 참고값입니다. 실시간이 아닙니다.',
          '코스피(^KS11), 코스닥(^KQ11)은 Yahoo Finance가 제공하는 경우에만 표시됩니다.',
          '데이터 취득 실패 시 해당 지수는 null로 표시됩니다.',
        ],
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  }
};
