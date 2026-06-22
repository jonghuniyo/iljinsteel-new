// Netlify Function — 환율 (Yahoo Finance)
const FX_PAIRS = [
  { symbol:'USDKRW=X', name:'달러', code:'USD', flag:'🇺🇸' },
  { symbol:'EURKRW=X', name:'유로', code:'EUR', flag:'🇪🇺' },
  { symbol:'JPYKRW=X', name:'엔화(100엔)', code:'JPY', flag:'🇯🇵', multiply:100 },
  { symbol:'CNYKRW=X', name:'위안', code:'CNY', flag:'🇨🇳' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

async function fetchFX(pair) {
  const enc = pair.symbol.replace('=','%3D');
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=7d`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('no result');
    const meta    = result.meta;
    const closes  = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result.timestamp ?? [];
    const price   = meta.regularMarketPrice;
    const prev    = meta.chartPreviousClose ?? meta.previousClose;
    const m       = pair.multiply ?? 1;
    const change  = prev ? (price - prev) : 0;
    const changePct = prev ? (change / prev) * 100 : 0;
    const history = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      value: closes[i] ? Math.round(closes[i] * m * 100) / 100 : null,
    })).filter(d => d.value != null).slice(-7);
    return {
      ...pair,
      rate: Math.round(price * m * 100) / 100,
      prev: Math.round(prev * m * 100) / 100,
      change: Math.round(change * m * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      history,
      ok: true,
    };
  } catch (e) {
    return { ...pair, rate: null, ok: false, error: e.message };
  }
}

export const handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 's-maxage=180',
  };
  try {
    const results = await Promise.all(FX_PAIRS.map(fetchFX));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, updatedAt: new Date().toISOString(), rates: results }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
