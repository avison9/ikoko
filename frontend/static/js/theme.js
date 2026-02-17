// Theme toggle - persists via localStorage
(function () {
  const STORAGE_KEY = "ikoko-theme";

  function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19";
  }

  // Apply saved theme immediately
  applyTheme(getTheme());

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      applyTheme(getTheme());
      btn.addEventListener("click", () => {
        const next = getTheme() === "dark" ? "light" : "dark";
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      });
    }
  });
})();
