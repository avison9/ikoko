// Profile page
(function () {
  const API = "/api/profile";

  let currentUsername = "";
  let currentEmail = "";

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── Elements ──────────────────────────────
  const avatarWrapper = document.getElementById("avatar-wrapper");
  const avatarImg = document.getElementById("avatar-img");
  const avatarInput = document.getElementById("avatar-input");
  const removeAvatarBtn = document.getElementById("remove-avatar-btn");
  const avatarMessage = document.getElementById("avatar-message");
  const profileForm = document.getElementById("profile-form");
  const profileMessage = document.getElementById("profile-message");
  const passwordForm = document.getElementById("password-form");
  const passwordMessage = document.getElementById("password-message");
  const memberSince = document.getElementById("member-since");

  // ── Auth check + load profile ─────────────
  async function checkAuth() {
    try {
      const res = await fetch(API, { credentials: "include" });
      if (!res.ok) {
        window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname);
        return;
      }
      const user = await res.json();
      populateProfile(user);
    } catch {
      window.location.href = "/login.html";
    }
  }

  function populateProfile(user) {
    // Avatar
    if (user.profile_picture_url) {
      avatarImg.src = user.profile_picture_url;
      avatarWrapper.classList.remove("no-picture");
      removeAvatarBtn.style.display = "";
    } else {
      avatarImg.src = "";
      avatarWrapper.classList.add("no-picture");
      removeAvatarBtn.style.display = "none";
    }

    // Form fields
    currentUsername = user.username || "";
    currentEmail = user.email || "";
    document.getElementById("profile-fullname").value = user.full_name || "";
    document.getElementById("profile-username").value = currentUsername;
    document.getElementById("profile-email").value = currentEmail;

    // Country
    const countryHidden = document.getElementById("country");
    const countrySearch = document.getElementById("country-search");
    countryHidden.value = user.country || "";
    // Find country in list and display it
    const match = COUNTRIES.find(c => c.name === user.country);
    if (match) {
      countrySearch.value = match.name;
      countrySearch.classList.add("has-value");
      setSelectedFlag(match.flag);
    } else {
      countrySearch.value = user.country || "";
    }

    // Member since
    if (user.created_at) {
      const d = new Date(user.created_at);
      memberSince.textContent = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }
  }

  function showMessage(el, text, type) {
    el.textContent = text;
    el.className = "field-message " + type;
    if (type === "success") {
      setTimeout(() => { el.textContent = ""; el.className = "field-message"; }, 3000);
    }
  }

  // ── Avatar upload ─────────────────────────
  avatarWrapper.addEventListener("click", () => avatarInput.click());

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;

    // Preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarImg.src = e.target.result;
      avatarWrapper.classList.remove("no-picture");
    };
    reader.readAsDataURL(file);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API}/picture`, {
        method: "POST",
        credentials: "include",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json();
        showMessage(avatarMessage, err.detail || "Upload failed", "error");
        return;
      }

      const user = await res.json();
      avatarImg.src = user.profile_picture_url;
      avatarWrapper.classList.remove("no-picture");
      removeAvatarBtn.style.display = "";
      showMessage(avatarMessage, "Picture updated", "success");
    } catch {
      showMessage(avatarMessage, "Network error", "error");
    }

    avatarInput.value = "";
  });

  // ── Remove avatar ─────────────────────────
  removeAvatarBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API}/picture`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        showMessage(avatarMessage, "Failed to remove picture", "error");
        return;
      }

      avatarImg.src = "";
      avatarWrapper.classList.add("no-picture");
      removeAvatarBtn.style.display = "none";
      showMessage(avatarMessage, "Picture removed", "success");
    } catch {
      showMessage(avatarMessage, "Network error", "error");
    }
  });

  // ── Profile form submit ───────────────────
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      full_name: document.getElementById("profile-fullname").value.trim(),
      username: document.getElementById("profile-username").value.trim(),
      email: document.getElementById("profile-email").value.trim(),
      country: document.getElementById("country").value.trim(),
    };

    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        showMessage(profileMessage, err.detail || "Update failed", "error");
        return;
      }

      const user = await res.json();
      populateProfile(user);
      showMessage(profileMessage, "Profile updated", "success");
    } catch {
      showMessage(profileMessage, "Network error", "error");
    }
  });

  // ── Real-time username/email checks ──────
  const profileUsernameInput = document.getElementById("profile-username");
  const profileUsernameHint = document.getElementById("profile-username-hint");
  const profileEmailInput = document.getElementById("profile-email");
  const profileEmailHint = document.getElementById("profile-email-hint");

  if (profileUsernameInput && profileUsernameHint) {
    profileUsernameInput.addEventListener("input", debounce(async function () {
      const val = this.value.trim();
      if (val.length < 3) {
        profileUsernameHint.textContent = "";
        profileUsernameHint.className = "field-hint";
        return;
      }
      if (val === currentUsername) {
        profileUsernameHint.textContent = "";
        profileUsernameHint.className = "field-hint";
        return;
      }
      profileUsernameHint.textContent = "Checking...";
      profileUsernameHint.className = "field-hint checking";
      try {
        const res = await fetch(`/api/auth/check-username/${encodeURIComponent(val)}`);
        const data = await res.json();
        if (data.taken) {
          profileUsernameHint.textContent = "Username is already taken";
          profileUsernameHint.className = "field-hint taken";
        } else {
          profileUsernameHint.textContent = "Username is available";
          profileUsernameHint.className = "field-hint available";
        }
      } catch {
        profileUsernameHint.textContent = "";
        profileUsernameHint.className = "field-hint";
      }
    }, 400));
  }

  if (profileEmailInput && profileEmailHint) {
    profileEmailInput.addEventListener("input", debounce(async function () {
      const val = this.value.trim();
      if (!val || !val.includes("@")) {
        profileEmailHint.textContent = "";
        profileEmailHint.className = "field-hint";
        return;
      }
      if (val === currentEmail) {
        profileEmailHint.textContent = "";
        profileEmailHint.className = "field-hint";
        return;
      }
      profileEmailHint.textContent = "Checking...";
      profileEmailHint.className = "field-hint checking";
      try {
        const res = await fetch(`/api/auth/check-email/${encodeURIComponent(val)}`);
        const data = await res.json();
        if (data.taken) {
          profileEmailHint.textContent = "An account with this email already exists";
          profileEmailHint.className = "field-hint taken";
        } else {
          profileEmailHint.textContent = "";
          profileEmailHint.className = "field-hint";
        }
      } catch {
        profileEmailHint.textContent = "";
        profileEmailHint.className = "field-hint";
      }
    }, 400));
  }

  // ── Password strength (profile) ──────────
  function checkPasswordRules(pw) {
    return {
      length: pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      lower: /[a-z]/.test(pw),
      digit: /\d/.test(pw),
    };
  }

  const newPwInput = document.getElementById("new-password");
  if (newPwInput) {
    newPwInput.addEventListener("input", function () {
      const pw = this.value;
      const rules = checkPasswordRules(pw);
      const passed = Object.values(rules).filter(Boolean).length;

      document.getElementById("rule-length").className = pw.length === 0 ? "" : rules.length ? "pass" : "fail";
      document.getElementById("rule-upper").className = pw.length === 0 ? "" : rules.upper ? "pass" : "fail";
      document.getElementById("rule-lower").className = pw.length === 0 ? "" : rules.lower ? "pass" : "fail";
      document.getElementById("rule-digit").className = pw.length === 0 ? "" : rules.digit ? "pass" : "fail";

      const fill = document.getElementById("strength-fill");
      const label = document.getElementById("strength-label");

      if (pw.length === 0) {
        fill.style.width = "0";
        label.textContent = "";
        return;
      }

      let score = passed;
      if (pw.length >= 12) score += 1;
      if (/[^A-Za-z0-9]/.test(pw)) score += 1;

      if (score <= 2) {
        fill.style.width = "25%"; fill.style.backgroundColor = "#ef4444";
        label.textContent = "Weak"; label.style.color = "#ef4444";
      } else if (score <= 4) {
        fill.style.width = "55%"; fill.style.backgroundColor = "#f59e0b";
        label.textContent = "Fair"; label.style.color = "#f59e0b";
      } else if (score <= 5) {
        fill.style.width = "80%"; fill.style.backgroundColor = "#22c55e";
        label.textContent = "Strong"; label.style.color = "#22c55e";
      } else {
        fill.style.width = "100%"; fill.style.backgroundColor = "#16a34a";
        label.textContent = "Very strong"; label.style.color = "#16a34a";
      }
    });
  }

  // ── Password form submit ──────────────────
  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById("current-password").value;
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    const rules = checkPasswordRules(newPassword);
    if (!rules.length || !rules.upper || !rules.lower || !rules.digit) {
      showMessage(passwordMessage, "Password must be at least 8 characters with uppercase, lowercase, and a digit", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage(passwordMessage, "New passwords do not match", "error");
      return;
    }

    try {
      const res = await fetch(`${API}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      if (!res.ok) {
        const err = await res.json();
        showMessage(passwordMessage, err.detail || "Password change failed", "error");
        return;
      }

      passwordForm.reset();
      showMessage(passwordMessage, "Password changed successfully", "success");
    } catch {
      showMessage(passwordMessage, "Network error", "error");
    }
  });

  // ── Country picker ────────────────────────
  const COUNTRIES = [
    { name: "Afghanistan", flag: "\ud83c\udde6\ud83c\uddeb" },
    { name: "Albania", flag: "\ud83c\udde6\ud83c\uddf1" },
    { name: "Algeria", flag: "\ud83c\udde9\ud83c\uddff" },
    { name: "Andorra", flag: "\ud83c\udde6\ud83c\udde9" },
    { name: "Angola", flag: "\ud83c\udde6\ud83c\uddf4" },
    { name: "Argentina", flag: "\ud83c\udde6\ud83c\uddf7" },
    { name: "Armenia", flag: "\ud83c\udde6\ud83c\uddf2" },
    { name: "Australia", flag: "\ud83c\udde6\ud83c\uddfa" },
    { name: "Austria", flag: "\ud83c\udde6\ud83c\uddf9" },
    { name: "Azerbaijan", flag: "\ud83c\udde6\ud83c\uddff" },
    { name: "Bahamas", flag: "\ud83c\udde7\ud83c\uddf8" },
    { name: "Bahrain", flag: "\ud83c\udde7\ud83c\udded" },
    { name: "Bangladesh", flag: "\ud83c\udde7\ud83c\udde9" },
    { name: "Barbados", flag: "\ud83c\udde7\ud83c\udde7" },
    { name: "Belarus", flag: "\ud83c\udde7\ud83c\uddfe" },
    { name: "Belgium", flag: "\ud83c\udde7\ud83c\uddea" },
    { name: "Belize", flag: "\ud83c\udde7\ud83c\uddff" },
    { name: "Benin", flag: "\ud83c\udde7\ud83c\uddef" },
    { name: "Bhutan", flag: "\ud83c\udde7\ud83c\uddf9" },
    { name: "Bolivia", flag: "\ud83c\udde7\ud83c\uddf4" },
    { name: "Bosnia and Herzegovina", flag: "\ud83c\udde7\ud83c\udde6" },
    { name: "Botswana", flag: "\ud83c\udde7\ud83c\uddfc" },
    { name: "Brazil", flag: "\ud83c\udde7\ud83c\uddf7" },
    { name: "Brunei", flag: "\ud83c\udde7\ud83c\uddf3" },
    { name: "Bulgaria", flag: "\ud83c\udde7\ud83c\uddec" },
    { name: "Burkina Faso", flag: "\ud83c\udde7\ud83c\uddeb" },
    { name: "Burundi", flag: "\ud83c\udde7\ud83c\uddee" },
    { name: "Cambodia", flag: "\ud83c\uddf0\ud83c\udded" },
    { name: "Cameroon", flag: "\ud83c\udde8\ud83c\uddf2" },
    { name: "Canada", flag: "\ud83c\udde8\ud83c\udde6" },
    { name: "Central African Republic", flag: "\ud83c\udde8\ud83c\uddeb" },
    { name: "Chad", flag: "\ud83c\uddf9\ud83c\udde9" },
    { name: "Chile", flag: "\ud83c\udde8\ud83c\uddf1" },
    { name: "China", flag: "\ud83c\udde8\ud83c\uddf3" },
    { name: "Colombia", flag: "\ud83c\udde8\ud83c\uddf4" },
    { name: "Comoros", flag: "\ud83c\uddf0\ud83c\uddf2" },
    { name: "Congo", flag: "\ud83c\udde8\ud83c\uddec" },
    { name: "Costa Rica", flag: "\ud83c\udde8\ud83c\uddf7" },
    { name: "Croatia", flag: "\ud83c\udded\ud83c\uddf7" },
    { name: "Cuba", flag: "\ud83c\udde8\ud83c\uddfa" },
    { name: "Cyprus", flag: "\ud83c\udde8\ud83c\uddfe" },
    { name: "Czech Republic", flag: "\ud83c\udde8\ud83c\uddff" },
    { name: "Denmark", flag: "\ud83c\udde9\ud83c\uddf0" },
    { name: "Djibouti", flag: "\ud83c\udde9\ud83c\uddef" },
    { name: "Dominican Republic", flag: "\ud83c\udde9\ud83c\uddf4" },
    { name: "DR Congo", flag: "\ud83c\udde8\ud83c\udde9" },
    { name: "Ecuador", flag: "\ud83c\uddea\ud83c\udde8" },
    { name: "Egypt", flag: "\ud83c\uddea\ud83c\uddec" },
    { name: "El Salvador", flag: "\ud83c\uddf8\ud83c\uddfb" },
    { name: "Equatorial Guinea", flag: "\ud83c\uddec\ud83c\uddf6" },
    { name: "Eritrea", flag: "\ud83c\uddea\ud83c\uddf7" },
    { name: "Estonia", flag: "\ud83c\uddea\ud83c\uddea" },
    { name: "Eswatini", flag: "\ud83c\uddf8\ud83c\uddff" },
    { name: "Ethiopia", flag: "\ud83c\uddea\ud83c\uddf9" },
    { name: "Fiji", flag: "\ud83c\uddeb\ud83c\uddef" },
    { name: "Finland", flag: "\ud83c\uddeb\ud83c\uddee" },
    { name: "France", flag: "\ud83c\uddeb\ud83c\uddf7" },
    { name: "Gabon", flag: "\ud83c\uddec\ud83c\udde6" },
    { name: "Gambia", flag: "\ud83c\uddec\ud83c\uddf2" },
    { name: "Georgia", flag: "\ud83c\uddec\ud83c\uddea" },
    { name: "Germany", flag: "\ud83c\udde9\ud83c\uddea" },
    { name: "Ghana", flag: "\ud83c\uddec\ud83c\udded" },
    { name: "Greece", flag: "\ud83c\uddec\ud83c\uddf7" },
    { name: "Guatemala", flag: "\ud83c\uddec\ud83c\uddf9" },
    { name: "Guinea", flag: "\ud83c\uddec\ud83c\uddf3" },
    { name: "Guyana", flag: "\ud83c\uddec\ud83c\uddfe" },
    { name: "Haiti", flag: "\ud83c\udded\ud83c\uddf9" },
    { name: "Honduras", flag: "\ud83c\udded\ud83c\uddf3" },
    { name: "Hungary", flag: "\ud83c\udded\ud83c\uddfa" },
    { name: "Iceland", flag: "\ud83c\uddee\ud83c\uddf8" },
    { name: "India", flag: "\ud83c\uddee\ud83c\uddf3" },
    { name: "Indonesia", flag: "\ud83c\uddee\ud83c\udde9" },
    { name: "Iran", flag: "\ud83c\uddee\ud83c\uddf7" },
    { name: "Iraq", flag: "\ud83c\uddee\ud83c\uddf6" },
    { name: "Ireland", flag: "\ud83c\uddee\ud83c\uddea" },
    { name: "Israel", flag: "\ud83c\uddee\ud83c\uddf1" },
    { name: "Italy", flag: "\ud83c\uddee\ud83c\uddf9" },
    { name: "Ivory Coast", flag: "\ud83c\udde8\ud83c\uddee" },
    { name: "Jamaica", flag: "\ud83c\uddef\ud83c\uddf2" },
    { name: "Japan", flag: "\ud83c\uddef\ud83c\uddf5" },
    { name: "Jordan", flag: "\ud83c\uddef\ud83c\uddf4" },
    { name: "Kazakhstan", flag: "\ud83c\uddf0\ud83c\uddff" },
    { name: "Kenya", flag: "\ud83c\uddf0\ud83c\uddea" },
    { name: "Kuwait", flag: "\ud83c\uddf0\ud83c\uddfc" },
    { name: "Kyrgyzstan", flag: "\ud83c\uddf0\ud83c\uddec" },
    { name: "Laos", flag: "\ud83c\uddf1\ud83c\udde6" },
    { name: "Latvia", flag: "\ud83c\uddf1\ud83c\uddfb" },
    { name: "Lebanon", flag: "\ud83c\uddf1\ud83c\udde7" },
    { name: "Lesotho", flag: "\ud83c\uddf1\ud83c\uddf8" },
    { name: "Liberia", flag: "\ud83c\uddf1\ud83c\uddf7" },
    { name: "Libya", flag: "\ud83c\uddf1\ud83c\uddfe" },
    { name: "Lithuania", flag: "\ud83c\uddf1\ud83c\uddf9" },
    { name: "Luxembourg", flag: "\ud83c\uddf1\ud83c\uddfa" },
    { name: "Madagascar", flag: "\ud83c\uddf2\ud83c\uddec" },
    { name: "Malawi", flag: "\ud83c\uddf2\ud83c\uddfc" },
    { name: "Malaysia", flag: "\ud83c\uddf2\ud83c\uddfe" },
    { name: "Maldives", flag: "\ud83c\uddf2\ud83c\uddfb" },
    { name: "Mali", flag: "\ud83c\uddf2\ud83c\uddf1" },
    { name: "Malta", flag: "\ud83c\uddf2\ud83c\uddf9" },
    { name: "Mauritania", flag: "\ud83c\uddf2\ud83c\uddf7" },
    { name: "Mauritius", flag: "\ud83c\uddf2\ud83c\uddfa" },
    { name: "Mexico", flag: "\ud83c\uddf2\ud83c\uddfd" },
    { name: "Moldova", flag: "\ud83c\uddf2\ud83c\udde9" },
    { name: "Monaco", flag: "\ud83c\uddf2\ud83c\udde8" },
    { name: "Mongolia", flag: "\ud83c\uddf2\ud83c\uddf3" },
    { name: "Montenegro", flag: "\ud83c\uddf2\ud83c\uddea" },
    { name: "Morocco", flag: "\ud83c\uddf2\ud83c\udde6" },
    { name: "Mozambique", flag: "\ud83c\uddf2\ud83c\uddff" },
    { name: "Myanmar", flag: "\ud83c\uddf2\ud83c\uddf2" },
    { name: "Namibia", flag: "\ud83c\uddf3\ud83c\udde6" },
    { name: "Nepal", flag: "\ud83c\uddf3\ud83c\uddf5" },
    { name: "Netherlands", flag: "\ud83c\uddf3\ud83c\uddf1" },
    { name: "New Zealand", flag: "\ud83c\uddf3\ud83c\uddff" },
    { name: "Nicaragua", flag: "\ud83c\uddf3\ud83c\uddee" },
    { name: "Niger", flag: "\ud83c\uddf3\ud83c\uddea" },
    { name: "Nigeria", flag: "\ud83c\uddf3\ud83c\uddec" },
    { name: "North Korea", flag: "\ud83c\uddf0\ud83c\uddf5" },
    { name: "North Macedonia", flag: "\ud83c\uddf2\ud83c\uddf0" },
    { name: "Norway", flag: "\ud83c\uddf3\ud83c\uddf4" },
    { name: "Oman", flag: "\ud83c\uddf4\ud83c\uddf2" },
    { name: "Pakistan", flag: "\ud83c\uddf5\ud83c\uddf0" },
    { name: "Palestine", flag: "\ud83c\uddf5\ud83c\uddf8" },
    { name: "Panama", flag: "\ud83c\uddf5\ud83c\udde6" },
    { name: "Papua New Guinea", flag: "\ud83c\uddf5\ud83c\uddec" },
    { name: "Paraguay", flag: "\ud83c\uddf5\ud83c\uddfe" },
    { name: "Peru", flag: "\ud83c\uddf5\ud83c\uddea" },
    { name: "Philippines", flag: "\ud83c\uddf5\ud83c\udded" },
    { name: "Poland", flag: "\ud83c\uddf5\ud83c\uddf1" },
    { name: "Portugal", flag: "\ud83c\uddf5\ud83c\uddf9" },
    { name: "Qatar", flag: "\ud83c\uddf6\ud83c\udde6" },
    { name: "Romania", flag: "\ud83c\uddf7\ud83c\uddf4" },
    { name: "Russia", flag: "\ud83c\uddf7\ud83c\uddfa" },
    { name: "Rwanda", flag: "\ud83c\uddf7\ud83c\uddfc" },
    { name: "Saudi Arabia", flag: "\ud83c\uddf8\ud83c\udde6" },
    { name: "Senegal", flag: "\ud83c\uddf8\ud83c\uddf3" },
    { name: "Serbia", flag: "\ud83c\uddf7\ud83c\uddf8" },
    { name: "Sierra Leone", flag: "\ud83c\uddf8\ud83c\uddf1" },
    { name: "Singapore", flag: "\ud83c\uddf8\ud83c\uddec" },
    { name: "Slovakia", flag: "\ud83c\uddf8\ud83c\uddf0" },
    { name: "Slovenia", flag: "\ud83c\uddf8\ud83c\uddee" },
    { name: "Somalia", flag: "\ud83c\uddf8\ud83c\uddf4" },
    { name: "South Africa", flag: "\ud83c\uddff\ud83c\udde6" },
    { name: "South Korea", flag: "\ud83c\uddf0\ud83c\uddf7" },
    { name: "South Sudan", flag: "\ud83c\uddf8\ud83c\uddf8" },
    { name: "Spain", flag: "\ud83c\uddea\ud83c\uddf8" },
    { name: "Sri Lanka", flag: "\ud83c\uddf1\ud83c\uddf0" },
    { name: "Sudan", flag: "\ud83c\uddf8\ud83c\udde9" },
    { name: "Suriname", flag: "\ud83c\uddf8\ud83c\uddf7" },
    { name: "Sweden", flag: "\ud83c\uddf8\ud83c\uddea" },
    { name: "Switzerland", flag: "\ud83c\udde8\ud83c\udded" },
    { name: "Syria", flag: "\ud83c\uddf8\ud83c\uddfe" },
    { name: "Taiwan", flag: "\ud83c\uddf9\ud83c\uddfc" },
    { name: "Tajikistan", flag: "\ud83c\uddf9\ud83c\uddef" },
    { name: "Tanzania", flag: "\ud83c\uddf9\ud83c\uddff" },
    { name: "Thailand", flag: "\ud83c\uddf9\ud83c\udded" },
    { name: "Togo", flag: "\ud83c\uddf9\ud83c\uddec" },
    { name: "Trinidad and Tobago", flag: "\ud83c\uddf9\ud83c\uddf9" },
    { name: "Tunisia", flag: "\ud83c\uddf9\ud83c\uddf3" },
    { name: "Turkey", flag: "\ud83c\uddf9\ud83c\uddf7" },
    { name: "Turkmenistan", flag: "\ud83c\uddf9\ud83c\uddf2" },
    { name: "Uganda", flag: "\ud83c\uddfa\ud83c\uddec" },
    { name: "Ukraine", flag: "\ud83c\uddfa\ud83c\udde6" },
    { name: "United Arab Emirates", flag: "\ud83c\udde6\ud83c\uddea" },
    { name: "United Kingdom", flag: "\ud83c\uddec\ud83c\udde7" },
    { name: "United States", flag: "\ud83c\uddfa\ud83c\uddf8" },
    { name: "Uruguay", flag: "\ud83c\uddfa\ud83c\uddfe" },
    { name: "Uzbekistan", flag: "\ud83c\uddfa\ud83c\uddff" },
    { name: "Venezuela", flag: "\ud83c\uddfb\ud83c\uddea" },
    { name: "Vietnam", flag: "\ud83c\uddfb\ud83c\uddf3" },
    { name: "Yemen", flag: "\ud83c\uddfe\ud83c\uddea" },
    { name: "Zambia", flag: "\ud83c\uddff\ud83c\uddf2" },
    { name: "Zimbabwe", flag: "\ud83c\uddff\ud83c\uddfc" },
  ];

  const countrySearch = document.getElementById("country-search");
  const countryHidden = document.getElementById("country");
  const countryDropdown = document.getElementById("country-dropdown");
  let highlightedIndex = -1;

  function setSelectedFlag(flag) {
    let flagEl = document.querySelector("#country-picker .selected-flag");
    if (!flagEl) {
      flagEl = document.createElement("span");
      flagEl.className = "selected-flag";
      document.getElementById("country-picker").appendChild(flagEl);
    }
    flagEl.textContent = flag;
  }

  function removeSelectedFlag() {
    const flagEl = document.querySelector("#country-picker .selected-flag");
    if (flagEl) flagEl.remove();
  }

  function renderDropdown(filter) {
    const filtered = filter
      ? COUNTRIES.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
      : COUNTRIES;

    countryDropdown.innerHTML = "";
    highlightedIndex = -1;

    if (filtered.length === 0) {
      countryDropdown.innerHTML = '<div class="no-results">No countries found</div>';
      countryDropdown.classList.add("open");
      return;
    }

    filtered.forEach((c, i) => {
      const div = document.createElement("div");
      div.className = "country-option";
      div.innerHTML = `<span class="flag">${c.flag}</span> ${c.name}`;
      div.addEventListener("click", () => selectCountry(c));
      countryDropdown.appendChild(div);
    });

    countryDropdown.classList.add("open");
  }

  function selectCountry(c) {
    countryHidden.value = c.name;
    countrySearch.value = c.name;
    countrySearch.classList.add("has-value");
    setSelectedFlag(c.flag);
    countryDropdown.classList.remove("open");
  }

  countrySearch.addEventListener("focus", () => renderDropdown(countrySearch.value));
  countrySearch.addEventListener("input", () => {
    countryHidden.value = "";
    countrySearch.classList.remove("has-value");
    removeSelectedFlag();
    renderDropdown(countrySearch.value);
  });

  countrySearch.addEventListener("keydown", (e) => {
    const options = countryDropdown.querySelectorAll(".country-option");
    if (!options.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      options[highlightedIndex].click();
      return;
    } else if (e.key === "Escape") {
      countryDropdown.classList.remove("open");
      return;
    } else {
      return;
    }

    options.forEach((o, i) => o.classList.toggle("highlighted", i === highlightedIndex));
    options[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#country-picker")) {
      countryDropdown.classList.remove("open");
    }
  });

  // ── Logout ────────────────────────────────
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login.html";
  });

  // ── Init ──────────────────────────────────
  checkAuth();
})();
