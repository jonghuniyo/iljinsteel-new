(function () {
  // 모바일(<=900px)에서는 사이드바를 기본 접힘으로 시작한다.
  // 번들(React 스토어)이 rehydrate 하기 전에(이 스크립트는 head에서 모듈보다 먼저 실행됨)
  // 저장된 sidebarOpen 값을 false 로 보정해, 데스크톱에서 열어둔 상태가 모바일까지 따라오지 않게 한다.
  try {
    if (window.innerWidth <= 900) {
      const k = "iljin-dashboard-store";
      let o = null;
      try { o = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { o = null; }
      if (!o || typeof o !== "object") o = { state: {}, version: 0 };
      if (!o.state || typeof o.state !== "object") o.state = {};
      o.state.sidebarOpen = false;
      localStorage.setItem(k, JSON.stringify(o));
    }
  } catch (e) {}

  const DESKTOP_QUERY = "(min-width: 901px)";
  const mq = window.matchMedia(DESKTOP_QUERY);
  const FOCUS_KEY = "iljin-focus-me-v1";
  const FOCUS_POS_KEY = "iljin-focus-pos-v1";
  const BATTLE_LOCAL_KEY = "iljin-battle-local-v1";
  const FOCUS_VISIBLE_KEY = "iljin-focus-visible-v1";
  const COOKIE_PREFIX = "iljin_ck_";
  const COOKIE_CHUNK_SIZE = 3000;
  const COOKIE_MAX_CHUNKS = 12;
  const PERSIST_KEYS = [
    "iljin-dashboard-store",
    "iljin-pet-store",
    "iljin-kanban-store",
    "iljin-kanban",
    "iljin-portal-users",
    "iljin-portal-session",
    "iljin-daily-memo",
    "iljin-memo-postits",
    "iljin-header-settings",
    "iljin-home-widget-visibility",
    "iljin-life-dday-settings",
    "iljin-logo",
    "iljin-meal-data",
    "iljin-mineral-manual",
    "iljin-notice-pins",
    "iljin-sidebar-weather-location",
    "iljin-weather-location",
    "iljin-snake-best",
    "iljin-steelmax-saved-v2",
    "iljin-focus-client-id",
    FOCUS_KEY,
    FOCUS_POS_KEY,
    FOCUS_VISIBLE_KEY,
    BATTLE_LOCAL_KEY,
  ];
  const API = {
    focus: "/api/focus",
    battle: "/api/battle",
    mineral: "/api/mineral",
    metals: "/api/metals",
    fx: "/api/fx",
  };

  let focusTimer = null;
  let syncTimer = null;
  let mounted = false;
  let sessions = [];
  let battleState = null;
  let marketRefs = {};
  let marketCopyObserver = null;
  let marketCopyHandle = null;

  const byId = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;",
  })[ch]);
  const fmtTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  };
  const won = (v) => Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 2 });

  function persistKeySet() {
    return new Set(PERSIST_KEYS);
  }

  function cookieBase(key) {
    return `${COOKIE_PREFIX}${String(key).replace(/[^a-z0-9_-]/gi, "_")}`;
  }

  function setCookieRaw(name, value) {
    document.cookie = `${name}=${value}; max-age=31536000; path=/; SameSite=Lax`;
  }

  function deleteCookieRaw(name) {
    document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`;
  }

  function getCookieRaw(name) {
    const found = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
    return found ? found.slice(name.length + 1) : "";
  }

  function deleteCookieChunks(key) {
    const base = cookieBase(key);
    deleteCookieRaw(`${base}_count`);
    for (let i = 0; i < COOKIE_MAX_CHUNKS; i += 1) deleteCookieRaw(`${base}_${i}`);
  }

  function saveCookieChunks(key, value) {
    try {
      if (value == null) {
        deleteCookieChunks(key);
        return;
      }
      const encoded = encodeURIComponent(String(value));
      const chunks = [];
      for (let i = 0; i < encoded.length; i += COOKIE_CHUNK_SIZE) {
        chunks.push(encoded.slice(i, i + COOKIE_CHUNK_SIZE));
      }
      if (!chunks.length || chunks.length > COOKIE_MAX_CHUNKS) {
        deleteCookieChunks(key);
        return;
      }
      deleteCookieChunks(key);
      const base = cookieBase(key);
      setCookieRaw(`${base}_count`, String(chunks.length));
      chunks.forEach((chunk, index) => setCookieRaw(`${base}_${index}`, chunk));
    } catch {}
  }

  function loadCookieChunks(key) {
    try {
      const base = cookieBase(key);
      const count = Math.min(COOKIE_MAX_CHUNKS, Math.max(0, Number(getCookieRaw(`${base}_count`)) || 0));
      if (!count) return null;
      let encoded = "";
      for (let i = 0; i < count; i += 1) {
        const chunk = getCookieRaw(`${base}_${i}`);
        if (!chunk) return null;
        encoded += chunk;
      }
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }

  function restorePersistedKeys() {
    try {
      PERSIST_KEYS.forEach((key) => {
        if (localStorage.getItem(key) != null) return;
        const restored = loadCookieChunks(key);
        if (restored != null) localStorage.setItem(key, restored);
      });
    } catch {}
  }

  function backupPersistedKey(key, value) {
    if (!persistKeySet().has(String(key))) return;
    saveCookieChunks(String(key), value);
  }

  function backupPersistedKeys() {
    try {
      PERSIST_KEYS.forEach((key) => {
        const value = localStorage.getItem(key);
        if (value != null) backupPersistedKey(key, value);
      });
    } catch {}
  }

  function patchStoragePersistence() {
    try {
      if (window.__ILJIN_COOKIE_PERSIST_READY__) return;
      window.__ILJIN_COOKIE_PERSIST_READY__ = true;
      const proto = Object.getPrototypeOf(localStorage);
      const originalSetItem = proto.setItem;
      const originalRemoveItem = proto.removeItem;
      proto.setItem = function patchedSetItem(key, value) {
        const result = originalSetItem.apply(this, arguments);
        if (this === localStorage) backupPersistedKey(key, value);
        return result;
      };
      proto.removeItem = function patchedRemoveItem(key) {
        const result = originalRemoveItem.apply(this, arguments);
        if (this === localStorage && persistKeySet().has(String(key))) deleteCookieChunks(String(key));
        return result;
      };
    } catch {}
  }

  const uid = () => {
    try {
      const key = "iljin-focus-client-id";
      let id = localStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(key, id);
      }
      return id;
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  };

  function getMe() {
    try {
      const saved = JSON.parse(localStorage.getItem(FOCUS_KEY) || "{}");
      return {
        id: saved.id || uid(),
        name: saved.name || "",
        animal: ["cat", "hamster", "dog"].includes(saved.animal) ? saved.animal : "hamster",
        status: saved.status || "idle",
        elapsed: Math.max(0, Number(saved.elapsed) || 0),
        startedAt: saved.startedAt || null,
        order: Math.max(0, Number(saved.order) || 0),
      };
    } catch {
      return { id: uid(), name: "", animal: "hamster", status: "idle", elapsed: 0, startedAt: null, order: 0 };
    }
  }

  restorePersistedKeys();
  patchStoragePersistence();

  let me = getMe();

  function saveMe() {
    try {
      localStorage.setItem(FOCUS_KEY, JSON.stringify(me));
    } catch {}
  }

  function currentElapsed(item = me) {
    if (item.status !== "running" || !item.startedAt) return Math.max(0, Math.floor(Number(item.elapsed) || 0));
    return Math.max(0, Math.floor(Number(item.elapsed) || 0) + Math.floor((Date.now() - Number(item.startedAt)) / 1000));
  }

  function animalSvg(type, status) {
    const blink = status === "running" ? "ilfw-typing" : "";
    const sleep = status === "paused";
    const commonLaptop = `
      <g class="${blink}" transform="translate(45 30)">
        <rect x="0" y="0" width="38" height="24" rx="3" fill="#23324a"/>
        <rect x="4" y="4" width="30" height="14" rx="2" fill="#b8dcff"/>
        <rect x="3" y="25" width="42" height="6" rx="2" fill="#172033"/>
        <rect x="19" y="27" width="8" height="2" rx="1" fill="#607089"/>
      </g>`;
    const z = sleep ? `<text x="70" y="16" font-size="14" fill="#7b8da8" font-weight="900">Z</text><text x="82" y="8" font-size="11" fill="#9aa9bd" font-weight="900">z</text>` : "";

    if (type === "cat") return `
      <svg viewBox="0 0 96 72" class="ilfw-animal" aria-hidden="true">
        ${z}
        <path d="M20 36 C20 25 28 18 39 18 L35 8 L45 16 L55 8 L51 18 C62 19 70 27 70 38 C70 52 58 60 42 60 C27 60 20 49 20 36Z" fill="#f3a15b" stroke="#3c2a22" stroke-width="2.3"/>
        <circle cx="36" cy="34" r="2.5" fill="#191919"/><circle cx="53" cy="34" r="2.5" fill="#191919"/>
        <path d="M44 39 l-3 3 h6z" fill="#e86f8c"/><path d="M28 45 c-10 4-14-2-12-9" fill="none" stroke="#3c2a22" stroke-width="4" stroke-linecap="round"/>
        <path d="M35 51 c5 4 13 4 18 0" fill="none" stroke="#3c2a22" stroke-width="2" stroke-linecap="round"/>
        <path d="M58 44 c8-2 12 1 14 6" fill="none" stroke="#f3a15b" stroke-width="8" stroke-linecap="round"/>
        ${commonLaptop}
      </svg>`;

    if (type === "dog") return `
      <svg viewBox="0 0 96 72" class="ilfw-animal" aria-hidden="true">
        ${z}
        <path d="M23 35 C23 23 32 17 45 17 C58 17 68 25 68 38 C68 53 56 60 42 60 C29 60 23 49 23 35Z" fill="#d8a760" stroke="#3b2b1f" stroke-width="2.3"/>
        <path d="M26 22 C14 23 14 38 25 42" fill="#8b5f37" stroke="#3b2b1f" stroke-width="2"/>
        <path d="M63 22 C76 24 75 39 65 43" fill="#8b5f37" stroke="#3b2b1f" stroke-width="2"/>
        <circle cx="39" cy="34" r="2.4" fill="#161616"/><circle cx="54" cy="34" r="2.4" fill="#161616"/>
        <ellipse cx="47" cy="41" rx="5" ry="4" fill="#5a371f"/><path d="M43 47 c5 4 10 2 13-1" fill="none" stroke="#3b2b1f" stroke-width="2" stroke-linecap="round"/>
        <path d="M22 47 c-8 2-12-2-13-7" fill="none" stroke="#d8a760" stroke-width="7" stroke-linecap="round"/>
        <path d="M58 44 c8-2 12 1 14 6" fill="none" stroke="#d8a760" stroke-width="8" stroke-linecap="round"/>
        ${commonLaptop}
      </svg>`;

    return `
      <svg viewBox="0 0 96 72" class="ilfw-animal" aria-hidden="true">
        ${z}
        <ellipse cx="42" cy="39" rx="25" ry="24" fill="#e5a451" stroke="#3c2a22" stroke-width="2.3"/>
        <circle cx="27" cy="24" r="8" fill="#efc07a" stroke="#3c2a22" stroke-width="2"/>
        <circle cx="56" cy="24" r="8" fill="#efc07a" stroke="#3c2a22" stroke-width="2"/>
        <circle cx="35" cy="35" r="2.5" fill="#151515"/><circle cx="51" cy="35" r="2.5" fill="#151515"/>
        <circle cx="28" cy="42" r="4" fill="#f5b6a5" opacity=".9"/><circle cx="58" cy="42" r="4" fill="#f5b6a5" opacity=".9"/>
        <path d="M44 40 l-3 4 h6z" fill="#7b4228"/><path d="M36 50 c5 4 13 4 18 0" fill="none" stroke="#3c2a22" stroke-width="2" stroke-linecap="round"/>
        <path d="M20 47 c-8 1-12-3-12-9" fill="none" stroke="#e5a451" stroke-width="7" stroke-linecap="round"/>
        <path d="M58 44 c8-2 12 1 14 6" fill="none" stroke="#e5a451" stroke-width="8" stroke-linecap="round"/>
        ${commonLaptop}
      </svg>`;
  }

  function injectStyle() {
    if (byId("iljinCollabStyle")) return;
    const style = document.createElement("style");
    style.id = "iljinCollabStyle";
    style.textContent = `
      .ilfw-root{position:fixed;right:92px;top:112px;z-index:150;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:min(520px,calc(100vw - 330px));pointer-events:none}
      .ilfw-close{position:absolute;right:-8px;top:-8px;width:24px;height:24px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.94);color:#64748b;border-radius:50%;box-shadow:0 8px 18px rgba(15,23,42,.12);font-size:16px;font-weight:950;line-height:20px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .14s ease,transform .14s ease}
      .ilfw-root:hover .ilfw-close{opacity:1;pointer-events:auto}
      .ilfw-close:hover{transform:scale(1.06);color:#ef4444}
      .ilfw-control{pointer-events:auto;display:flex;align-items:center;gap:6px;padding:7px 8px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.74);backdrop-filter:blur(10px);border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.10)}
      .ilfw-grip{cursor:grab;color:#64748b;font-weight:900;font-size:13px;padding:0 2px}
      .ilfw-control input,.ilfw-control select{height:28px;border:1px solid #d6deea;background:#fff;border-radius:8px;padding:0 8px;font-size:11px;font-weight:800;color:#1e293b;outline:none}
      .ilfw-control input{width:74px}.ilfw-control select{width:74px}
      .ilfw-control button{height:28px;border:0;border-radius:8px;padding:0 9px;font-size:11px;font-weight:900;cursor:pointer;background:#0c4199;color:white}
      .ilfw-control button.sub{background:#eaf2ff;color:#0c4199}
      .ilfw-row{pointer-events:auto;display:flex;align-items:flex-end;gap:7px;min-height:86px;max-width:100%;overflow:visible}
      .ilfw-card{width:88px;position:relative;cursor:grab;text-align:center;filter:drop-shadow(0 10px 18px rgba(15,23,42,.18));user-select:none}
      .ilfw-card.dragging{opacity:.45}
      .ilfw-animal{width:84px;height:63px;display:block;overflow:visible;background:transparent}
      .ilfw-typing{animation:ilfwTap .58s ease-in-out infinite}
      .ilfw-name{display:inline-flex;align-items:center;gap:4px;max-width:88px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.82);border:1px solid rgba(148,163,184,.28);font-size:10px;font-weight:900;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ilfw-time{display:block;margin-top:2px;font:900 10px/1.1 'JetBrains Mono',monospace;color:#0c4199;text-shadow:0 1px 0 rgba(255,255,255,.9)}
      .ilfw-state{width:7px;height:7px;border-radius:50%;display:inline-block;background:#94a3b8}.ilfw-state.running{background:#22c55e}.ilfw-state.paused{background:#f59e0b}
      @keyframes ilfwTap{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}
      .ilbattle-trigger{width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;border:none;border-bottom:1px solid var(--border,#e5e7eb);cursor:pointer;background:transparent;text-align:left}
      .ilbattle-trigger:hover{background:var(--surface-alt,#f8fafc)}
      .ilbattle-icon{width:32px;height:32px;border-radius:8px;background:#fff7ed;color:#f97316;display:flex;align-items:center;justify-content:center;font-weight:900}
      .ilfocus-trigger .ilbattle-icon{background:#ecfdf5;color:#16a34a}
      .ilbattle-overlay{position:fixed;inset:0;z-index:9997;background:rgba(15,23,42,.42);display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)}
      .ilbattle-overlay.on{display:flex}
      .ilbattle-panel{width:min(760px,96vw);max-height:88vh;overflow:auto;border-radius:16px;background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);box-shadow:0 24px 80px rgba(15,23,42,.28);color:var(--text-primary,#0f172a);font-family:'Noto Sans KR',system-ui,sans-serif}
      .ilbattle-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--border,#e2e8f0)}
      .ilbattle-head h2{font-size:18px;margin:0;font-weight:950;letter-spacing:-.5px}.ilbattle-head p{font-size:12px;color:var(--text-muted,#64748b);margin:5px 0 0;line-height:1.55}
      .ilbattle-close{width:34px;height:34px;border:1px solid var(--border,#e2e8f0);background:transparent;border-radius:10px;cursor:pointer;font-size:20px;color:var(--text-muted,#64748b)}
      .ilbattle-body{padding:18px 20px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.ilbattle-section{border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:14px;background:var(--surface,#fff)}
      .ilbattle-section.full{grid-column:1/-1}.ilbattle-title{font-size:12px;font-weight:950;color:var(--text-secondary,#334155);margin-bottom:10px}
      .ilbattle-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ilbattle-form label{font-size:10.5px;font-weight:900;color:var(--text-muted,#64748b);display:block;margin-bottom:4px}
      .ilbattle-form input,.ilbattle-form select{width:100%;height:34px;border:1px solid var(--border,#dbe3ef);border-radius:9px;background:var(--surface,#fff);color:var(--text-primary,#0f172a);font-weight:800;padding:0 9px;box-sizing:border-box;outline:none}
      .ilbattle-form button{grid-column:1/-1;height:36px;border:0;border-radius:9px;background:#0c4199;color:white;font-weight:950;cursor:pointer}
      .ilbattle-table{width:100%;border-collapse:collapse;font-size:11.5px}.ilbattle-table th,.ilbattle-table td{padding:7px 6px;border-bottom:1px solid var(--border,#e2e8f0);text-align:left}.ilbattle-table th{color:var(--text-muted,#64748b);font-size:10.5px}.ilbattle-table td.num{text-align:right;font-family:'JetBrains Mono',monospace}
      .ilbattle-help{font-size:11px;line-height:1.65;color:var(--text-muted,#64748b)}
      .ilbattle-score{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}.ilbattle-score span{padding:6px 4px;border-radius:8px;background:var(--surface-alt,#f1f5f9);font-size:10px;text-align:center;font-weight:900;color:var(--text-secondary,#334155)}
      body header{height:64px!important;min-height:64px!important}
      body header>button:first-child{height:64px!important;width:58px!important}
      body header>div{min-height:40px!important}
      body header>div>div{height:40px!important;min-height:40px!important;align-items:center!important}
      aside a[href="/"]{height:64px!important;min-height:64px!important}
      aside a[href="/"] img[src*="logo"]{height:38px!important;width:auto!important;max-width:176px!important;object-fit:contain!important;transform:none!important;transform-origin:center}
      @media(max-width:760px){
        html,body{overscroll-behavior-y:none;-webkit-text-size-adjust:100%}
        body{touch-action:manipulation}
        body header{height:56px!important;min-height:56px!important;overflow-x:auto!important;overflow-y:hidden!important;gap:8px!important;padding-right:8px!important;scrollbar-width:none;-webkit-overflow-scrolling:touch}
        body header::-webkit-scrollbar{display:none}
        body header>button:first-child{height:56px!important;width:50px!important;min-width:50px!important}
        body header>div{flex-shrink:0!important}
        body header>div>div{height:36px!important;min-height:36px!important}
        aside a[href="/"]{height:58px!important;min-height:58px!important}
        aside a[href="/"] img[src*="logo"]{height:34px!important;max-width:166px!important}
        main{scroll-padding-bottom:92px}
        button,a,input,select,textarea{touch-action:manipulation}
        input,select,textarea{font-size:16px!important}
        .ilbattle-overlay{align-items:stretch!important;padding:0!important}
        .ilbattle-panel{width:100vw!important;max-height:100dvh!important;height:100dvh!important;border-radius:0!important;border:0!important}
        .ilbattle-head{padding:calc(14px + env(safe-area-inset-top)) 14px 12px!important}
        .ilbattle-body{grid-template-columns:1fr!important;padding:14px!important;gap:10px!important}
        .ilbattle-form{grid-template-columns:1fr!important}
      }
      @media(max-width:900px){.ilfw-root{display:none!important}}
      @media(max-width:1100px){.ilfw-root{right:76px;max-width:380px}.ilfw-card{width:76px}.ilfw-animal{width:74px;height:56px}.ilbattle-body{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function renderFocus() {
    const root = byId("ilfwRoot");
    if (!root) return;
    const pos = (() => {
      try { return JSON.parse(localStorage.getItem(FOCUS_POS_KEY) || "null"); } catch { return null; }
    })();
    if (pos) {
      root.style.right = "auto";
      root.style.left = `${Math.max(60, Math.min(window.innerWidth - 160, pos.x))}px`;
      root.style.top = `${Math.max(70, Math.min(window.innerHeight - 120, pos.y))}px`;
    }

    const list = mergeSessions().sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)));
    root.innerHTML = `
      <button class="ilfw-close" id="ilfwClose" type="button" title="집중 타이머 숨기기" aria-label="집중 타이머 숨기기">&times;</button>
      <div class="ilfw-control" id="ilfwDragHandle" title="드래그해서 위치 이동">
        <span class="ilfw-grip">⋮⋮</span>
        <input id="ilfwName" placeholder="이름" maxlength="12" value="${esc(me.name)}" />
        <select id="ilfwAnimal">
          <option value="hamster" ${me.animal === "hamster" ? "selected" : ""}>햄스터</option>
          <option value="cat" ${me.animal === "cat" ? "selected" : ""}>고양이</option>
          <option value="dog" ${me.animal === "dog" ? "selected" : ""}>강아지</option>
        </select>
        ${me.status === "running"
          ? `<button class="sub" id="ilfwPause">정지</button>`
          : `<button id="ilfwStart">시작</button>`}
        <button class="sub" id="ilfwReset">초기화</button>
      </div>
      <div class="ilfw-row">
        ${list.map((item) => `
          <div class="ilfw-card" draggable="true" data-focus-id="${esc(item.id)}" title="${esc(item.name || "익명")}">
            ${animalSvg(item.animal, item.status)}
            <span class="ilfw-name"><i class="ilfw-state ${esc(item.status)}"></i>${esc(item.name || "익명")}</span>
            <span class="ilfw-time">${fmtTime(item.id === me.id ? currentElapsed(me) : item.elapsed || 0)}</span>
          </div>
        `).join("")}
      </div>`;

    byId("ilfwClose")?.addEventListener("click", closeFocus);
    byId("ilfwName")?.addEventListener("input", (e) => {
      me.name = e.target.value.trim();
      saveMe();
      pushFocusSoon();
    });
    byId("ilfwAnimal")?.addEventListener("change", (e) => {
      me.animal = e.target.value;
      saveMe();
      renderFocus();
      pushFocusSoon();
    });
    byId("ilfwStart")?.addEventListener("click", () => {
      me.name = me.name || "익명";
      me.status = "running";
      me.startedAt = Date.now();
      saveMe();
      renderFocus();
      pushFocusSoon();
    });
    byId("ilfwPause")?.addEventListener("click", () => {
      me.elapsed = currentElapsed(me);
      me.status = "paused";
      me.startedAt = null;
      saveMe();
      renderFocus();
      pushFocusSoon();
    });
    byId("ilfwReset")?.addEventListener("click", () => {
      me.status = "idle";
      me.elapsed = 0;
      me.startedAt = null;
      saveMe();
      renderFocus();
      pushFocusSoon();
    });
    installFocusDrag(root);
    installCharacterDrag();
  }

  function mergeSessions() {
    const map = new Map();
    const current = { ...me, elapsed: currentElapsed(me), updatedAt: new Date().toISOString() };
    map.set(me.id, current);
    for (const item of sessions) {
      if (!item || !item.id) continue;
      map.set(item.id, item.id === me.id ? current : item);
    }
    return [...map.values()].filter((item) => item.name || item.id === me.id).slice(0, 8);
  }

  function installFocusDrag(root) {
    const handle = byId("ilfwDragHandle");
    if (!handle || handle.dataset.ready) return;
    handle.dataset.ready = "1";
    let start = null;
    handle.addEventListener("mousedown", (e) => {
      if (["INPUT", "SELECT", "BUTTON"].includes(e.target.tagName)) return;
      start = {
        x: e.clientX,
        y: e.clientY,
        left: root.getBoundingClientRect().left,
        top: root.getBoundingClientRect().top,
      };
      document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", (e) => {
      if (!start) return;
      const x = Math.max(60, Math.min(window.innerWidth - 160, start.left + e.clientX - start.x));
      const y = Math.max(70, Math.min(window.innerHeight - 120, start.top + e.clientY - start.y));
      root.style.left = `${x}px`;
      root.style.top = `${y}px`;
      root.style.right = "auto";
      try { localStorage.setItem(FOCUS_POS_KEY, JSON.stringify({ x, y })); } catch {}
    });
    window.addEventListener("mouseup", () => {
      start = null;
      document.body.style.userSelect = "";
    });
  }

  function installCharacterDrag() {
    let draggingId = null;
    document.querySelectorAll("[data-focus-id]").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        draggingId = card.dataset.focusId;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("dragover", (e) => e.preventDefault());
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const targetId = card.dataset.focusId;
        if (!draggingId || draggingId !== me.id || targetId === draggingId) return;
        const target = mergeSessions().find((s) => s.id === targetId);
        me.order = Math.max(0, Number(target?.order || 0) + 0.1);
        saveMe();
        renderFocus();
        pushFocusSoon();
      });
    });
  }

  let focusPushHandle = null;
  function pushFocusSoon() {
    clearTimeout(focusPushHandle);
    focusPushHandle = setTimeout(pushFocus, 250);
  }

  async function pushFocus() {
    if (!mq.matches) return;
    const payload = { ...me, elapsed: currentElapsed(me) };
    try {
      const res = await fetch(API.focus, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok && Array.isArray(json.sessions)) sessions = json.sessions;
    } catch {
      sessions = [payload];
    }
  }

  async function pullFocus() {
    if (!mq.matches) return;
    try {
      const res = await fetch(API.focus);
      const json = await res.json();
      if (json.ok && Array.isArray(json.sessions)) {
        sessions = json.sessions;
        renderFocus();
      }
    } catch {
      sessions = [{ ...me, elapsed: currentElapsed(me) }];
    }
  }

  function mountFocus() {
    if (byId("ilfwRoot")) return;
    const root = document.createElement("div");
    root.id = "ilfwRoot";
    root.className = "ilfw-root";
    document.body.appendChild(root);
    renderFocus();
    pushFocusSoon();
    pullFocus();
    focusTimer = setInterval(() => {
      if (me.status === "running") renderFocus();
    }, 1000);
    syncTimer = setInterval(() => {
      pushFocus();
      pullFocus();
    }, 6000);
  }

  function setFocusVisible(visible) {
    try {
      localStorage.setItem(FOCUS_VISIBLE_KEY, visible ? "1" : "0");
    } catch {}
  }

  function isFocusVisible() {
    try {
      return localStorage.getItem(FOCUS_VISIBLE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function unmountFocusOnly() {
    clearInterval(focusTimer);
    clearInterval(syncTimer);
    focusTimer = null;
    syncTimer = null;
    byId("ilfwRoot")?.remove();
  }

  function openFocus() {
    if (!mq.matches) return;
    setFocusVisible(true);
    mountFocus();
    renderFocus();
  }

  function closeFocus() {
    setFocusVisible(false);
    unmountFocusOnly();
  }

  function localBattle() {
    try {
      return JSON.parse(localStorage.getItem(BATTLE_LOCAL_KEY) || '{"predictions":[],"hall":[]}');
    } catch {
      return { predictions: [], hall: [] };
    }
  }

  function saveLocalBattle(next) {
    try {
      localStorage.setItem(BATTLE_LOCAL_KEY, JSON.stringify(next));
    } catch {}
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.error || res.status);
    return json;
  }

  async function loadBattle() {
    try {
      battleState = await fetchJson(API.battle);
    } catch {
      const local = localBattle();
      battleState = {
        ok: true,
        week: weekKey(),
        targetDate: targetFriday(),
        markets: [
          { id: "nickel", label: "니켈 종가", unit: "$/MT" },
          { id: "copper", label: "구리 종가", unit: "$/MT" },
          { id: "commodity", label: "원자재 종합지수", unit: "2016=100" },
          { id: "usdkrw", label: "USD/KRW 환율", unit: "원" },
          { id: "wti", label: "WTI 원유", unit: "$/bbl" },
        ],
        predictions: local.predictions || [],
        hall: local.hall || [],
      };
    }
    await loadMarketRefs();
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
    const offset = (5 - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  async function loadMarketRefs() {
    const refs = {};
    try {
      const mineral = await fetchJson(API.mineral);
      const last = (id) => {
        const series = (mineral.series || []).find((s) => s.id === id);
        return series?.observations?.at(-1)?.value ?? null;
      };
      refs.nickel = last("PNICKUSDM");
      refs.copper = last("PCOPPUSDM");
      refs.commodity = last("PALLFNFINDEXM");
    } catch {}
    try {
      const metals = await fetchJson(API.metals);
      const oil = (metals.metals || []).find((m) => /WTI|CL=F/i.test(`${m.name || ""} ${m.symbol || ""}`));
      refs.wti = oil?.price ?? null;
    } catch {}
    try {
      const fx = await fetchJson(API.fx);
      refs.usdkrw = fx?.rates?.USDKRW ?? fx?.rates?.USD_KRW ?? fx?.rates?.USD ?? null;
    } catch {}
    marketRefs = refs;
  }

  function renderBattle() {
    const overlay = byId("ilbattleOverlay");
    if (!overlay || !battleState) return;
    const markets = battleState.markets || [];
    const activeMarket = byId("ilbattleMarket")?.value || markets[0]?.id || "nickel";
    const rows = (battleState.predictions || []).filter((p) => p.marketId === activeMarket);
    const actual = marketRefs[activeMarket];
    const ranked = actual
      ? rows.map((p) => ({ ...p, errorPct: Math.abs(Number(p.value) - actual) / actual * 100 })).sort((a, b) => a.errorPct - b.errorPct)
      : rows;
    const selected = markets.find((m) => m.id === activeMarket) || markets[0] || {};
    const points = ["1위 100p", "2위 70p", "3위 50p", "4위 30p", "5위 20p"];

    overlay.innerHTML = `
      <section class="ilbattle-panel" role="dialog" aria-modal="true" aria-label="가격 예측 배틀">
        <div class="ilbattle-head">
          <div>
            <h2>가격 예측 배틀</h2>
            <p>이번 주 금요일 종가를 예측하고, 실제가와 가장 가까운 순서로 포인트를 받습니다. 모바일에서는 비활성화됩니다.</p>
          </div>
          <button class="ilbattle-close" id="ilbattleClose" aria-label="닫기">×</button>
        </div>
        <div class="ilbattle-body">
          <div class="ilbattle-section">
            <div class="ilbattle-title">예측 등록</div>
            <div class="ilbattle-form">
              <div><label>이름</label><input id="ilbattleName" maxlength="12" value="${esc(me.name || "")}" placeholder="이름" /></div>
              <div><label>종목</label><select id="ilbattleMarket">${markets.map((m) => `<option value="${esc(m.id)}" ${m.id === activeMarket ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></div>
              <div><label>예측값</label><input id="ilbattleValue" inputmode="decimal" placeholder="${esc(selected.unit || "")}" /></div>
              <div><label>목표일</label><input id="ilbattleTarget" value="${esc(battleState.targetDate || targetFriday())}" readonly /></div>
              <button id="ilbattleSubmit">예측 등록하기</button>
            </div>
            <div class="ilbattle-help" style="margin-top:10px">
              현재 참고가: <b>${actual ? `${won(actual)} ${esc(selected.unit || "")}` : "불러오는 중 또는 API 없음"}</b><br/>
              주차: ${esc(battleState.week || weekKey())}
            </div>
            <div class="ilbattle-score">${points.map((p) => `<span>${p}</span>`).join("")}</div>
          </div>
          <div class="ilbattle-section">
            <div class="ilbattle-title">명예의 전당</div>
            ${renderHall()}
          </div>
          <div class="ilbattle-section full">
            <div class="ilbattle-title">${esc(selected.label || "")} 예측 현황</div>
            ${renderPredTable(ranked, actual, selected)}
            <div class="ilbattle-help" style="margin-top:9px">금요일 이후 실제가가 확인되면 현재 참고가 기준으로 순위가 계산됩니다. 서버 저장이 실패하는 환경에서는 같은 브라우저 안에서 임시 저장됩니다.</div>
          </div>
        </div>
      </section>`;
    byId("ilbattleClose")?.addEventListener("click", closeBattle);
    byId("ilbattleMarket")?.addEventListener("change", renderBattle);
    byId("ilbattleSubmit")?.addEventListener("click", submitPrediction);
  }

  function renderPredTable(rows, actual, market) {
    if (!rows.length) return `<div class="ilbattle-help">아직 등록된 예측이 없습니다.</div>`;
    return `
      <table class="ilbattle-table">
        <thead><tr><th>순위</th><th>이름</th><th>예측값</th><th>오차율</th></tr></thead>
        <tbody>${rows.map((p, idx) => `
          <tr>
            <td>${actual ? idx + 1 : "-"}</td>
            <td>${esc(p.name)}</td>
            <td class="num">${won(p.value)} ${esc(market.unit || p.unit || "")}</td>
            <td class="num">${actual && p.errorPct != null ? `${p.errorPct.toFixed(2)}%` : "-"}</td>
          </tr>`).join("")}</tbody>
      </table>`;
  }

  function renderHall() {
    const hall = battleState?.hall || [];
    if (!hall.length) return `<div class="ilbattle-help">아직 정산된 기록이 없습니다.</div>`;
    return `
      <table class="ilbattle-table">
        <thead><tr><th>이름</th><th>종목</th><th>포인트</th></tr></thead>
        <tbody>${hall.slice(0, 8).map((p) => `
          <tr><td>${esc(p.name)}</td><td>${esc(p.marketLabel)}</td><td class="num">${p.points || 0}p</td></tr>
        `).join("")}</tbody>
      </table>`;
  }

  async function submitPrediction() {
    const name = byId("ilbattleName")?.value.trim() || "익명";
    const marketId = byId("ilbattleMarket")?.value || "nickel";
    const value = Number(String(byId("ilbattleValue")?.value || "").replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      alert("예측값을 입력해주세요.");
      return;
    }
    me.name = name;
    saveMe();
    const payload = { name, marketId, value, week: battleState?.week || weekKey(), targetDate: battleState?.targetDate || targetFriday() };
    try {
      const json = await fetchJson(API.battle, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      battleState.predictions = json.predictions || [json.prediction, ...(battleState.predictions || [])].filter(Boolean);
    } catch {
      const local = localBattle();
      local.predictions = [
        { ...payload, id: `${Date.now()}`, marketLabel: (battleState.markets || []).find((m) => m.id === marketId)?.label || marketId, unit: (battleState.markets || []).find((m) => m.id === marketId)?.unit || "", createdAt: new Date().toISOString() },
        ...(local.predictions || []).filter((p) => !(p.week === payload.week && p.marketId === payload.marketId && p.name === payload.name)),
      ].slice(0, 100);
      saveLocalBattle(local);
      battleState.predictions = local.predictions;
    }
    renderBattle();
  }

  async function openBattle() {
    if (!mq.matches) return;
    if (!byId("ilbattleOverlay")) {
      const overlay = document.createElement("div");
      overlay.id = "ilbattleOverlay";
      overlay.className = "ilbattle-overlay";
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeBattle();
      });
      document.body.appendChild(overlay);
    }
    byId("ilbattleOverlay").classList.add("on");
    await loadBattle();
    renderBattle();
  }

  function closeBattle() {
    byId("ilbattleOverlay")?.classList.remove("on");
  }

  function injectQuickMenuButtons() {
    if (!mq.matches) return;
    const panels = [...document.querySelectorAll("div")].filter((el) => {
      const text = el.textContent || "";
      if (!text.includes("계산기 열기") || !text.includes("D-day 보기") || !text.includes("오늘의 운세")) return false;
      return [...el.children].some((child) => child.tagName === "BUTTON" && (child.textContent || "").includes("계산기 열기"));
    });
    panels.forEach((panel) => {
      const petButton = panel.querySelector('[data-pet-trigger="true"]');
      if (!panel.querySelector('[data-ilfocus-trigger="true"]')) {
        const focusBtn = document.createElement("button");
        focusBtn.type = "button";
        focusBtn.className = "ilbattle-trigger ilfocus-trigger";
        focusBtn.dataset.ilfocusTrigger = "true";
        focusBtn.innerHTML = `<span class="ilbattle-icon">⏱</span><span style="font-size:13px;font-weight:900;color:var(--text-primary,#0f172a)">집중 타이머</span>`;
        focusBtn.addEventListener("click", openFocus);
        if (petButton && petButton.parentElement === panel) panel.insertBefore(focusBtn, petButton);
        else if (petButton?.parentElement) petButton.parentElement.insertBefore(focusBtn, petButton);
        else panel.appendChild(focusBtn);
      }
      if (!panel.querySelector('[data-ilbattle-trigger="true"]')) {
        const battleBtn = document.createElement("button");
        battleBtn.type = "button";
        battleBtn.className = "ilbattle-trigger";
        battleBtn.dataset.ilbattleTrigger = "true";
        battleBtn.innerHTML = `<span class="ilbattle-icon">🏆</span><span style="font-size:13px;font-weight:900;color:var(--text-primary,#0f172a)">가격 예측 배틀</span>`;
        battleBtn.addEventListener("click", openBattle);
        if (petButton && petButton.parentElement === panel) panel.insertBefore(battleBtn, petButton);
        else if (petButton?.parentElement) petButton.parentElement.insertBefore(battleBtn, petButton);
        else panel.appendChild(battleBtn);
      }
    });
  }

  function installQuickMenuHook() {
    // 배포 환경에서 React가 관리하는 빠른 메뉴 안에 버튼을 직접 끼워 넣으면
    // insertBefore 충돌로 전체 화면 렌더가 멈출 수 있어 비활성화합니다.
  }

  function replaceMarketCopy() {
    if (!document.body || !window.NodeFilter) return;
    const replacements = [
      [
        "코스피·코스닥·나스닥·다우 참고값",
        "코스피·코스닥·나스닥·다우 참고값 · 약 3분마다 갱신",
      ],
      [
        "니켈·구리·철강 참고값",
        "FRED, LME 참고값",
      ],
      [
        "철강강관검색",
        "철강·강관 검색",
      ],
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(parent.tagName)) return;
      let text = node.nodeValue || "";
      replacements.forEach(([from, to]) => {
        if (text.includes(from) && !text.includes(to)) text = text.replace(from, to);
      });
      text = text.replace(/(· 약 3분마다 갱신)(\s*· 약 3분마다 갱신)+/g, "$1");
      if (text !== node.nodeValue) node.nodeValue = text;
    });

    document.querySelectorAll("div,span").forEach((el) => {
      const text = [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.nodeValue || "")
        .join(" ")
        .trim();
      if (
        text.includes("Yahoo Finance 참고값") ||
        text.includes("LME·FRED·Yahoo Finance 소스 기반") ||
        text.includes("LME,FRED,Yahoo finance") ||
        text.includes("동향 파악용 참고값")
      ) {
        el.remove();
      }
    });

    document.querySelectorAll(".il-home-readable a, .il-home-readable button").forEach((el) => {
      if ((el.textContent || "").trim() === "이번 주 식단표(마포)") el.textContent = "이번 주 식단표";
    });

    document.querySelectorAll('img[src*="logo"]').forEach((img) => {
      img.style.width = "auto";
      img.style.height = "38px";
      img.style.objectFit = "contain";
      img.style.maxWidth = "176px";
      const holder = img.closest("a,div");
      if (holder) {
        holder.style.minHeight = "64px";
        holder.style.display = "flex";
        holder.style.alignItems = "center";
        holder.style.justifyContent = "center";
      }
    });
  }

  function scheduleMarketCopyReplace() {
    clearTimeout(marketCopyHandle);
    marketCopyHandle = setTimeout(replaceMarketCopy, 80);
  }

  function installMarketCopyHook() {
    if (marketCopyObserver || !document.body) return;
    // React 렌더링 이후 텍스트 노드나 요소를 직접 수정/삭제하지 않습니다.
    // 필요한 문구와 로고 보정은 메인 번들/CSS에서 처리합니다.
  }

  function mount() {
    if (!mq.matches || mounted) return;
    mounted = true;
    injectStyle();
    installQuickMenuHook();
    installMarketCopyHook();
    if (isFocusVisible()) mountFocus();
    backupPersistedKeys();
    window.ILOpenPredictionBattle = openBattle;
    window.ILOpenFocusTimer = openFocus;
  }

  function unmount() {
    mounted = false;
    unmountFocusOnly();
    byId("ilbattleOverlay")?.remove();
    clearTimeout(marketCopyHandle);
    marketCopyHandle = null;
  }

  function handleMode() {
    if (mq.matches) mount();
    else unmount();
  }

  function mountGlobalPolish() {
    installMarketCopyHook();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountGlobalPolish);
  else mountGlobalPolish();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", handleMode);
  else handleMode();
  mq.addEventListener?.("change", handleMode);
})();
