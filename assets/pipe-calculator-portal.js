(function () {
  const CALC_URL = "./assets/pipe-calculator-v2.html";
  const TAB_BY_INDEX = ["weight", "price", "reduce", "draw", "export"];
  const TAB_MAP = new Map([
    ["파이프 계산기", "weight"],
    ["계산기 열기", "weight"],
    ["파이프 무게", "weight"],
    ["수율 계산", "weight"],
    ["무게", "weight"],
    ["무게·가격", "price"],
    ["무게 가격", "price"],
    ["가격 계산", "price"],
    ["단면감소율", "reduce"],
    ["단면 감소율", "reduce"],
    ["인발길이", "draw"],
    ["인발 길이", "draw"],
    ["내외견적", "export"],
    ["내외 견적", "export"],
  ]);

  function byId(id) {
    return document.getElementById(id);
  }

  function normalizeTab(tab) {
    if (typeof tab === "number") return TAB_BY_INDEX[tab] || "weight";
    const normalized = String(tab || "").trim();
    return normalized || "weight";
  }

  function ensureStyle() {
    if (byId("ilPipePortalStyle")) return;
    const style = document.createElement("style");
    style.id = "ilPipePortalStyle";
    style.textContent = `
      .ilpipe-overlay{position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.48);padding:18px;backdrop-filter:blur(3px);overscroll-behavior:contain}
      .ilpipe-overlay.on{display:flex}
      .ilpipe-shell{width:min(760px,96vw);height:min(900px,94vh);background:#fff;border:1px solid var(--border,#e2e8f0);border-radius:18px;box-shadow:0 28px 90px rgba(15,23,42,.32);overflow:hidden;display:flex;flex-direction:column}
      .ilpipe-head{height:46px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px 0 16px;background:#0c4199;color:#fff;flex-shrink:0}
      .ilpipe-title{font-size:13.5px;font-weight:950;letter-spacing:0}
      .ilpipe-close{width:32px;height:32px;border:1px solid rgba(255,255,255,.3);border-radius:9px;background:rgba(255,255,255,.12);color:#fff;font-size:20px;line-height:28px;cursor:pointer}
      .ilpipe-frame{width:100%;height:100%;border:0;background:#fff;flex:1;min-height:0}
      @media(max-width:720px){
        .ilpipe-overlay{padding:0;align-items:stretch;justify-content:stretch;background:#fff}
        .ilpipe-shell{width:100vw;height:100dvh;max-height:100dvh;border:0;border-radius:0;box-shadow:none}
        .ilpipe-head{height:calc(50px + env(safe-area-inset-top));padding-top:env(safe-area-inset-top)}
        .ilpipe-title{font-size:14px}
        .ilpipe-close{width:40px;height:40px;border-radius:12px;font-size:24px;line-height:36px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    ensureStyle();
    let overlay = byId("ilPipeOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "ilPipeOverlay";
    overlay.className = "ilpipe-overlay";
    overlay.innerHTML = `
      <section class="ilpipe-shell" role="dialog" aria-modal="true" aria-label="파이프 계산기">
        <header class="ilpipe-head">
          <div class="ilpipe-title">파이프 계산기</div>
          <button type="button" class="ilpipe-close" id="ilPipeClose" aria-label="닫기">&times;</button>
        </header>
        <iframe class="ilpipe-frame" id="ilPipeFrame" title="파이프 계산기"></iframe>
      </section>
    `;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePipeCalculator();
    });
    document.body.appendChild(overlay);
    byId("ilPipeClose")?.addEventListener("click", closePipeCalculator);
    return overlay;
  }

  function openPipeCalculator(tab = "weight") {
    const selectedTab = normalizeTab(tab);
    const overlay = ensureOverlay();
    const frame = byId("ilPipeFrame");
    if (frame) frame.src = `${CALC_URL}?tab=${encodeURIComponent(selectedTab)}`;
    overlay.classList.add("on");
    document.body.style.overflow = "hidden";
  }

  function closePipeCalculator() {
    const overlay = byId("ilPipeOverlay");
    if (overlay) overlay.classList.remove("on");
    document.body.style.overflow = "";
  }

  function menuTabFromText(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    for (const [label, tab] of TAB_MAP.entries()) {
      if (normalized === label || normalized.includes(label)) return tab;
    }
    return null;
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target.closest?.("button,a");
      if (!target || target.closest("#ilPipeOverlay")) return;
      const tab = menuTabFromText(target.textContent || "");
      if (!tab) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openPipeCalculator(tab);
    },
    true
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && byId("ilPipeOverlay")?.classList.contains("on")) closePipeCalculator();
  });

  window.ILOpenPipeCalculator = openPipeCalculator;
})();
