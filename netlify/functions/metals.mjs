// ILJIN Portal — 원자재/유가 시세 프록시
// 수정사항:
// 1) 프론트엔드가 category 필드로 필터링하므로 cat/category를 모두 반환
// 2) 천연가스 Yahoo 심볼 오타(GNF=F)를 NG=F로 수정
// 3) 정확도 이슈 방지를 위해 외부 API 장애 시 샘플 가격을 표시하지 않음
// 4) chartPreviousClose(조회 범위 직전값) 대신 실제 이전 종가/최근 종가 배열 기준으로 전일대비 계산

const SYMBOLS = [
  { symbol:'HG=F',  name:'구리 (Cu)',   category:'metal', raw:'USD/lb',  f:2204.62, unit:'USD/MT',  color:'#f97316' },
  { symbol:'ALI=F', name:'알루미늄 (Al)', category:'metal', raw:'USD/MT',  f:1,       unit:'USD/MT',  color:'#3b82f6' },
  { symbol:'GC=F',  name:'금 (Au)',     category:'metal', raw:'USD/oz',  f:1,       unit:'USD/oz',  color:'#fbbf24' },
  { symbol:'HRC=F', name:'철강 HRC',      category:'steel', raw:'USD/ST',  f:1.10231, unit:'USD/MT',  color:'#64748b' },
  { symbol:'CL=F',  name:'WTI 원유',      category:'oil',   raw:'USD/bbl', f:1,       unit:'USD/bbl', color:'#0C4199' },
  { symbol:'BZ=F',  name:'브렌트 원유',    category:'oil',   raw:'USD/bbl', f:1,       unit:'USD/bbl', color:'#1d4ed8' },
];

const SAMPLE_PRICE = {
  'HG=F': 10550,
  'ALI=F': 2620,
  'GC=F': 2340,
  'HRC=F': 880,
  'TIO=F': 105,
  'CL=F': 78,
  'BZ=F': 82,
};

const H = {
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
  Accept:'application/json,text/plain,*/*',
};

function normalizeItem(item) {
  return { ...item, cat:item.category, category:item.category };
}

function sampleHistory(base, days = 20) {
  const today = new Date();
  return Array.from({ length: days }, (_, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - idx));
    const wave = Math.sin(idx / 2.7) * 0.018 + Math.cos(idx / 5.1) * 0.012;
    return {
      date: d.toISOString().slice(0, 10),
      value: Math.round(base * (1 + wave) * 100) / 100,
    };
  });
}

function fallbackOne(item, reason = 'market data unavailable') {
  return {
    ...normalizeItem(item),
    price:null,
    prev:null,
    change:null,
    changePct:null,
    history:[],
    ok:false,
    demo:true,
    source:'unavailable',
    error:reason,
  };
}

async function fetchOne(item) {
  const enc = encodeURIComponent(item.symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=30d`;

  try {
    const res = await fetch(url, { headers:H, signal:AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

    const j = await res.json();
    const result = j?.chart?.result?.[0];
    const err = j?.chart?.error;
    if (!result) throw new Error(err?.description || err?.code || 'no result');

    const meta = result.meta ?? {};
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const stamps = result.timestamp ?? [];
    const cleanCloses = closes.filter(v => Number.isFinite(Number(v))).map(Number);
    const raw = Number(meta.regularMarketPrice ?? cleanCloses.at(-1));
    // 주의: chartPreviousClose는 30일 조회 범위 직전값일 수 있어 전일대비가 과장될 수 있음.
    // 실제 이전 종가 필드가 없으면 최근 종가 배열의 직전값을 사용한다.
    const prevRaw = Number(meta.previousClose ?? meta.regularMarketPreviousClose ?? cleanCloses.at(-2));
    if (!Number.isFinite(raw)) throw new Error('no market price');

    const price = Math.round(raw * item.f * 100) / 100;
    const prev = Number.isFinite(prevRaw) ? Math.round(prevRaw * item.f * 100) / 100 : null;
    const change = prev != null ? Math.round((price - prev) * 100) / 100 : null;
    const changePct = prev ? Math.round((change / prev) * 10000) / 100 : null;
    const history = stamps
      .map((ts, i) => ({
        date:new Date(ts * 1000).toISOString().slice(0, 10),
        value:closes[i] != null ? Math.round(closes[i] * item.f * 100) / 100 : null,
      }))
      .filter(d => d.value != null)
      .slice(-20);

    return {
      ...normalizeItem(item),
      price,
      prev,
      change,
      changePct,
      history,
      ok:true,
      demo:false,
      source:'Yahoo Finance chart (indicative)',
    };
  } catch (e) {
    return fallbackOne(item, e?.message || String(e));
  }
}


async function fetchJsonFirst(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers:H, signal:AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch failed');
}

function parseOilRows(json) {
  const root = json?.RESULT ?? json?.result ?? json;
  const raw = root?.OIL ?? root?.oil ?? root?.OILS ?? root?.LIST ?? root?.list ?? [];
  return Array.isArray(raw) ? raw : [raw].filter(Boolean);
}

function num(v) {
  const n = Number(String(v ?? '').replace(/[,+]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function getOpinetKey() {
  return process.env.OPINET_API_KEY
    || process.env.OPINET_CODE
    || process.env.OPINET_CERTKEY
    || process.env.OPINET_CERT_KEY
    || process.env.OPINET_KEY
    || process.env.VERCEL_OPINET_API_KEY
    || process.env.VITE_OPINET_API_KEY
    || '';
}

async function fetchOpinetFuel(key) {
  if (!key) return [];
  try {
    const paramsA = `out=json&code=${encodeURIComponent(key)}`;
    const paramsB = `out=json&certkey=${encodeURIComponent(key)}`;
    const urls = [
      `https://www.opinet.co.kr/api/avgAllPrice.do?${paramsA}`,
      `https://www.opinet.co.kr/api/avgAllPrice.do?${paramsB}`,
      `https://www.opinet.co.kr/api/avgRecentPrice.do?${paramsA}&prodcd=B027`,
      `https://www.opinet.co.kr/api/avgRecentPrice.do?${paramsB}&prodcd=B027`,
      `https://www.opinet.co.kr/api/avgRecentPrice.do?${paramsA}&prodcd=D047`,
      `https://www.opinet.co.kr/api/avgRecentPrice.do?${paramsB}&prodcd=D047`,
    ];
    const jsons = await Promise.allSettled(urls.map(url => fetchJsonFirst([url])));
    const rows = jsons.flatMap(r => r.status === 'fulfilled' ? parseOilRows(r.value) : []);
    const map = new Map(rows.map(r => [String(r.PRODCD || r.prodcd || r.PROD_CD || '').trim(), r]));
    const make = (code, name, color) => {
      const row = map.get(code)
        || rows.find(r => String(r.PRODCD || r.prodcd || r.PROD_CD || '').trim() === code)
        || rows.find(r => String(r.PRODNM || r.PROD_NM || r.prodNm || '').includes(code === 'B027' ? '휘발유' : '경유'));
      const price = num(row?.PRICE ?? row?.price ?? row?.AVG_PRICE ?? row?.avgPrice);
      const diff = num(row?.DIFF ?? row?.diff ?? row?.CHANGE ?? row?.change);
      return price != null ? {
        symbol:code,
        name,
        category:'oil', cat:'oil',
        unit:'KRW/L', raw:'KRW/L', color,
        price:Math.round(price),
        prev:diff != null ? Math.round(price - diff) : null,
        change:diff != null ? Math.round(diff) : null,
        changePct:null,
        history:[], ok:true, demo:false,
        source:'Opinet avgAllPrice',
      } : null;
    };
    return [make('B027','국내 휘발유 평균','#ef4444'), make('D047','국내 경유 평균','#10b981')].filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function fetchNickel(key) {
  if (!key) return null;
  try {
    const res = await fetch(`https://metals-api.com/api/latest?access_key=${key}&base=USD&symbols=LME-XNI`, {
      signal:AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Metals API HTTP ${res.status}`);
    const j = await res.json();
    if (!j.success) return null;
    const raw = j.rates?.['LME-XNI'];
    const price = raw ? Math.round((1 / raw) * 32150) : null;
    if (!price) return null;
    return {
      symbol:'NI', name:'니켈 (Ni)', category:'metal', cat:'metal', unit:'USD/MT', color:'#22c55e',
      price, prev:null, change:null, changePct:null, history:[], ok:true, demo:false, source:'metals-api.com',
    };
  } catch {
    return null;
  }
}

export const handler = async () => {
  const headers = {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Cache-Control':'s-maxage=120, stale-while-revalidate=600',
  };

  try {
    const [yfResults, nickel, domesticFuel] = await Promise.all([
      Promise.allSettled(SYMBOLS.map(fetchOne)),
      fetchNickel(process.env.METALS_DEV_KEY),
      fetchOpinetFuel(getOpinetKey()),
    ]);

    const metals = yfResults.map((r, i) => r.status === 'fulfilled' ? r.value : fallbackOne(SYMBOLS[i], r.reason?.message));
    if (nickel?.ok) metals.splice(2, 0, nickel);
    if (domesticFuel?.length) metals.push(...domesticFuel);

    const demo = metals.every(m => m.demo);

    return {
      statusCode:200,
      headers,
      body:JSON.stringify({
        ok:true,
        demo,
        updatedAt:new Date().toISOString(),
        notes:[
          !nickel ? '니켈 실시간 표시는 METALS_DEV_KEY 환경변수 설정이 필요합니다.' : null,
          !(domesticFuel?.length) ? '국내 휘발유/경유 평균가격 표시는 Vercel 환경변수 OPINET_API_KEY 또는 OPINET_CODE/OPINET_CERTKEY 설정이 필요합니다.' : null,
          demo ? '외부 시세 API 접속 실패로 샘플 가격은 표시하지 않습니다.' : null,
          '철강 HRC(HRC=F)는 Yahoo Finance 선물 시세 기반 참고값입니다. 응답이 없거나 0이면 표시하지 않습니다.',
          '광물 가격은 Yahoo Finance 선물 시세 기반 참고값입니다.',
          '크롬(Cr)은 무료 실시간 공개 API 정보가 어려워 제외했습니다.',
        ].filter(Boolean),
        metals,
        byCategory:{
          metal:metals.filter(m => m.category === 'metal'),
          steel:metals.filter(m => m.category === 'steel'),
          oil:metals.filter(m => m.category === 'oil'),
        },
      }),
    };
  } catch (e) {
    return {
      statusCode:500,
      headers,
      body:JSON.stringify({ ok:false, error:e?.message || String(e) }),
    };
  }
};
