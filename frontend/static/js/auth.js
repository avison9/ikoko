// Auth forms: register + login
(function () {
  const API = "/api/auth";

  function showError(formEl, msg) {
    let alert = formEl.querySelector(".alert");
    if (!alert) {
      alert = document.createElement("div");
      alert.className = "alert alert-error";
      formEl.prepend(alert);
    }
    alert.textContent = msg;
    alert.style.display = "block";
  }

  // ── Register ──────────────────────────────
  const regForm = document.getElementById("register-form");
  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(regForm));

      if (data.password !== data.confirm_password) {
        return showError(regForm, "Passwords do not match");
      }
      if (data.password.length < 6) {
        return showError(regForm, "Password must be at least 6 characters");
      }

      try {
        const res = await fetch(`${API}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: data.full_name,
            email: data.email,
            country: data.country,
            username: data.username,
            password: data.password,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          return showError(regForm, err.detail || "Registration failed");
        }

        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = "/login.html" + (next ? "?next=" + encodeURIComponent(next) : "");
      } catch {
        showError(regForm, "Network error. Please try again.");
      }
    });
  }

  // ── Login ─────────────────────────────────
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(loginForm));

      try {
        const res = await fetch(`${API}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            username: data.username,
            password: data.password,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          return showError(loginForm, err.detail || "Login failed");
        }

        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = (next && next.startsWith("/")) ? next : "/dashboard.html";
      } catch {
        showError(loginForm, "Network error. Please try again.");
      }
    });
  }
})();
