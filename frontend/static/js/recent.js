// Recent: load recently viewed cards from other users
(function () {
  const grid = document.getElementById("recent-grid");
  const emptyState = document.getElementById("empty-state");

  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      window.location.href =
        "/login.html?next=" +
        encodeURIComponent(window.location.pathname + window.location.search);
      return null;
    }
  }

  async function loadRecent() {
    const res = await fetch("/api/recent/", { credentials: "include" });
    if (!res.ok) return [];
    return await res.json();
  }

  function timeAgo(iso) {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function renderGrid(items) {
    if (!items.length) {
      grid.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    emptyState.style.display = "none";
    grid.style.display = "grid";
    grid.innerHTML = items
      .map(
        (p) => `
      <div class="parent-card" data-id="${p.parent_id}">
        <h3>${escapeHtml(p.label)}</h3>
        <div class="meta">
          ${p.children_count} name${p.children_count !== 1 ? "s" : ""}
          &middot; by ${escapeHtml(p.owner_name)}
          &middot; ${timeAgo(p.last_viewed_at)}
          ${p.is_shared ? ' &middot; <span class="shared-badge">Shared</span>' : ""}
        </div>
      </div>
    `
      )
      .join("");

    grid.querySelectorAll(".parent-card").forEach((card) => {
      card.addEventListener("click", () => {
        window.location.href = `/view.html?id=${card.dataset.id}`;
      });
    });
  }

  // Logout
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login.html";
  });

  async function init() {
    const user = await checkAuth();
    if (!user) return;

    const items = await loadRecent();
    renderGrid(items);
  }

  init();
})();
