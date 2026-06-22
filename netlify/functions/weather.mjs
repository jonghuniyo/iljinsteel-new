// Netlify Function - 생활 날씨/미세먼지 위젯 (Open-Meteo, no API key)
const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 's-maxage=600',
};

const FALLBACK_LOCATIONS = {
  mapo: { name: '마포', lat: 37.5663, lon: 126.9018 },
  imsil: { name: '임실', lat: 35.6178, lon: 127.2891 },
  suwon: { name: '수원', lat: 37.2636, lon: 127.0286 },
};

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const m = 10 ** digits;
  return Math.round(Number(value) * m) / m;
}

function weatherDescription(code) {
  const c = Number(code);
  if ([0].includes(c)) return '맑음';
  if ([1, 2].includes(c)) return '대체로 맑음';
  if ([3].includes(c)) return '흐림';
  if ([45, 48].includes(c)) return '안개';
  if ([51, 53, 55, 56, 57].includes(c)) return '이슬비';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return '비';
  if ([71, 73, 75, 77, 85, 86].includes(c)) return '눈';
  if ([95, 96, 99].includes(c)) return '뇌우';
  return '날씨 확인';
}

function weatherIcon(code) {
  const c = Number(code);
  if ([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(c)) return 'snow';
  if ([3, 45, 48].includes(c)) return 'cloud';
  return 'sun';
}

function airGrade(pm10, pm25) {
  const pm10n = toNumber(pm10);
  const pm25n = toNumber(pm25);
  let score = 0;
  if (pm10n != null) score = Math.max(score, pm10n <= 30 ? 0 : pm10n <= 80 ? 1 : pm10n <= 150 ? 2 : 3);
  if (pm25n != null) score = Math.max(score, pm25n <= 15 ? 0 : pm25n <= 35 ? 1 : pm25n <= 75 ? 2 : 3);
  return [
    { label: '좋음', color: 'var(--green)', tip: '환기하기 좋은 편' },
    { label: '보통', color: 'var(--blue)', tip: '무난한 대기 상태' },
    { label: '나쁨', color: 'var(--orange)', tip: '장시간 야외활동 주의' },
    { label: '매우 나쁨', color: 'var(--red)', tip: '마스크 권장' },
  ][score];
}

function nearestHourlyIndex(times) {
  if (!Array.isArray(times) || times.length === 0) return 0;
  const now = Date.now();
  let best = 0;
  let bestDiff = Infinity;
  times.forEach((t, i) => {
    const diff = Math.abs(new Date(t).getTime() - now);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  });
  return best;
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  try {
    const qs = event.queryStringParameters || {};
    const fallback = FALLBACK_LOCATIONS[qs.loc || 'mapo'] || FALLBACK_LOCATIONS.mapo;
    const lat = toNumber(qs.lat, fallback.lat);
    const lon = toNumber(qs.lon, fallback.lon);
    const name = (qs.name || fallback.name || '선택 지역').slice(0, 30);

    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', lat);
    forecastUrl.searchParams.set('longitude', lon);
    forecastUrl.searchParams.set('timezone', 'Asia/Seoul');
    forecastUrl.searchParams.set('forecast_days', '1');
    forecastUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m');
    forecastUrl.searchParams.set('hourly', 'precipitation_probability,precipitation,weather_code');

    const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    airUrl.searchParams.set('latitude', lat);
    airUrl.searchParams.set('longitude', lon);
    airUrl.searchParams.set('timezone', 'Asia/Seoul');
    airUrl.searchParams.set('forecast_days', '1');
    airUrl.searchParams.set('hourly', 'pm10,pm2_5,us_aqi');

    const [forecast, air] = await Promise.all([fetchJson(forecastUrl), fetchJson(airUrl)]);
    const current = forecast.current || {};
    const hourly = forecast.hourly || {};
    const airHourly = air.hourly || {};
    const wxIdx = nearestHourlyIndex(hourly.time);
    const airIdx = nearestHourlyIndex(airHourly.time);

    const nextProb = (hourly.precipitation_probability || []).slice(wxIdx, wxIdx + 12).filter(v => v != null);
    const nextRain = (hourly.precipitation || []).slice(wxIdx, wxIdx + 12).filter(v => v != null);
    const maxRainProb = nextProb.length ? Math.max(...nextProb.map(Number)) : null;
    const maxRain = nextRain.length ? Math.max(...nextRain.map(Number)) : null;
    const currentCode = current.weather_code ?? hourly.weather_code?.[wxIdx];
    const pm10 = round(airHourly.pm10?.[airIdx], 0);
    const pm25 = round(airHourly.pm2_5?.[airIdx], 0);
    const grade = airGrade(pm10, pm25);
    const rainAlert = (maxRainProb != null && maxRainProb >= 50) || (maxRain != null && maxRain >= 0.5) || ['비', '이슬비', '뇌우'].includes(weatherDescription(currentCode));

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        ok: true,
        name,
        lat,
        lon,
        updatedAt: new Date().toISOString(),
        weather: {
          temperature: round(current.temperature_2m, 1),
          apparent: round(current.apparent_temperature, 1),
          humidity: round(current.relative_humidity_2m, 0),
          wind: round(current.wind_speed_10m, 1),
          precipitation: round(current.precipitation, 1),
          precipitationProbability: maxRainProb,
          code: currentCode,
          description: weatherDescription(currentCode),
          icon: weatherIcon(currentCode),
        },
        air: {
          pm10,
          pm25,
          usAqi: round(airHourly.us_aqi?.[airIdx], 0),
          grade: grade.label,
          color: grade.color,
          tip: grade.tip,
        },
        alert: {
          umbrella: rainAlert,
          text: rainAlert ? '우산 챙기세요' : '우산 없이도 괜찮을 듯',
        },
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: err.message, updatedAt: new Date().toISOString() }),
    };
  }
};
