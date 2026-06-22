const SERIES = [
  { id: "PNICKUSDM", label: "니켈 (Ni)", unit: "$/MT", color: "#3b82f6" },
  { id: "PCOPPUSDM", label: "구리 (Cu)", unit: "$/MT", color: "#22c55e" },
  { id: "PALLFNFINDEXM", label: "원자재 종합지수", unit: "2016=100", color: "#a855f7" },
];

const FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations";
const FRED_CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const BUILT_IN_FRED_API_KEY = "1ae818697b92de2d20989aa4b6f71e54";

function toNumber(value) {
  if (value == null || value === "" || value === ".") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseFredCsv(text, seriesId) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
  const dateIdx = header.findIndex((h) => /^observation_date$|^date$/i.test(h));
  const valueIdx = header.findIndex((h) => h === seriesId);
  const dIdx = dateIdx >= 0 ? dateIdx : 0;
  const vIdx = valueIdx >= 0 ? valueIdx : 1;

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const value = toNumber(cols[vIdx]);
      return value == null ? null : { date: cols[dIdx], value };
    })
    .filter(Boolean)
    .filter((o) => o.date >= "2022-01-01")
    .slice(-36);
}

async function fetchSeriesByApi(series, apiKey) {
  const url = `${FRED_API_BASE}?series_id=${encodeURIComponent(series.id)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=48&observation_start=2022-01-01`;
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`FRED API HTTP ${res.status}`);
  const json = await res.json();
  const observations = (json.observations ?? [])
    .map((o) => ({ date: o.date, value: toNumber(o.value) }))
    .filter((o) => o.value != null)
    .reverse()
    .slice(-36);
  if (!observations.length) throw new Error("FRED API empty observations");
  return { ...series, observations, source: "FRED API", demo: false };
}

async function fetchSeriesByCsv(series) {
  const url = `${FRED_CSV_BASE}?id=${encodeURIComponent(series.id)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/csv,text/plain,*/*" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`FRED CSV HTTP ${res.status}`);
  const observations = parseFredCsv(await res.text(), series.id);
  if (!observations.length) throw new Error("FRED CSV empty observations");
  return { ...series, observations, source: "FRED CSV", demo: false };
}

function unavailableSeries(series, error) {
  return {
    ...series,
    observations: [],
    source: "unavailable",
    demo: true,
    error: error?.message || String(error || "FRED fetch failed"),
  };
}

async function fetchSeries(series, apiKey) {
  try {
    if (apiKey) return await fetchSeriesByApi(series, apiKey);
  } catch {
    // Continue with public CSV fallback when the keyed API is temporarily unavailable.
  }

  try {
    return await fetchSeriesByCsv(series);
  } catch (csvError) {
    return unavailableSeries(series, csvError);
  }
}

export const handler = async () => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
  };

  try {
    const apiKey = process.env.FRED_API_KEY || process.env.FRED_KEY || BUILT_IN_FRED_API_KEY;
    const series = await Promise.all(SERIES.map((s) => fetchSeries(s, apiKey)));
    const demo = series.every((s) => s.demo);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        demo,
        updatedAt: new Date().toISOString(),
        message: demo
          ? "FRED 연결 실패로 표시 가능한 관측값이 없습니다."
          : apiKey
            ? "FRED API 데이터입니다."
            : "FRED CSV fallback 데이터입니다.",
        series,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err?.message || String(err) }),
    };
  }
};
