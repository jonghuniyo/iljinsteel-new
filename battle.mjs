const state = globalThis.__iljinBattleStore || (globalThis.__iljinBattleStore = {
  predictions: [],
  hall: [],
});

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Cache-Control": "no-store",
};

const MARKETS = [
  { id: "nickel", label: "니켈 종가", unit: "$/MT", source: "FRED PNICKUSDM" },
  { id: "copper", label: "구리 종가", unit: "$/MT", source: "FRED PCOPPUSDM" },
  { id: "commodity", label: "원자재 종합지수", unit: "2016=100", source: "FRED PALLFNFINDEXM" },
  { id: "usdkrw", label: "USD/KRW 환율", unit: "원", source: "환율 API" },
  { id: "wti", label: "WTI 원유", unit: "$/bbl", source: "Yahoo Finance" },
];

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function targetFriday(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const offset = (5 - day + 7) % 7;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function cleanPrediction(input) {
  const market = MARKETS.find((m) => m.id === input.marketId) || MARKETS[0];
  const value = Number(String(input.value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) throw new Error("prediction value required");
  return {
    id: String(input.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    name: String(input.name || "익명").trim().slice(0, 12) || "익명",
    marketId: market.id,
    marketLabel: market.label,
    unit: market.unit,
    value,
    week: String(input.week || weekKey()),
    targetDate: String(input.targetDate || targetFriday()),
    createdAt: new Date().toISOString(),
  };
}

function settle(week, marketId, actualValue) {
  const actual = Number(actualValue);
  if (!Number.isFinite(actual) || actual <= 0) throw new Error("actual value required");
  const entries = state.predictions
    .filter((p) => p.week === week && p.marketId === marketId)
    .map((p) => ({ ...p, errorPct: Math.abs(p.value - actual) / actual * 100 }))
    .sort((a, b) => a.errorPct - b.errorPct);
  const points = [100, 70, 50, 30, 20];
  const settled = entries.map((p, idx) => ({
    ...p,
    rank: idx + 1,
    actual,
    points: points[idx] || 5,
    settledAt: new Date().toISOString(),
  }));
  state.hall = [...settled, ...state.hall]
    .sort((a, b) => (b.points || 0) - (a.points || 0) || (a.errorPct || 999) - (b.errorPct || 999))
    .slice(0, 80);
  return settled;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  if (event.httpMethod === "GET") {
    const week = event.queryStringParameters?.week || weekKey();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        markets: MARKETS,
        week,
        targetDate: targetFriday(),
        predictions: state.predictions.filter((p) => p.week === week),
        hall: state.hall.slice(0, 30),
      }),
    };
  }

  if (event.httpMethod === "POST") {
    try {
      const body = parseBody(event);
      if (body.action === "settle") {
        const settled = settle(String(body.week || weekKey()), String(body.marketId || "nickel"), body.actual);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, settled, hall: state.hall.slice(0, 30) }) };
      }

      const prediction = cleanPrediction(body);
      state.predictions = [
        prediction,
        ...state.predictions.filter(
          (p) => !(p.week === prediction.week && p.marketId === prediction.marketId && p.name === prediction.name),
        ),
      ].slice(0, 300);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, prediction, predictions: state.predictions.filter((p) => p.week === prediction.week) }),
      };
    } catch (err) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: err?.message || String(err) }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "method not allowed" }) };
};
