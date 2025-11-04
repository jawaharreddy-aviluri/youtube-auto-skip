// content.js — v1.1 hardened

// ===== Tunables =====
const POLL_WHEN_NO_AD_MS = 500;   // background polling when no ad is showing
const POLL_WHEN_AD_MS = 100;      // faster when the player reports an ad
const LOG = true;                // set true to debug

const log = (...a) => LOG && console.log("[YT Auto Skip]", ...a);

// Some YouTube variants we’ve seen over time:
const BUTTON_CANDIDATES = [
  "button.ytp-ad-skip-button",
  "button.ytp-ad-skip-button-modern",
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-container button",
  ".ytp-skip-ad-button", // older
  ".video-ads button"    // broad, we filter by text
];

// Normalize text for matching
const isSkipLike = (t) => {
  const s = (t || "").trim().toLowerCase();
  // Skip / Skip ad / Skip ads (allow extra words & punctuation)
  return /\bskip\b/.test(s) && /\bad\b|\bads\b/.test(s);
};

// Confirm the element we’re about to click is visible & actionable
const canClick = (el) => {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

// Sometimes .click() is ignored; simulate a real user click
const forceClick = (el) => {
  try {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown",    { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup",      { bubbles: true, cancelable: true }));
    el.click();
    el.dispatchEvent(new MouseEvent("pointerup",    { bubbles: true, cancelable: true }));
    return true;
  } catch (e) {
    log("forceClick error", e);
    return false;
  }
};

let lastClickTs = 0;
const CLICK_COOLDOWN = 800; // ms, avoid double-clicking multiple variants at once

const tryClickSkip = () => {
  // 1) Query known selectors
  for (const sel of BUTTON_CANDIDATES) {
    const nodes = document.querySelectorAll(sel);
    for (const n of nodes) {
      // Accept either the node or its closest button
      const btn = (n.closest && n.closest("button")) || n;
      const text = (btn.textContent || btn.getAttribute("aria-label") || "");
      if (isSkipLike(text) && canClick(btn)) {
        const now = Date.now();
        if (now - lastClickTs < CLICK_COOLDOWN) return false;
        const ok = forceClick(btn);
        if (ok) {
          lastClickTs = now;
          log("Clicked via selector:", sel, "text:", text.trim());
          return true;
        }
      }
    }
  }

  // 2) Broad fallback: look at any button-like thing and filter by text
  const generic = document.querySelectorAll("button, div[role='button']");
  for (const el of generic) {
    const text = (el.textContent || el.getAttribute("aria-label") || "");
    if (isSkipLike(text) && canClick(el)) {
      const now = Date.now();
      if (now - lastClickTs < CLICK_COOLDOWN) return false;
      const ok = forceClick(el);
      if (ok) {
        lastClickTs = now;
        log("Clicked via fallback:", text.trim());
        return true;
      }
    }
  }

  return false;
};

// Detect when the player is in ad mode to speed up polling
const isAdShowing = () => {
  const player = document.querySelector(".html5-video-player, #movie_player");
  // YouTube toggles 'ad-showing' on the player during ads
  return !!(player && player.classList.contains("ad-showing"));
};

let pollTimer = null;

const setPolling = (ms) => {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    tryClickSkip();
  }, ms);
  log("Polling set to", ms, "ms");
};

const watchPlayer = () => {
  const player = document.querySelector(".html5-video-player, #movie_player");
  if (!player) return;

  const obs = new MutationObserver(() => {
    // Attribute/class changes during state transitions
    tryClickSkip();
    setPolling(isAdShowing() ? POLL_WHEN_AD_MS : POLL_WHEN_NO_AD_MS);
  });

  obs.observe(player, { attributes: true, attributeFilter: ["class"], subtree: true });
  log("Player observer attached");
};

const watchDom = () => {
  const obs = new MutationObserver(() => {
    tryClickSkip();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  log("DOM observer attached");
};

const hookYouTubeSpa = () => {
  // YouTube SPA navigation events
  const rearm = () => {
    log("yt SPA nav");
    setTimeout(() => {
      tryClickSkip();
      watchPlayer();
    }, 150);
  };
  window.addEventListener("yt-navigate-finish", rearm);
  window.addEventListener("yt-page-data-updated", rearm);
};

(function init() {
  tryClickSkip();       // try immediately
  watchDom();           // watch DOM mutations globally
  watchPlayer();        // watch the player state (ad-showing)
  hookYouTubeSpa();     // re-arm on SPA nav
  setPolling(POLL_WHEN_NO_AD_MS); // baseline poll
  log("Initialized");
})();
