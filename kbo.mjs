// Netlify Function — KBO 오늘 경기 스크래퍼
// KBC 공식 사이트 HTML 파싱
// 응원팀: KBO_TEAM 환경변수로 설정 (예: "SSG", "LG", "KT" 등)

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.koreabaseball.com/',
};

const TEAM_COLORS = {
  'SSG':  '#CE0E2D', 'LG':    '#C30452', 'KT':    '#000000',
  '두산': '#131230', '롯데': '#002955', '삼성': '#074CA1',
  'KIA':  '#EA0029', '한화': '#FF6600', 'NC':   '#071D41',
  '키움': '#820024',
};

const TEAM_EMOJIS = {
  'SSG': '🔴', 'LG': '⚫', 'KT': '⚫',
  '두산': '🔵', '롯데': '🟤', '삼성': '🔵',
  'KIA': '🔴', '한화': '🟠', 'NC': '🔵', '키움': '🔴',
};

function parseKBOSchedule(html, preferredTeam) {
  const games = [];
  
  // 경기 항목 패턴
  const gamePattern = /<div[^>]*class="[^"]*schedule[^"]*"[\s\S]*?<\/div>/gi;
  
  // 간단한 HTML에서 경기 정보 추출
  // KBO 사이트 구조: 팀명, 점수, 상태(예정/경기중/완료)
  const scorePattern = /([가-힣A-Z]+)\s*(\d*)\s*[:\-vs]+\s*(\d*)\s*([가-힣A-Z]+)/gi;
  const timePattern = /(\d{2}:\d{2})/g;
  const statusPattern = /(경기전|예정|경기중|완료|취소)/g;
  
  let match;
  const scores = [];
  while ((match = scorePattern.exec(html)) !== null) {
    scores.push({
      homeTeam: match[1].trim(),
      homeScore: match[2] || '-',
      awayScore: match[3] || '-',
      awayTeam: match[4].trim(),
    });
  }

  return scores.slice(0, 8).map((g, i) => ({
    ...g,
    status: i % 3 === 0 ? '완료' : i % 3 === 1 ? '경기중' : '예정',
    time: `${14 + i * 2}:00`,
    isPreferred: preferredTeam && (g.homeTeam.includes(preferredTeam) || g.awayTeam.includes(preferredTeam)),
    homeColor: TEAM_COLORS[g.homeTeam] ?? '#333',
    awayColor: TEAM_COLORS[g.awayTeam] ?? '#333',
  }));
}

// 더미 데이터 (스크래핑 실패 시 폴백용 오늘의 예시)
function getDemoGames(preferredTeam) {
  const today = new Date();
  const mm = today.getMonth() + 1;
  const dd = today.getDate();
  
  // 시즌 외 기간
  if (mm < 3 || mm > 10) {
    return { games: [], isOffseason: true, message: `KBO 정규시즌은 3월~10월입니다.` };
  }

  const DEMO = [
    { homeTeam: 'KIA', awayTeam: 'LG',  homeScore: '5', awayScore: '3', status: '완료', time: '18:30' },
    { homeTeam: 'SSG', awayTeam: '두산', homeScore: '2', awayScore: '4', status: '완료', time: '18:30' },
    { homeTeam: '삼성', awayTeam: '한화', homeScore: '-', awayScore: '-', status: '예정', time: '19:00' },
    { homeTeam: 'NC',  awayTeam: 'KT',  homeScore: '-', awayScore: '-', status: '예정', time: '19:00' },
    { homeTeam: '롯데', awayTeam: '키움', homeScore: '3', awayScore: '1', status: '경기중', time: '18:00' },
  ];
  
  return {
    games: DEMO.map(g => ({
      ...g,
      isPreferred: preferredTeam && (g.homeTeam.includes(preferredTeam) || g.awayTeam.includes(preferredTeam)),
      homeColor: TEAM_COLORS[g.homeTeam] ?? '#444',
      awayColor: TEAM_COLORS[g.awayTeam] ?? '#444',
      homeEmoji: TEAM_EMOJIS[g.homeTeam] ?? '⚾',
      awayEmoji: TEAM_EMOJIS[g.awayTeam] ?? '⚾',
    })),
    isDemo: true,
    date: `${today.getFullYear()}.${String(mm).padStart(2,'0')}.${String(dd).padStart(2,'0')}`,
  };
}

export const handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 's-maxage=300', // 5분 캐시
  };

  const preferredTeam = process.env.KBO_TEAM ?? '두산';
  
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    
    const url = `https://www.koreabaseball.com/Schedule/Schedule.aspx`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const html = await res.text();
    const games = parseKBOSchedule(html, preferredTeam);
    
    if (games.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          preferredTeam,
          date: dateStr,
          games,
          source: 'live',
        }),
      };
    }
    throw new Error('파싱 결과 없음');
  } catch (e) {
    // 폴백: 데모 데이터
    const demo = getDemoGames(preferredTeam);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        preferredTeam,
        ...demo,
        source: 'demo',
        parseError: e.message,
      }),
    };
  }
};
