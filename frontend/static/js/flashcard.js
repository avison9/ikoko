/* =========================
   STATE
   ========================= */
const container = document.getElementById("flashcard-container");

let parents = [];
let parentIndex = 0;
let childIndex = 0;
let currentUserId = null;
let isGuest = false;

function applyGuestUI() {
  const nextUrl = encodeURIComponent(window.location.pathname + window.location.search);

  // Navbar: hide app links, show login/register
  const navDashboard = document.getElementById("nav-dashboard");
  const navAdd = document.getElementById("nav-add");
  const navAnalytics = document.getElementById("nav-analytics");
  const navProfile = document.getElementById("nav-profile");
  const logoutBtn = document.getElementById("logout-btn");
  const navLogin = document.getElementById("nav-login");
  const navRegister = document.getElementById("nav-register");

  if (navDashboard) navDashboard.style.display = "none";
  if (navAdd) navAdd.style.display = "none";
  if (navAnalytics) navAnalytics.style.display = "none";
  if (navProfile) navProfile.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "none";
  if (navLogin) { navLogin.style.display = ""; navLogin.href = `/login.html?next=${nextUrl}`; }
  if (navRegister) { navRegister.style.display = ""; navRegister.href = `/register.html?next=${nextUrl}`; }

  // Guest CTA banner
  const guestCta = document.getElementById("guest-cta");
  const ctaLogin = document.getElementById("cta-login");
  const ctaRegister = document.getElementById("cta-register");
  if (guestCta) guestCta.style.display = "block";
  if (ctaLogin) ctaLogin.href = `/login.html?next=${nextUrl}`;
  if (ctaRegister) ctaRegister.href = `/register.html?next=${nextUrl}`;

  // Hide share/action bar for guests
  const actionBar = document.querySelector(".action-bar");
  if (actionBar) actionBar.style.display = "none";
}

function showGuestToast(message) {
  const existing = document.querySelector(".guest-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "guest-toast";
  const nextUrl = encodeURIComponent(window.location.pathname + window.location.search);
  toast.innerHTML = `${message} <a href="/login.html?next=${nextUrl}">Log in</a> or <a href="/register.html?next=${nextUrl}">Register</a>`;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

const PRESET_EMOJIS = [
  "\u2764\uFE0F", "\uD83D\uDD25", "\uD83D\uDE0D", "\uD83D\uDE4F", "\uD83C\uDF1F", "\uD83D\uDC4D",
  "\uD83E\uDD70", "\uD83D\uDE02", "\uD83C\uDF89", "\uD83D\uDCAF", "\uD83E\uDD29", "\uD83D\uDE07",
  "\uD83D\uDC96", "\uD83D\uDE18", "\uD83E\uDD17", "\uD83D\uDE4C", "\uD83C\uDF08", "\uD83C\uDF3B",
  "\uD83D\uDC23", "\uD83C\uDF80", "\uD83D\uDE0E", "\uD83E\uDD73", "\uD83D\uDC95", "\uD83C\uDF1E",
];

/* =========================
   LOAD DATA
   ========================= */
async function loadCards() {
  try {
    const params = new URLSearchParams(window.location.search);
    const parentId = params.get("id");

    if (!parentId) {
      container.innerHTML = "<p>No baby selected. <a href='/dashboard.html'>Go to dashboard</a></p>";
      return;
    }

    let res;
    let data;

    if (isGuest) {
      // Guest: use public endpoint directly
      res = await fetch(`/api/parents/${parentId}/public`, { credentials: "include" });
    } else {
      res = await fetch(`/api/parents/${parentId}`, { credentials: "include" });
      if (res.status === 401) {
        // Not logged in — try public endpoint as guest
        isGuest = true;
        applyGuestUI();
        res = await fetch(`/api/parents/${parentId}/public`, { credentials: "include" });
      }
    }

    if (res.status === 403) {
      container.style.display = "none";
      document.querySelector(".card-stage").style.display = "none";
      document.querySelector(".action-bar").style.display = "none";
      document.querySelector("h1").style.display = "none";
      const ownerBanner = document.getElementById("owner-banner");
      if (ownerBanner) ownerBanner.style.display = "none";
      const engagementSection = document.getElementById("engagement-section");
      if (engagementSection) engagementSection.style.display = "none";
      const guestCta = document.getElementById("guest-cta");
      if (guestCta) guestCta.style.display = "none";
      document.getElementById("unauthorized-state").style.display = "flex";
      return;
    }
    if (!res.ok) throw new Error("Failed to load data");

    data = await res.json();

    if (data.is_guest) {
      isGuest = true;
      applyGuestUI();
    }

    if (data.is_owner) {
      const listRes = await fetch("/api/parents/", { credentials: "include" });
      if (listRes.ok) {
        const allParents = await listRes.json();
        const detailed = await Promise.all(
          allParents.map(async (p) => {
            if (p.id == parentId) return data;
            const r = await fetch(`/api/parents/${p.id}`, { credentials: "include" });
            if (!r.ok) return null;
            return await r.json();
          })
        );
        parents = detailed
          .filter(Boolean)
          .map((d) => ({
            id: d.id,
            name: d.label,
            is_owner: d.is_owner,
            is_shared: d.is_shared,
            owner_name: d.owner_name,
            children: (d.children || []).map((c) => ({
              id: c.id,
              name: c.name,
              phonetic: c.phonetic || "",
              meaning: c.meaning,
              passage: c.passage || "",
              audio: c.audio_url || "",
            })),
          }));

        parentIndex = parents.findIndex((p) => p.id == parentId);
        if (parentIndex === -1) parentIndex = 0;
      }
    } else {
      parents = [
        {
          id: data.id,
          name: data.label,
          is_owner: data.is_owner,
          is_shared: data.is_shared,
          owner_name: data.owner_name,
          children: (data.children || []).map((c) => ({
            id: c.id,
            name: c.name,
            phonetic: c.phonetic || "",
            meaning: c.meaning,
            passage: c.passage || "",
            audio: c.audio_url || "",
          })),
        },
      ];
      parentIndex = 0;
    }

    renderParent();
    updatePageMeta();
    loadEngagement(parentId);
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Failed to load flashcards</p>";
  }
}

function updatePageMeta() {
  const parent = getCurrentParent();
  if (!parent) return;

  const titleEl = document.querySelector("h1");
  if (titleEl) titleEl.textContent = parent.name;

  const url = new URL(window.location);
  url.searchParams.set("id", parent.id);
  window.history.replaceState({}, "", url);

  const navAdd = document.getElementById("nav-add");
  const banner = document.getElementById("owner-banner");

  if (!parent.is_owner) {
    if (navAdd) navAdd.style.display = "none";
    if (banner) {
      banner.textContent = `Shared by ${parent.owner_name.split(" ")[0]}`;
      banner.style.display = "block";
    }
  } else {
    if (navAdd) navAdd.style.display = "";
    if (banner) banner.style.display = "none";
  }
}

(async function () {
  try {
    const meRes = await fetch("/api/auth/me", { credentials: "include" });
    if (meRes.ok) {
      const me = await meRes.json();
      currentUserId = me.id;
    } else {
      isGuest = true;
      applyGuestUI();
    }
  } catch {
    isGuest = true;
    applyGuestUI();
  }
  loadCards();
})();

/* =========================
   HELPERS
   ========================= */
function getCurrentParent() {
  return parents[parentIndex] || null;
}

function getCurrentChild(parent) {
  if (!parent?.children?.length) return null;
  return parent.children[childIndex] || null;
}

function getChildProgress(parent) {
  if (!parent?.children?.length) return 0;
  return ((childIndex + 1) / parent.children.length) * 100;
}

/* =========================
   MEASURE CARD WIDTH
   ========================= */
let computedCardWidth = 320; // default minimum

function measureCardWidth() {
  const parent = getCurrentParent();
  if (!parent?.children?.length) {
    computedCardWidth = 320;
    return;
  }

  // Create hidden measurer with the same font styles as the card
  const measurer = document.createElement("div");
  measurer.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(measurer);

  // Measure name text (h2 style)
  const nameEl = document.createElement("h2");
  nameEl.style.cssText = "font-size:1.6rem;font-weight:600;margin:0;white-space:nowrap;display:inline-block;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;";
  measurer.appendChild(nameEl);

  // Measure phonetic text
  const phoneticEl = document.createElement("div");
  phoneticEl.style.cssText = "font-size:0.95rem;font-style:italic;margin:0;white-space:nowrap;display:inline-block;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;";
  measurer.appendChild(phoneticEl);

  // Measure meaning text (back face)
  const meaningEl = document.createElement("p");
  meaningEl.style.cssText = "font-size:1rem;line-height:1.5;margin:0;white-space:nowrap;display:inline-block;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;";
  measurer.appendChild(meaningEl);

  let maxWidth = 0;

  for (const child of parent.children) {
    // Measure name
    nameEl.textContent = child.name || "";
    maxWidth = Math.max(maxWidth, nameEl.scrollWidth);

    // Measure phonetic
    if (child.phonetic) {
      phoneticEl.textContent = child.phonetic;
      maxWidth = Math.max(maxWidth, phoneticEl.scrollWidth);
    }

    // Measure meaning
    meaningEl.textContent = child.meaning || "";
    maxWidth = Math.max(maxWidth, meaningEl.scrollWidth);

    // Measure passage
    if (child.passage) {
      phoneticEl.textContent = child.passage;
      maxWidth = Math.max(maxWidth, phoneticEl.scrollWidth);
    }
  }

  document.body.removeChild(measurer);

  // Add padding (1.25rem × 2 = 2.5rem ≈ 40px) + extra breathing room
  const cardWidth = maxWidth + 60;

  // Clamp between 200px min and 90vw max
  const maxVw = window.innerWidth * 0.9;
  computedCardWidth = Math.max(200, Math.min(cardWidth, maxVw));
}

/* =========================
   RENDER
   ========================= */
function renderParent() {
  childIndex = 0;
  measureCardWidth();
  renderCard();
}

function renderCard() {
  const parent = getCurrentParent();
  if (!parent) return;

  const child = getCurrentChild(parent);
  const card = child || parent;

  const phoneticHTML = card.phonetic
    ? `<div class="phonetic">${card.phonetic}</div>`
    : "";

  const passageHTML = card.passage
    ? `<div class="passage">${card.passage}</div>`
    : "";

  const audioHTML = card.audio
    ? `<audio src="${card.audio}"></audio>`
    : "";

  const childControlsHTML =
    parent.children && parent.children.length
      ? `
        <div class="child-controls">
          <button class="child-arrow child-prev">\u2039</button>
          <div class="progress-bar">
            <div class="fill" style="width:${getChildProgress(parent)}%"></div>
          </div>
          <button class="child-arrow child-next">\u203A</button>
        </div>
      `
      : "";

  const showParentArrows = parents.length > 1;

  container.innerHTML = `
    <div class="card-wrapper">
      ${showParentArrows ? `<button class="nav-arrow nav-prev">\u2039</button>` : ""}

      <div class="flashcard" tabindex="0" style="width:${computedCardWidth}px">
        <div class="flashcard-face flashcard-front">
          <button class="download-btn" title="Download card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          ${card.audio ? `<button class="audio-btn" title="Play audio">\uD83D\uDD0A</button>` : ""}
          <h2>${card.name || ""}</h2>
          ${phoneticHTML}
          ${audioHTML}
        </div>

        <div class="flashcard-face flashcard-back">
          <div>
            <p>${card.meaning || ""}</p>
            ${passageHTML}
          </div>
        </div>

        ${childControlsHTML}
      </div>

      ${showParentArrows ? `<button class="nav-arrow nav-next">\u203A</button>` : ""}
    </div>
  `;

  attachEvents();
}

/* =========================
   EVENTS
   ========================= */
function attachEvents() {
  const flashcard = container.querySelector(".flashcard");
  const audioBtn = container.querySelector(".audio-btn");
  const audio = container.querySelector("audio");
  const dlBtn = container.querySelector(".download-btn");
  const parent = getCurrentParent();

  /* Flip card */
  flashcard.addEventListener("click", () => {
    flashcard.classList.toggle("is-flipped");
  });

  flashcard.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flashcard.classList.toggle("is-flipped");
    }
  });

  /* Audio */
  if (audioBtn) {
    audioBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isGuest) {
        showGuestToast("Register to play audio.");
        return;
      }
      if (audio) {
        audio.currentTime = 0;
        audio.play();
      }
    });
  }

  /* Download card as animated GIF */
  if (dlBtn) {
    dlBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isGuest) {
        showGuestToast("Register to download cards.");
        return;
      }
      downloadCardGif();
    });
  }

  /* Parent navigation */
  const prevBtn = container.querySelector(".nav-prev");
  const nextBtn = container.querySelector(".nav-next");

  if (prevBtn) {
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      parentIndex = (parentIndex - 1 + parents.length) % parents.length;
      renderParent();
      updatePageMeta();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      parentIndex = (parentIndex + 1) % parents.length;
      renderParent();
      updatePageMeta();
    });
  }

  /* Child navigation */
  if (parent?.children?.length) {
    container.querySelector(".child-prev").addEventListener("click", (e) => {
      e.stopPropagation();
      childIndex =
        (childIndex - 1 + parent.children.length) % parent.children.length;
      renderCard();
    });

    container.querySelector(".child-next").addEventListener("click", (e) => {
      e.stopPropagation();
      childIndex = (childIndex + 1) % parent.children.length;
      renderCard();
    });
  }
}

/* =========================
   DOWNLOAD – Animated GIF
   Captures front (5s) then flips to back (5s)
   ========================= */
async function downloadCardGif() {
  const parent = getCurrentParent();
  const child = getCurrentChild(parent);
  const card = child || parent;
  const dlBtn = container.querySelector(".download-btn");

  // Disable button and show spinner
  if (dlBtn) {
    dlBtn.disabled = true;
    dlBtn.innerHTML = `<span class="dl-spinner"></span>`;
  }

  try {
    // Build an offscreen card to capture — clean, no buttons or controls
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;";
    document.body.appendChild(wrapper);

    const phoneticHTML = card.phonetic ? `<div class="phonetic">${card.phonetic}</div>` : "";
    const passageHTML = card.passage ? `<div class="passage">${card.passage}</div>` : "";

    // Resolve CSS variables to actual colors for the offscreen capture
    const root = getComputedStyle(document.documentElement);
    const bgCard = root.getPropertyValue("--bg-card").trim();
    const textColor = root.getPropertyValue("--text").trim();
    const textMuted = root.getPropertyValue("--text-muted").trim();
    const borderColor = root.getPropertyValue("--border").trim();

    wrapper.innerHTML = `
      <div style="width:${computedCardWidth}px;aspect-ratio:8/5;position:relative;">
        <div id="gif-front" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1.25rem;background:${bgCard};border:1px solid ${borderColor};border-radius:16px;">
          <h2 style="font-size:1.6rem;font-weight:600;margin:0;color:${textColor};">${card.name || ""}</h2>
          ${card.phonetic ? `<div style="margin-top:0.25rem;font-size:0.95rem;font-style:italic;text-decoration:underline;color:${textMuted};">${card.phonetic}</div>` : ""}
        </div>
        <div id="gif-back" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:1.25rem;background:${bgCard};border:1px solid ${borderColor};border-radius:16px;visibility:hidden;">
          <div>
            <p style="font-size:1rem;line-height:1.5;margin:0;color:${textColor};">${card.meaning || ""}</p>
            ${card.passage ? `<div style="margin-top:0.6rem;font-size:0.85rem;font-style:italic;color:${textMuted};">${card.passage}</div>` : ""}
          </div>
        </div>
      </div>
    `;

    const frontEl = wrapper.querySelector("#gif-front");
    const backEl = wrapper.querySelector("#gif-back");

    // Capture front
    const frontCanvas = await html2canvas(frontEl, { backgroundColor: null, scale: 2 });

    // Capture back
    frontEl.style.visibility = "hidden";
    backEl.style.visibility = "visible";
    const backCanvas = await html2canvas(backEl, { backgroundColor: null, scale: 2 });

    document.body.removeChild(wrapper);

    // Fetch gif.js worker script as blob to avoid CORS issues
    const workerRes = await fetch("https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js");
    const workerBlob = new Blob([await workerRes.text()], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(workerBlob);

    // Build GIF: front for 5s, back for 5s
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: frontCanvas.width,
      height: frontCanvas.height,
      workerScript: workerUrl,
    });

    // Use multiple copies of each frame to ensure mobile viewers respect the delay.
    // Some mobile apps cap per-frame delay, so we split 5s into 5x1000ms frames.
    for (let i = 0; i < 5; i++) gif.addFrame(frontCanvas, { copy: true, delay: 1000 });
    for (let i = 0; i < 5; i++) gif.addFrame(backCanvas, { copy: true, delay: 1000 });

    gif.on("finished", async (blob) => {
      URL.revokeObjectURL(workerUrl);
      const fileName = `${card.name || "flashcard"}.gif`;
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      // Mobile only: use native share sheet with file
      if (isMobile && navigator.canShare) {
        const file = new File([blob], fileName, { type: "image/gif" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: fileName });
          } catch (e) {
            // User cancelled — still fine
          }
          restoreDownloadBtn();
          return;
        }
      }

      // Desktop / fallback: anchor download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      restoreDownloadBtn();
    });

    gif.render();
  } catch (err) {
    console.error("Download failed:", err);
    restoreDownloadBtn();
  }
}

function restoreDownloadBtn() {
  const dlBtn = container.querySelector(".download-btn");
  if (dlBtn) {
    dlBtn.disabled = false;
    dlBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`;
  }
}

/* =========================
   ENGAGEMENT – Reactions + Comments
   ========================= */
function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  }) + " " + d.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });
}

let commentRefreshInterval = null;

async function loadEngagement(parentId) {
  const section = document.getElementById("engagement-section");
  if (!section) return;

  section.style.display = "block";

  const apiBase = isGuest
    ? `/api/parents/${parentId}/public`
    : `/api/parents/${parentId}`;

  const [reactionsRes, commentsRes] = await Promise.all([
    fetch(`${apiBase}/reactions`, { credentials: "include" }),
    fetch(`${apiBase}/comments`, { credentials: "include" }),
  ]);

  const reactions = reactionsRes.ok ? await reactionsRes.json() : [];
  const comments = commentsRes.ok ? await commentsRes.json() : [];

  renderReactions(parentId, reactions);
  renderComments(parentId, comments);
  attachCommentForm(parentId);
  attachReactionToggle(reactions.length > 0);

  // Auto-refresh comments every 30 seconds
  if (commentRefreshInterval) clearInterval(commentRefreshInterval);
  commentRefreshInterval = setInterval(() => refreshComments(parentId), 30000);
}

async function refreshComments(parentId) {
  try {
    const endpoint = isGuest
      ? `/api/parents/${parentId}/public/comments`
      : `/api/parents/${parentId}/comments`;
    const res = await fetch(endpoint, { credentials: "include" });
    if (!res.ok) return;
    const comments = await res.json();

    // Only re-render if comment count changed
    if (comments.length !== allComments.length) {
      const list = document.getElementById("comments-list");
      const scrollTop = list ? list.scrollTop : 0;
      renderComments(parentId, comments);
      if (list) list.scrollTop = scrollTop;
    }
  } catch { /* silent fail on network issues */ }
}

function attachReactionToggle(hasExisting) {
  const toggleBtn = document.getElementById("reaction-toggle");
  const wrap = document.getElementById("reaction-scroll-wrap");
  const bar = document.getElementById("reaction-bar");
  const leftArrow = document.getElementById("reaction-scroll-left");
  const rightArrow = document.getElementById("reaction-scroll-right");
  if (!toggleBtn || !wrap || !bar) return;

  if (hasExisting) {
    wrap.style.display = "flex";
    toggleBtn.classList.add("open");
  } else {
    wrap.style.display = "none";
    toggleBtn.classList.remove("open");
  }

  // Clone to remove old listeners
  const newBtn = toggleBtn.cloneNode(true);
  toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);

  newBtn.addEventListener("click", () => {
    const isOpen = wrap.style.display === "flex";
    wrap.style.display = isOpen ? "none" : "flex";
    newBtn.classList.toggle("open", !isOpen);
  });

  // Scroll arrows
  const SCROLL_STEP = 120;
  if (leftArrow) {
    leftArrow.addEventListener("click", () => {
      bar.scrollBy({ left: -SCROLL_STEP, behavior: "smooth" });
    });
  }
  if (rightArrow) {
    rightArrow.addEventListener("click", () => {
      bar.scrollBy({ left: SCROLL_STEP, behavior: "smooth" });
    });
  }
}

function renderReactions(parentId, reactions) {
  const bar = document.getElementById("reaction-bar");
  if (!bar) return;

  // Total count per emoji and user's own count per emoji
  const totalCounts = {};
  const userCounts = {};
  PRESET_EMOJIS.forEach((e) => { totalCounts[e] = 0; userCounts[e] = 0; });

  reactions.forEach((r) => {
    totalCounts[r.emoji] = (totalCounts[r.emoji] || 0) + 1;
    if (r.user_id === currentUserId) userCounts[r.emoji] = (userCounts[r.emoji] || 0) + 1;
  });

  bar.innerHTML = PRESET_EMOJIS.map((emoji) => `
    <button class="reaction-btn${userCounts[emoji] > 0 ? " active" : ""}" data-emoji="${emoji}">
      <span class="emoji">${emoji}</span>
      <span class="count">${totalCounts[emoji] || ""}</span>
    </button>
  `).join("");

  bar.querySelectorAll(".reaction-btn").forEach((btn) => {
    const emoji = btn.dataset.emoji;

    // Left click: add +1 (up to 10 per user)
    btn.addEventListener("click", async () => {
      if (isGuest) {
        showGuestToast("Register to react.");
        return;
      }
      if (userCounts[emoji] >= 10) {
        btn.classList.remove("shake");
        void btn.offsetWidth;
        btn.classList.add("shake");
        return;
      }

      btn.classList.remove("pop");
      void btn.offsetWidth;
      btn.classList.add("pop");

      await fetch(`/api/parents/${parentId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emoji }),
      });
      const res = await fetch(`/api/parents/${parentId}/reactions`, { credentials: "include" });
      if (res.ok) renderReactions(parentId, await res.json());
    });

    // Right click: remove one
    btn.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      if (isGuest) {
        showGuestToast("Register to react.");
        return;
      }
      if (userCounts[emoji] <= 0) return;

      await fetch(`/api/parents/${parentId}/reactions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emoji }),
      });
      const res = await fetch(`/api/parents/${parentId}/reactions`, { credentials: "include" });
      if (res.ok) renderReactions(parentId, await res.json());
    });
  });
}

const COMMENTS_PER_PAGE = 10;
let allComments = [];
let commentsShown = 0;

function renderComments(parentId, comments) {
  const list = document.getElementById("comments-list");
  if (!list) return;

  allComments = comments;
  commentsShown = 0;
  list.innerHTML = "";

  if (comments.length === 0) {
    list.innerHTML = '<p class="no-comments">No comments yet.</p>';
    return;
  }

  showMoreComments();
}

function showMoreComments() {
  const list = document.getElementById("comments-list");
  if (!list) return;

  // Remove existing "Show more" button if present
  const existingBtn = list.querySelector(".show-more-btn");
  if (existingBtn) existingBtn.remove();

  const nextBatch = allComments.slice(commentsShown, commentsShown + COMMENTS_PER_PAGE);
  nextBatch.forEach((c) => {
    const item = document.createElement("div");
    item.className = "comment-item";
    const avatarHtml = c.profile_picture_url
      ? `<img class="comment-avatar" src="${escapeHtml(c.profile_picture_url)}" alt="" />`
      : `<div class="comment-avatar comment-avatar-default"></div>`;
    item.innerHTML = `
      ${avatarHtml}
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(c.full_name)}</span>
          <span class="comment-time">${formatDate(c.created_at)}</span>
        </div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
      </div>
    `;
    list.appendChild(item);
  });

  commentsShown += nextBatch.length;

  // Add "Show more" button if there are remaining comments
  if (commentsShown < allComments.length) {
    const remaining = allComments.length - commentsShown;
    const btn = document.createElement("button");
    btn.className = "show-more-btn";
    btn.textContent = `Show more (${remaining})`;
    btn.addEventListener("click", showMoreComments);
    list.appendChild(btn);
  }
}

function attachCommentForm(parentId) {
  const form = document.getElementById("comment-form");
  if (!form) return;

  const status = document.getElementById("comment-status");

  function showStatus(msg, type) {
    if (!status) return;
    status.textContent = msg;
    status.className = "comment-status " + type;
    setTimeout(() => { status.classList.add("fade-out"); }, 2000);
    setTimeout(() => { status.textContent = ""; status.className = "comment-status"; }, 2500);
  }

  // Clone form to strip old listeners
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  newForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isGuest) {
      showGuestToast("Register to comment.");
      return;
    }
    const textarea = newForm.querySelector("#comment-text");
    const text = textarea.value.trim();
    if (!text) return;

    const submitBtn = newForm.querySelector(".send-btn");
    if (submitBtn) submitBtn.disabled = true;

    const res = await fetch(`/api/parents/${parentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text }),
    });

    if (submitBtn) submitBtn.disabled = false;

    if (res.ok) {
      textarea.value = "";
      showStatus("Comment posted!", "success");
      const commentsRes = await fetch(`/api/parents/${parentId}/comments`, { credentials: "include" });
      if (commentsRes.ok) renderComments(parentId, await commentsRes.json());
    } else {
      showStatus("Failed to post comment.", "error");
    }
  });
}

/* =========================
   SHARE – Link + QR Code
   ========================= */
(function () {
  const shareBtn = document.getElementById("share-btn");
  const shareModal = document.getElementById("share-modal");
  const shareLinkInput = document.getElementById("share-link-input");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const nativeShareBtn = document.getElementById("native-share-btn");
  const shareModalClose = document.getElementById("share-modal-close");
  const qrContainer = document.getElementById("qr-container");

  if (!shareBtn) return;

  const shareToggleRow = document.getElementById("share-toggle-row");
  const shareToggleInput = document.getElementById("share-toggle-input");
  const shareToggleLabel = document.getElementById("share-toggle-label");

  function updateShareToggleUI(parent) {
    if (!shareToggleRow) return;
    if (parent.is_owner) {
      shareToggleRow.style.display = "flex";
      shareToggleInput.checked = parent.is_shared;
      shareToggleLabel.textContent = parent.is_shared ? "Sharing is on" : "Sharing is off";
      shareToggleLabel.className = "share-toggle-label " + (parent.is_shared ? "share-status-on" : "share-status-off");
    } else {
      shareToggleRow.style.display = "none";
    }
  }

  // Toggle sharing on/off
  if (shareToggleInput) {
    shareToggleInput.addEventListener("change", async () => {
      const parent = getCurrentParent();
      if (!parent) return;

      const res = await fetch(`/api/parents/${parent.id}/share`, {
        method: "PUT",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        parent.is_shared = data.is_shared;
        updateShareToggleUI(parent);
      } else {
        // Revert the checkbox on failure
        shareToggleInput.checked = parent.is_shared;
      }
    });
  }

  shareBtn.addEventListener("click", () => {
    const parent = getCurrentParent();
    if (!parent) return;

    const shareUrl = `${window.location.origin}/view.html?id=${parent.id}`;
    shareLinkInput.value = shareUrl;

    updateShareToggleUI(parent);

    // Generate QR code
    qrContainer.innerHTML = "";
    const qrCanvas = document.createElement("canvas");
    qrContainer.appendChild(qrCanvas);

    if (typeof QRCode !== "undefined") {
      QRCode.toCanvas(qrCanvas, shareUrl, {
        width: 180,
        margin: 2,
        color: {
          dark: getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#1f2937",
          light: getComputedStyle(document.documentElement).getPropertyValue("--bg-card").trim() || "#ffffff",
        },
      });
    }

    // Show native share if available
    if (navigator.share) {
      nativeShareBtn.style.display = "inline-flex";
    }

    shareModal.style.display = "flex";
  });

  // Copy link
  copyLinkBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(shareLinkInput.value).then(() => {
      copyLinkBtn.textContent = "Copied!";
      setTimeout(() => { copyLinkBtn.textContent = "Copy"; }, 2000);
    });
  });

  // Native share
  nativeShareBtn.addEventListener("click", () => {
    const parent = getCurrentParent();
    navigator.share({
      title: parent ? parent.name + " – Ìkókó" : "Ìkókó Card",
      url: shareLinkInput.value,
    });
  });

  // Close
  shareModalClose.addEventListener("click", () => {
    shareModal.style.display = "none";
  });

  shareModal.addEventListener("click", (e) => {
    if (e.target === shareModal) shareModal.style.display = "none";
  });
})();
