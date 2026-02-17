// Dashboard: load parents, render grid, handle delete, pagination
(function () {
  const grid = document.getElementById("parent-grid");
  const emptyState = document.getElementById("empty-state");
  const pagination = document.getElementById("pagination");
  const prevPageBtn = document.getElementById("prev-page");
  const nextPageBtn = document.getElementById("next-page");
  const pageInfo = document.getElementById("page-info");
  const pageSizeBtns = document.querySelectorAll(".page-size-btn");

  let allParents = [];
  let currentPage = 1;
  let pageSize = parseInt(localStorage.getItem("dashboard-page-size") || "12");

  // Highlight the active page size button
  function updatePageSizeBtns() {
    pageSizeBtns.forEach((btn) => {
      btn.classList.toggle("active", parseInt(btn.dataset.size) === pageSize);
    });
  }
  updatePageSizeBtns();

  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
      return null;
    }
  }

  async function loadParents() {
    const res = await fetch("/api/parents/", { credentials: "include" });
    if (!res.ok) return [];
    return await res.json();
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(allParents.length / pageSize));
  }

  function getPagedParents() {
    const start = (currentPage - 1) * pageSize;
    return allParents.slice(start, start + pageSize);
  }

  function renderPagination() {
    if (!allParents.length) {
      pagination.style.display = "none";
      return;
    }

    // Always show pagination bar when there are items (for the page size selector)
    pagination.style.display = "flex";

    const totalPages = getTotalPages();
    const hasMultiplePages = totalPages > 1;

    // Show/hide prev/next and page info based on whether there are multiple pages
    const paginationControls = pagination.querySelector(".pagination-controls");
    if (paginationControls) {
      paginationControls.style.display = hasMultiplePages ? "flex" : "none";
    }

    if (hasMultiplePages) {
      pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
      prevPageBtn.disabled = currentPage <= 1;
      nextPageBtn.disabled = currentPage >= totalPages;
    }
  }

  function renderGrid(parents) {
    if (!allParents.length) {
      grid.style.display = "none";
      emptyState.style.display = "block";
      pagination.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    grid.style.display = "grid";
    grid.innerHTML = parents
      .map(
        (p) => `
      <div class="parent-card" data-id="${p.id}">
        <div class="card-actions">
          <button class="btn-edit-parent" data-id="${p.id}" title="Edit">&#9998;</button>
          <button class="btn-delete-parent" data-id="${p.id}" title="Delete">&times;</button>
        </div>
        <h3>${escapeHtml(p.label)}</h3>
        <div class="meta">${p.children_count} name${p.children_count !== 1 ? "s" : ""} &middot; ${formatDate(p.created_at)}${p.is_shared ? ' &middot; <span class="shared-badge">Shared</span>' : ""}</div>
      </div>
    `
      )
      .join("");

    // Click card → view
    grid.querySelectorAll(".parent-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        window.location.href = `/view.html?id=${card.dataset.id}`;
      });
    });

    // Edit parent
    grid.querySelectorAll(".btn-edit-parent").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const parent = allParents.find((p) => p.id == id);
        const newLabel = prompt("Rename baby:", parent?.label);
        if (newLabel && newLabel.trim()) {
          updateParent(id, newLabel.trim());
        }
      });
    });

    // Delete parent
    grid.querySelectorAll(".btn-delete-parent").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showDeleteModal(btn.dataset.id);
      });
    });

    renderPagination();
  }

  function renderCurrentPage() {
    const paged = getPagedParents();
    renderGrid(paged);
  }

  // Pagination events
  if (prevPageBtn) {
    prevPageBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderCurrentPage();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener("click", () => {
      if (currentPage < getTotalPages()) {
        currentPage++;
        renderCurrentPage();
      }
    });
  }

  pageSizeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      pageSize = parseInt(btn.dataset.size);
      localStorage.setItem("dashboard-page-size", String(pageSize));
      currentPage = 1;
      updatePageSizeBtns();
      renderCurrentPage();
    });
  });

  async function updateParent(id, label) {
    await fetch(`/api/parents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ label }),
    });
    init();
  }

  function showDeleteModal(parentId) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>Delete Baby?</h3>
        <p>This will permanently delete this baby and all its name entries.</p>
        <div class="modal-actions">
          <button class="btn btn-outline modal-cancel">Cancel</button>
          <button class="btn btn-danger modal-confirm">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector(".modal-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector(".modal-confirm").addEventListener("click", async () => {
      await fetch(`/api/parents/${parentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      overlay.remove();
      init();
    });
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  // Logout
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login.html";
  });

  async function init() {
    const user = await checkAuth();
    if (!user) return;

    const welcome = document.getElementById("welcome-name");
    if (welcome) welcome.textContent = user.full_name.split(" ")[0];

    allParents = await loadParents();

    // Clamp current page if data changed (e.g. after delete)
    const totalPages = getTotalPages();
    if (currentPage > totalPages) currentPage = totalPages;

    renderCurrentPage();
  }

  init();
})();
