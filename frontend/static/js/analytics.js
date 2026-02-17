(function () {
  let currentUser = null;
  let ownedParents = [];

  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname);
      return null;
    }
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    }) + " " + d.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit",
    });
  }

  // ── Summary ──────────────────────────────────
  async function loadSummary() {
    const res = await fetch("/api/analytics/summary", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById("stat-names").textContent = data.total_names_created;
    document.getElementById("stat-shared").textContent = data.total_shared_parents;

    const sharedItems = document.getElementById("shared-items");
    if (data.shared_parents.length === 0) {
      sharedItems.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No views yet.</p>';
    } else {
      sharedItems.innerHTML = data.shared_parents
        .map(
          (sp) => `
          <div class="shared-item">
            <span class="label">${escapeHtml(sp.label)}</span>
            <span class="views">${sp.view_count} view${sp.view_count !== 1 ? "s" : ""}</span>
          </div>`
        )
        .join("");
    }
  }

  // ── Toggle shared list ───────────────────────
  document.getElementById("toggle-shared").addEventListener("click", () => {
    const el = document.getElementById("shared-list");
    el.style.display = el.style.display === "none" ? "block" : "none";
  });

  // ── Collaborators ────────────────────────────
  async function loadOwnedParents() {
    const res = await fetch("/api/parents/", { credentials: "include" });
    if (!res.ok) return;
    const all = await res.json();
    ownedParents = all.filter((p) => p.is_owner);

    const select = document.getElementById("collab-parent");
    select.innerHTML = '<option value="">-- Select baby --</option>';
    ownedParents.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      select.appendChild(opt);
    });
  }

  async function loadCollaborators(parentId) {
    const list = document.getElementById("collab-list");
    if (!parentId) {
      list.innerHTML = "";
      return;
    }

    const res = await fetch(`/api/parents/${parentId}/collaborators`, { credentials: "include" });
    if (!res.ok) { list.innerHTML = ""; return; }
    const collabs = await res.json();

    if (collabs.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No collaborators yet.</p>';
      return;
    }

    list.innerHTML = collabs
      .map(
        (c) => `
        <div class="collab-item">
          <div class="info">
            <span class="name">${escapeHtml(c.full_name)}</span>
            <span class="username">@${escapeHtml(c.username)}</span>
          </div>
          <button class="btn-remove" data-uid="${c.user_id}">Remove</button>
        </div>`
      )
      .join("");

    list.querySelectorAll(".btn-remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        await fetch(`/api/parents/${parentId}/collaborators/${uid}`, {
          method: "DELETE",
          credentials: "include",
        });
        loadCollaborators(parentId);
      });
    });
  }

  document.getElementById("collab-parent").addEventListener("change", (e) => {
    loadCollaborators(e.target.value);
  });

  document.getElementById("collab-add-btn").addEventListener("click", async () => {
    const parentId = document.getElementById("collab-parent").value;
    const username = document.getElementById("collab-username").value.trim();
    const msg = document.getElementById("collab-message");

    if (!parentId || !username) {
      msg.textContent = "Select a baby and enter a username.";
      msg.className = "collab-message error";
      return;
    }

    const res = await fetch(`/api/parents/${parentId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username }),
    });

    if (res.ok) {
      msg.textContent = "Collaborator added!";
      msg.className = "collab-message success";
      document.getElementById("collab-username").value = "";
      loadCollaborators(parentId);
    } else {
      const err = await res.json();
      msg.textContent = err.detail || "Failed to add collaborator.";
      msg.className = "collab-message error";
    }

    setTimeout(() => { msg.textContent = ""; }, 3000);
  });

  // ── Feed (comments + reactions) ──────────────
  async function loadFeed() {
    const res = await fetch("/api/analytics/comments", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();

    const reactionsArea = document.getElementById("reactions-area");
    const feed = document.getElementById("feed");

    // ── Reactions (static, above comments) ──
    if (!data.reactions.length) {
      reactionsArea.innerHTML = '<p class="empty-feed">No reactions yet.</p>';
    } else {
      const reactionsByParent = {};
      data.reactions.forEach((r) => {
        if (!reactionsByParent[r.parent_id]) {
          reactionsByParent[r.parent_id] = { reactions: [], parentLabel: "" };
        }
        reactionsByParent[r.parent_id].reactions.push(r);
      });

      for (const pid of Object.keys(reactionsByParent)) {
        const parent = ownedParents.find((p) => p.id == pid);
        reactionsByParent[pid].parentLabel = parent ? parent.label : `Baby #${pid}`;
      }

      let rHtml = "";
      for (const [pid, group] of Object.entries(reactionsByParent)) {
        const counts = {};
        group.reactions.forEach((r) => {
          counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        });

        rHtml += `
          <div class="reaction-group">
            <div class="rg-header">Reactions on <strong>${escapeHtml(group.parentLabel)}</strong></div>
            <div class="reaction-pills">
              ${Object.entries(counts)
                .map(([emoji, count]) => `<span class="reaction-pill"><span class="emoji">${emoji}</span><span class="count">${count}</span></span>`)
                .join("")}
            </div>
          </div>`;
      }
      reactionsArea.innerHTML = rHtml;
    }

    // ── Comments (scrollable) ──
    if (!data.comments.length) {
      feed.innerHTML = '<p class="empty-feed">No comments yet.</p>';
    } else {
      let cHtml = "";
      data.comments.forEach((c) => {
        const avatarHtml = c.profile_picture_url
          ? `<img class="feed-avatar" src="${escapeHtml(c.profile_picture_url)}" alt="" />`
          : `<div class="feed-avatar feed-avatar-default"></div>`;
        cHtml += `
          <div class="feed-item">
            ${avatarHtml}
            <div class="feed-item-body">
              <div class="feed-header">
                <span class="feed-author">${escapeHtml(c.full_name)} <span class="feed-parent">on ${escapeHtml(c.parent_label)}</span></span>
                <span class="feed-time">${formatDateTime(c.created_at)}</span>
              </div>
              <div class="feed-text">${escapeHtml(c.text)}</div>
            </div>
          </div>`;
      });
      feed.innerHTML = cHtml;
    }
  }

  // ── Logout ───────────────────────────────────
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login.html";
  });

  // ── Auto-refresh comments every 30s ─────────
  async function refreshFeedComments() {
    try {
      const res = await fetch("/api/analytics/comments", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();

      const feed = document.getElementById("feed");
      const scrollTop = feed ? feed.scrollTop : 0;

      if (!data.comments.length) {
        feed.innerHTML = '<p class="empty-feed">No comments yet.</p>';
      } else {
        let cHtml = "";
        data.comments.forEach((c) => {
          const avatarHtml = c.profile_picture_url
            ? `<img class="feed-avatar" src="${escapeHtml(c.profile_picture_url)}" alt="" />`
            : `<div class="feed-avatar feed-avatar-default"></div>`;
          cHtml += `
            <div class="feed-item">
              ${avatarHtml}
              <div class="feed-item-body">
                <div class="feed-header">
                  <span class="feed-author">${escapeHtml(c.full_name)} <span class="feed-parent">on ${escapeHtml(c.parent_label)}</span></span>
                  <span class="feed-time">${formatDateTime(c.created_at)}</span>
                </div>
                <div class="feed-text">${escapeHtml(c.text)}</div>
              </div>
            </div>`;
        });
        feed.innerHTML = cHtml;
      }

      if (feed) feed.scrollTop = scrollTop;

      // Also refresh reactions area
      const reactionsArea = document.getElementById("reactions-area");
      if (!data.reactions.length) {
        reactionsArea.innerHTML = '<p class="empty-feed">No reactions yet.</p>';
      } else {
        const reactionsByParent = {};
        data.reactions.forEach((r) => {
          if (!reactionsByParent[r.parent_id]) {
            reactionsByParent[r.parent_id] = { reactions: [], parentLabel: "" };
          }
          reactionsByParent[r.parent_id].reactions.push(r);
        });

        for (const pid of Object.keys(reactionsByParent)) {
          const parent = ownedParents.find((p) => p.id == pid);
          reactionsByParent[pid].parentLabel = parent ? parent.label : `Baby #${pid}`;
        }

        let rHtml = "";
        for (const [pid, group] of Object.entries(reactionsByParent)) {
          const counts = {};
          group.reactions.forEach((r) => {
            counts[r.emoji] = (counts[r.emoji] || 0) + 1;
          });
          rHtml += `
            <div class="reaction-group">
              <div class="rg-header">Reactions on <strong>${escapeHtml(group.parentLabel)}</strong></div>
              <div class="reaction-pills">
                ${Object.entries(counts)
                  .map(([emoji, count]) => `<span class="reaction-pill"><span class="emoji">${emoji}</span><span class="count">${count}</span></span>`)
                  .join("")}
              </div>
            </div>`;
        }
        reactionsArea.innerHTML = rHtml;
      }
    } catch { /* silent fail */ }
  }

  // ── Init ─────────────────────────────────────
  async function init() {
    currentUser = await checkAuth();
    if (!currentUser) return;

    await loadOwnedParents();
    await loadSummary();
    await loadFeed();

    // Auto-refresh every 30 seconds
    setInterval(refreshFeedComments, 30000);
  }

  init();
})();
