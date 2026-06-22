(function () {
  const STORE_KEY = "iljin-steelmax-saved-v2";
  const state = {
    query: "",
    category: "",
    page: 1,
    categories: [],
    items: [],
    selected: null,
    saved: [],
  };

  function esc(v) {
    return String(v ?? "").replace(/[&<>'"]/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#039;",
      '"': "&quot;",
    })[ch]);
  }

  function date(v) {
    if (!v) return "";
    try {
      return new Date(v).toLocaleDateString("ko-KR");
    } catch {
      return "";
    }
  }

  function loadSaved() {
    try {
      state.saved = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    } catch {
      state.saved = [];
    }
  }

  function saveSaved() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.saved.slice(0, 200)));
    } catch {}
  }

  async function api(params) {
    const qs = new URLSearchParams(params);
    const res = await fetch(`/api/steelmax?${qs.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || `자료실 API ${res.status}`);
    return json;
  }

  function setStatus(msg) {
    const el = document.querySelector("#smxStatus");
    if (el) el.textContent = msg || "";
  }

  function injectStyle() {
    if (document.getElementById("steelmaxPortalStyle")) return;
    const style = document.createElement("style");
    style.id = "steelmaxPortalStyle";
    style.textContent = `
      .smx-overlay{position:fixed;inset:0;z-index:9998;background:rgba(15,23,42,.38);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:18px;overscroll-behavior:contain}
      .smx-overlay.on{display:flex}
      .smx-panel{width:min(1240px,96vw);height:min(840px,94vh);min-height:0;border-radius:22px;background:#f8fafc;color:#1e293b;box-shadow:0 26px 80px rgba(15,23,42,.32);display:grid;grid-template-columns:410px minmax(0,1fr);overflow:hidden;border:1px solid rgba(148,163,184,.35);font-family:'Noto Sans KR',system-ui,sans-serif}
      .smx-left{background:#fff;border-right:1px solid #e2e8f0;padding:20px;display:flex;flex-direction:column;gap:14px;min-width:0;min-height:0;overflow:hidden}
      .smx-main{padding:22px;overflow:auto;min-height:0;height:100%;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;display:flex}
      .smx-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-shrink:0}
      .smx-title{font-size:21px;font-weight:900;letter-spacing:-.7px;margin:0;color:#0f172a}
      .smx-sub{font-size:12px;color:#64748b;margin-top:5px;line-height:1.55}
      .smx-close{width:34px;height:34px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:20px;line-height:1;color:#334155;flex-shrink:0}
      .smx-search{display:flex;gap:7px;flex-shrink:0}
      .smx-search input{flex:1;height:38px;border:1px solid #cbd5e1;border-radius:12px;padding:0 12px;font-weight:700;outline:none;min-width:0}
      .smx-search button,.smx-primary{height:38px;border:none;border-radius:12px;background:#0c4199;color:#fff;font-size:13px;line-height:1;font-weight:900;padding:0 12px;min-width:54px;white-space:nowrap;flex-shrink:0;cursor:pointer}
      .smx-chips{display:flex;gap:6px;flex-wrap:wrap;max-height:none;overflow:visible;flex-shrink:0;overscroll-behavior:contain}
      .smx-chip{border:1px solid #dbe3ef;background:#fff;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:800;color:#475569;cursor:pointer}
      .smx-chip.on{background:#eaf2ff;border-color:#0c4199;color:#0c4199}
      .smx-results{overflow:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px;min-height:0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
      #smxResults{flex:1 1 auto}
      #smxSaved{flex:0 0 auto;max-height:156px}
      .smx-card{border:1px solid #e2e8f0;background:#fff;border-radius:14px;padding:12px;cursor:pointer;transition:.15s ease;text-align:left}
      .smx-card:hover{border-color:#0c4199;box-shadow:0 10px 24px rgba(12,65,153,.1)}
      .smx-card strong{display:block;font-size:13.5px;line-height:1.35;color:#0f172a;letter-spacing:-.3px}
      .smx-card p{margin:6px 0 0;color:#64748b;font-size:11.5px;line-height:1.5}
      .smx-meta{display:flex;gap:8px;align-items:center;margin-top:7px;font-size:10.5px;color:#94a3b8;font-weight:700;flex-wrap:wrap}
      .smx-article{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:22px;height:100%;min-height:0;display:flex;flex-direction:column;min-width:0;flex:1;overflow:hidden}
      .smx-article h2{font-size:24px;line-height:1.28;letter-spacing:-.8px;margin:0 0 10px}
      .smx-article .body{white-space:pre-wrap;font-size:14.5px;line-height:1.85;color:#334155;max-width:850px;min-height:0;flex:1 1 auto;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-right:4px}
      .smx-source{margin-top:18px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.6}
      .smx-source a{color:#0c4199;font-weight:900;text-decoration:none}
      .smx-tools{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 18px}
      .smx-tools button,.smx-tools a{border:1px solid #dbe3ef;background:#fff;border-radius:11px;padding:8px 11px;font-size:12px;font-weight:900;color:#334155;text-decoration:none;cursor:pointer}
      .smx-tools .blue{background:#0c4199;color:#fff;border-color:#0c4199}
      .smx-empty{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;line-height:1.7}
      .smx-saved-title{font-size:12px;font-weight:900;color:#0f172a;margin-top:2px;flex-shrink:0}
      .smx-note{font-size:11px;line-height:1.6;color:#64748b;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:13px;padding:10px}
      .smx-status{font-size:11px;color:#64748b;min-height:16px;flex-shrink:0}
      @media(max-width:860px){
        .smx-overlay{align-items:stretch;justify-content:stretch;padding:0;background:#f8fafc}
        .smx-panel{grid-template-columns:1fr;grid-template-rows:minmax(238px,42dvh) minmax(0,1fr);height:100dvh;width:100vw;border:0;border-radius:0;box-shadow:none}
        .smx-left{height:auto;max-height:none;border-right:0;border-bottom:1px solid #e2e8f0;padding:calc(12px + env(safe-area-inset-top)) 12px 10px;gap:9px}
        .smx-close{width:42px;height:42px;border-radius:13px;font-size:24px}
        .smx-search{gap:6px}
        .smx-search input{height:44px;border-radius:13px;font-size:16px}
        .smx-search button,.smx-primary{height:44px;border-radius:13px;font-size:14px;min-width:62px}
        .smx-chip{padding:8px 10px;font-size:11.5px;min-height:34px}
        .smx-results{gap:7px}
        .smx-card{padding:11px;border-radius:13px}
        .smx-card strong{font-size:13px}
        .smx-main{padding:12px 12px calc(12px + env(safe-area-inset-bottom));min-height:0;overflow:auto;display:flex}
        .smx-article{padding:15px;min-height:0;height:auto}
        .smx-article h2{font-size:20px}
        .smx-article .body{font-size:13.5px;line-height:1.75;max-height:none}
        .smx-sub{font-size:11px}
        .smx-chips{max-height:none;overflow:visible}
        .smx-tools{gap:7px;margin:12px 0 14px}
        .smx-tools button,.smx-tools a{min-height:40px;flex:1;text-align:center;display:flex;align-items:center;justify-content:center}
        #smxSaved{display:none}
        .smx-saved-title{display:none}
      }
      @media(max-width:420px){
        .smx-panel{grid-template-rows:minmax(220px,40dvh) minmax(0,1fr)}
        .smx-title{font-size:18px}
        .smx-sub{display:none}
        .smx-left{padding-left:10px;padding-right:10px}
        .smx-main{padding-left:10px;padding-right:10px}
      }
    `;
    document.head.appendChild(style);
  }

  function renderResults() {
    const list = document.querySelector("#smxResults");
    if (!list) return;
    if (!state.query && !state.category && !state.items.length) {
      list.innerHTML = `<div class="smx-note">검색어를 입력하면 자료가 표시됩니다. 기본 상태에서는 아무 자료도 검색하지 않습니다.</div>`;
      return;
    }
    list.innerHTML = state.items.map((it) => `
      <button class="smx-card" data-id="${esc(it.id)}">
        <strong>${esc(it.title)}</strong>
        <p>${esc(it.excerpt || "요약 없음")}</p>
        <div class="smx-meta"><span>자료</span><span>${esc(date(it.date))}</span></div>
      </button>
    `).join("") || `<div class="smx-note">검색 결과가 없습니다. 다른 키워드로 검색해보세요.</div>`;
    list.querySelectorAll("[data-id]").forEach((el) => {
      el.addEventListener("click", () => openPost(el.getAttribute("data-id")));
    });
  }

  function renderCategories() {
    const wrap = document.querySelector("#smxCategories");
    if (!wrap) return;
    const important = ["Steel", "강관", "Seamless", "ASTM", "API", "DIN-EN", "KS", "JIS", "Stainless", "Non-Ferrous"];
    const cats = state.categories.filter((c) => important.some((k) => c.name.includes(k))).slice(0, 20);
    wrap.innerHTML =
      `<button class="smx-chip ${state.category ? "" : "on"}" data-cat="">전체</button>` +
      cats.map((c) => `<button class="smx-chip ${String(state.category) === String(c.id) ? "on" : ""}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join("");
    wrap.querySelectorAll("[data-cat]").forEach((el) => {
      el.addEventListener("click", () => {
        state.category = el.getAttribute("data-cat") || "";
        state.page = 1;
        search();
      });
    });
  }

  function renderSelected() {
    const main = document.querySelector("#smxMain");
    if (!main) return;
    if (!state.selected) {
      main.innerHTML = `<div class="smx-empty"><div><strong style="font-size:18px;color:#0f172a">철강·강관 자료실</strong><br/>왼쪽에서 키워드를 검색하면 본문을 이곳에서 확인하고 저장할 수 있습니다.</div></div>`;
      return;
    }
    const it = state.selected;
    const isSaved = state.saved.some((s) => String(s.id || s.url) === String(it.id || it.url));
    main.innerHTML = `
      <article class="smx-article">
        <div class="smx-meta" style="margin:0 0 10px"><span>${esc(date(it.date || it.modified))}</span></div>
        <h2>${esc(it.title)}</h2>
        <div class="smx-tools">
          <button class="blue" id="smxSaveBtn">${isSaved ? "저장됨" : "내 자료로 저장"}</button>
          ${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">원문 열기</a>` : ""}
          <button id="smxCopyBtn">본문 복사</button>
        </div>
        <div class="body">${esc(it.content || it.excerpt || "본문을 불러오지 못했습니다.")}</div>
      </article>`;
    document.querySelector("#smxSaveBtn")?.addEventListener("click", () => {
      const key = String(it.id || it.url);
      if (!state.saved.some((s) => String(s.id || s.url) === key)) {
        state.saved.unshift({ ...it, savedAt: new Date().toISOString() });
        saveSaved();
        renderSaved();
        renderSelected();
      }
    });
    document.querySelector("#smxCopyBtn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(`${it.title}\n\n${it.content || it.excerpt || ""}`);
        setStatus("본문을 클립보드에 복사했습니다.");
      } catch {
        setStatus("복사 권한이 없어 실패했습니다.");
      }
    });
  }

  function renderSaved() {
    const box = document.querySelector("#smxSaved");
    if (!box) return;
    box.innerHTML = state.saved.slice(0, 8).map((it, i) => `
      <button class="smx-card" data-saved="${i}">
        <strong>${esc(it.title)}</strong>
        <p>${esc((it.excerpt || it.content || "").slice(0, 100))}</p>
      </button>
    `).join("") || `<div class="smx-note">아직 저장한 자료가 없습니다.</div>`;
    box.querySelectorAll("[data-saved]").forEach((el) => {
      el.addEventListener("click", () => {
        state.selected = state.saved[Number(el.getAttribute("data-saved"))];
        renderSelected();
      });
    });
  }

  async function search() {
    if (!state.query && !state.category) {
      state.items = [];
      renderResults();
      setStatus("검색어를 입력하세요.");
      return;
    }
    setStatus("검색 중...");
    try {
      const data = await api({ q: state.query, category: state.category, page: state.page, per_page: 20 });
      state.items = data.items || [];
      renderResults();
      setStatus(`검색 결과 ${data.total || state.items.length}건${data.totalPages ? ` · ${data.page}/${data.totalPages}쪽` : ""}`);
    } catch (err) {
      state.items = [];
      renderResults();
      setStatus(`검색 실패: ${err.message}`);
    }
  }

  async function openPost(id) {
    setStatus("본문 불러오는 중...");
    try {
      const data = await api({ action: "post", id });
      state.selected = data.post;
      renderSelected();
      setStatus("본문을 불러왔습니다.");
    } catch (err) {
      setStatus(`본문 조회 실패: ${err.message}`);
    }
  }

  async function loadCategories() {
    try {
      const data = await api({ action: "categories" });
      state.categories = data.categories || [];
    } catch {
      state.categories = [];
    }
    renderCategories();
  }

  function resetSearchView() {
    state.query = "";
    state.category = "";
    state.page = 1;
    state.items = [];
    state.selected = null;
    const input = document.querySelector("#smxQuery");
    if (input) input.value = "";
    renderCategories();
    renderResults();
    renderSelected();
    setStatus("");
    document.querySelector("#smxMain")?.scrollTo?.({ top: 0 });
  }

  function open() {
    document.querySelector("#steelmaxOverlay")?.classList.add("on");
    resetSearchView();
  }

  function close() {
    document.querySelector("#steelmaxOverlay")?.classList.remove("on");
  }

  function installWheelBridge(overlay) {
    overlay.addEventListener("wheel", (event) => {
      const target = event.target.closest?.(".smx-results,.smx-main,.body");
      if (!target) return;
      const canScroll = target.scrollHeight > target.clientHeight;
      if (!canScroll) return;
      event.preventDefault();
      target.scrollTop += event.deltaY;
    }, { passive: false });
  }

  function mount() {
    injectStyle();
    loadSaved();
    window.ILOpenSteelmax = open;
    window.addEventListener("iljin-steelmax-open", open);

    const overlay = document.createElement("div");
    overlay.id = "steelmaxOverlay";
    overlay.className = "smx-overlay";
    overlay.innerHTML = `
      <section class="smx-panel" role="dialog" aria-modal="true" aria-label="철강·강관 자료실">
        <aside class="smx-left">
          <div class="smx-head">
            <div>
              <h1 class="smx-title">철강·강관 자료실</h1>
              <div class="smx-sub">철강·강관·규격 자료를 검색하고 개인 자료로 저장합니다.</div>
            </div>
            <button class="smx-close" id="smxClose" aria-label="닫기">×</button>
          </div>
          <div class="smx-search">
            <input id="smxQuery" value="${esc(state.query)}" placeholder="예: A106, SMLS, API 5L, STS"/>
            <button id="smxSearchBtn">검색</button>
          </div>
          <div class="smx-chips" id="smxCategories"><button class="smx-chip on">전체</button></div>
          <div class="smx-status" id="smxStatus"></div>
          <div class="smx-results" id="smxResults"></div>
          <div class="smx-saved-title">내 자료실</div>
          <div class="smx-results" id="smxSaved"></div>
        </aside>
        <main class="smx-main" id="smxMain"></main>
      </section>`;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
    installWheelBridge(overlay);

    document.querySelector("#smxClose")?.addEventListener("click", close);
    document.querySelector("#smxSearchBtn")?.addEventListener("click", () => {
      state.query = document.querySelector("#smxQuery").value.trim();
      state.page = 1;
      search();
    });
    document.querySelector("#smxQuery")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.querySelector("#smxSearchBtn")?.click();
    });

    renderSaved();
    renderSelected();
    loadCategories();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
