// Netlify Function — 환율
// 현재가/전일대비: Yahoo Finance (실시간성)
// 추세 그래프(history): Frankfurter(ECB, 무키)에서 가져옴.
//   → Yahoo의 CNYKRW=X 가 데이터 포인트를 1개만 주는 문제(그래프가 점으로만 표시)를 해결하고
//     모든 통화의 스파크라인이 일관된 다중 포인트를 갖도록 한다.
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

// Frankfurter: from=KRW, to=USD,EUR,JPY,CNY → 1KRW 당 외화 → 역수로 외화당 원화 환산
async function fetchFxHistory() {
  const f = (d) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = new Date(Date.now() - 16 * 864e5);
  const url = `https://api.frankfurter.app/${f(start)}..${f(end)}?from=KRW&to=USD,EUR,JPY,CNY`;
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`);
  const json = await res.json();
  const dates = Object.keys(json.rates || {}).sort();
  const byCode = {};
  for (const code of ['USD', 'EUR', 'JPY', 'CNY']) {
    byCode[code] = dates
      .map((d) => {
        const perKrw = json.rates[d]?.[code];
        return perKrw ? { date: d, krwPer: 1 / perKrw } : null;
      })
      .filter(Boolean)
      .slice(-8);
  }
  return byCode;
}

function buildHistory(fhist, m) {
  if (!fhist || fhist.length < 2) return null;
  return fhist.map((o) => ({ date: o.date, value: Math.round(o.krwPer * m * 100) / 100 }));
}

async function fetchFX(pair, fhist) {
  const m = pair.multiply ?? 1;
  const fHistory = buildHistory(fhist, m);
  const enc = pair.symbol.replace('=', '%3D');
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
    const change  = prev ? (price - prev) : 0;
    const changePct = prev ? (change / prev) * 100 : 0;
    // Yahoo 히스토리(폴백용): Frankfurter가 실패했을 때만 사용
    const yahooHistory = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      value: closes[i] ? Math.round(closes[i] * m * 100) / 100 : null,
    })).filter(d => d.value != null).slice(-7);
    return {
      ...pair,
      rate: Math.round(price * m * 100) / 100,
      prev: Math.round(prev * m * 100) / 100,
      change: Math.round(change * m * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      history: (fHistory && fHistory.length >= 2) ? fHistory : yahooHistory,
      ok: true,
    };
  } catch (e) {
    // Yahoo 실패 시 Frankfurter 마지막 값으로 현재가/그래프를 채워 카드가 사라지지 않게 함
    if (fHistory && fHistory.length >= 2) {
      const last = fHistory[fHistory.length - 1].value;
      const prevV = fHistory[fHistory.length - 2].value;
      const change = Math.round((last - prevV) * 100) / 100;
      return {
        ...pair,
        rate: last,
        prev: prevV,
        change,
        changePct: prevV ? Math.round((change / prevV) * 10000) / 100 : 0,
        history: fHistory,
        ok: true,
        source: 'frankfurter',
      };
    }
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
    let histMap = {};
    try { histMap = await fetchFxHistory(); } catch { histMap = {}; }
    const results = await Promise.all(FX_PAIRS.map((p) => fetchFX(p, histMap[p.code])));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, updatedAt: new Date().toISOString(), rates: results }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
