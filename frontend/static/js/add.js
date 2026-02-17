// Add page: create parent, add children, upload audio
(function () {
  const parentForm = document.getElementById("parent-form");
  const childForm = document.getElementById("child-form");
  const childSection = document.getElementById("child-section");
  const childrenList = document.getElementById("children-list");
  const parentSelect = document.getElementById("parent-select");
  const parentLabelInput = document.getElementById("parent-label");

  let currentParentId = null;

  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error();
    } catch {
      window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
    }
  }

  // Check if we have a parent_id in URL
  function getParentIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("parent_id");
  }

  async function loadParents() {
    const res = await fetch("/api/parents/", { credentials: "include" });
    if (!res.ok) return [];
    return await res.json();
  }

  async function populateParentSelect() {
    const parents = await loadParents();
    parentSelect.innerHTML = '<option value="">-- Select existing baby --</option>';
    parents.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      parentSelect.appendChild(opt);
    });

    // If parent_id in URL, pre-select
    const urlParentId = getParentIdFromURL();
    if (urlParentId) {
      parentSelect.value = urlParentId;
      selectParent(parseInt(urlParentId));
    }
  }

  function selectParent(id) {
    currentParentId = id;
    childSection.style.display = "block";
    // Update the View Flashcards link
    const viewLink = document.getElementById("view-link");
    if (viewLink) viewLink.href = `/view.html?id=${id}`;
    loadChildren();
  }

  // ── Create parent ─────────────────────────
  parentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = parentLabelInput.value.trim();
    if (!label) return;

    const res = await fetch("/api/parents/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ label }),
    });

    if (!res.ok) {
      alert("Failed to create baby");
      return;
    }

    const parent = await res.json();
    parentLabelInput.value = "";
    await populateParentSelect();
    parentSelect.value = parent.id;
    selectParent(parent.id);
  });

  // ── Select existing parent ────────────────
  parentSelect.addEventListener("change", () => {
    const val = parentSelect.value;
    if (val) {
      selectParent(parseInt(val));
    } else {
      currentParentId = null;
      childSection.style.display = "none";
    }
  });

  // ── Load children ─────────────────────────
  async function loadChildren() {
    if (!currentParentId) return;

    const res = await fetch(`/api/parents/${currentParentId}`, { credentials: "include" });
    if (!res.ok) return;

    const data = await res.json();
    renderChildren(data.children || []);
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function renderChildren(children) {
    if (!children.length) {
      childrenList.innerHTML = "<li>No names added yet.</li>";
      return;
    }

    childrenList.innerHTML = children
      .map(
        (c) => `
      <li>
        <div class="child-info">
          <div class="child-name">${escapeHtml(c.name)}</div>
          <div class="child-meaning">${escapeHtml(c.meaning)}${c.phonetic ? " &middot; " + escapeHtml(c.phonetic) : ""}</div>
          ${c.audio_url ? '<div class="audio-status">&#9835; Audio attached</div>' : ""}
        </div>
        <div class="child-actions">
          <label class="btn-upload-audio" style="cursor:pointer;">
            <button type="button" data-child-id="${c.id}" class="btn-audio-trigger">Audio</button>
            <input type="file" accept=".mp3,.m4a,.wav,.ogg" data-child-id="${c.id}" class="audio-file-input" style="display:none;" />
          </label>
          <button class="btn-delete-child" data-child-id="${c.id}">Delete</button>
        </div>
      </li>
    `
      )
      .join("");

    // Audio upload triggers
    childrenList.querySelectorAll(".btn-audio-trigger").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = btn.parentElement.querySelector(".audio-file-input");
        input.click();
      });
    });

    childrenList.querySelectorAll(".audio-file-input").forEach((input) => {
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;

        const childId = input.dataset.childId;
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(
          `/api/parents/${currentParentId}/children/${childId}/audio`,
          { method: "POST", credentials: "include", body: formData }
        );

        if (res.ok) {
          loadChildren();
        } else {
          const err = await res.json();
          alert(err.detail || "Failed to upload audio");
        }
      });
    });

    // Delete child
    childrenList.querySelectorAll(".btn-delete-child").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this name entry?")) return;
        await fetch(
          `/api/parents/${currentParentId}/children/${btn.dataset.childId}`,
          { method: "DELETE", credentials: "include" }
        );
        loadChildren();
      });
    });
  }

  // ── Create child ──────────────────────────
  childForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(childForm));

    const res = await fetch(`/api/parents/${currentParentId}/children/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: data.name,
        phonetic: data.phonetic || null,
        meaning: data.meaning,
        passage: data.passage || null,
        sort_order: parseInt(data.sort_order) || 0,
      }),
    });

    if (!res.ok) {
      alert("Failed to add name");
      return;
    }

    childForm.reset();
    loadChildren();
  });

  // Logout
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login.html";
  });

  // Init
  async function init() {
    await checkAuth();
    await populateParentSelect();
  }

  init();
})();
