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

  // ── Real-time username/email checks ──────
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const emailInput = document.getElementById("email");
  const emailHint = document.getElementById("email-hint");

  if (usernameInput && usernameHint) {
    usernameInput.addEventListener("input", debounce(async function () {
      const val = this.value.trim();
      if (val.length < 3) {
        usernameHint.textContent = "";
        usernameHint.className = "field-hint";
        return;
      }
      usernameHint.textContent = "Checking...";
      usernameHint.className = "field-hint checking";
      try {
        const res = await fetch(`${API}/check-username/${encodeURIComponent(val)}`);
        const data = await res.json();
        if (data.taken) {
          usernameHint.textContent = "Username is already taken";
          usernameHint.className = "field-hint taken";
        } else {
          usernameHint.textContent = "Username is available";
          usernameHint.className = "field-hint available";
        }
      } catch {
        usernameHint.textContent = "";
        usernameHint.className = "field-hint";
      }
    }, 400));
  }

  if (emailInput && emailHint) {
    emailInput.addEventListener("input", debounce(async function () {
      const val = this.value.trim();
      if (!val || !val.includes("@")) {
        emailHint.textContent = "";
        emailHint.className = "field-hint";
        return;
      }
      emailHint.textContent = "Checking...";
      emailHint.className = "field-hint checking";
      try {
        const res = await fetch(`${API}/check-email/${encodeURIComponent(val)}`);
        const data = await res.json();
        if (data.taken) {
          emailHint.textContent = "An account with this email already exists";
          emailHint.className = "field-hint taken";
        } else {
          emailHint.textContent = "";
          emailHint.className = "field-hint";
        }
      } catch {
        emailHint.textContent = "";
        emailHint.className = "field-hint";
      }
    }, 400));
  }

  // ── Password strength ────────────────────
  function checkPasswordRules(pw) {
    return {
      length: pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      lower: /[a-z]/.test(pw),
      digit: /\d/.test(pw),
    };
  }

  const pwInput = document.getElementById("password");
  if (pwInput) {
    pwInput.addEventListener("input", function () {
      const pw = this.value;
      const rules = checkPasswordRules(pw);
      const passed = Object.values(rules).filter(Boolean).length;

      // Update rule indicators
      document.getElementById("rule-length").className = pw.length === 0 ? "" : rules.length ? "pass" : "fail";
      document.getElementById("rule-upper").className = pw.length === 0 ? "" : rules.upper ? "pass" : "fail";
      document.getElementById("rule-lower").className = pw.length === 0 ? "" : rules.lower ? "pass" : "fail";
      document.getElementById("rule-digit").className = pw.length === 0 ? "" : rules.digit ? "pass" : "fail";

      // Update strength bar
      const fill = document.getElementById("strength-fill");
      const label = document.getElementById("strength-label");

      if (pw.length === 0) {
        fill.style.width = "0";
        label.textContent = "";
        return;
      }

      // Score: 4 rules + bonus for length
      let score = passed;
      if (pw.length >= 12) score += 1;
      if (/[^A-Za-z0-9]/.test(pw)) score += 1;

      if (score <= 2) {
        fill.style.width = "25%";
        fill.style.backgroundColor = "#ef4444";
        label.textContent = "Weak";
        label.style.color = "#ef4444";
      } else if (score <= 4) {
        fill.style.width = "55%";
        fill.style.backgroundColor = "#f59e0b";
        label.textContent = "Fair";
        label.style.color = "#f59e0b";
      } else if (score <= 5) {
        fill.style.width = "80%";
        fill.style.backgroundColor = "#22c55e";
        label.textContent = "Strong";
        label.style.color = "#22c55e";
      } else {
        fill.style.width = "100%";
        fill.style.backgroundColor = "#16a34a";
        label.textContent = "Very strong";
        label.style.color = "#16a34a";
      }
    });
  }

  // ── Register ──────────────────────────────
  const regForm = document.getElementById("register-form");
  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(regForm));

      const rules = checkPasswordRules(data.password);
      if (!rules.length || !rules.upper || !rules.lower || !rules.digit) {
        return showError(regForm, "Password must be at least 8 characters with uppercase, lowercase, and a digit");
      }
      if (data.password !== data.confirm_password) {
        return showError(regForm, "Passwords do not match");
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
