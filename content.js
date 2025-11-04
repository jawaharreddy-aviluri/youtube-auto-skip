// content.js

// ====== Configuration (you can tweak these) ======
const SCAN_INTERVAL_MS = 250;      // Fallback polling cadence
const LOG_PREFIX = "[YT Auto Skip]";
const ENABLE_DEBUG_LOGS = false;   // Set to true while debugging

// Common and resilient selectors. YouTube occasionally renames classes, so we:
// - Look for known skip button classes
// - Fallback to buttons whose text/aria-label include "skip"
const CANDIDATE_SELECTORS = [
  "button.ytp-ad-skip-button",
  "button.ytp-ad-skip-button-modern",
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-container button",
  ".video-ads button",
  "button" // last fallback, we’ll filter by text/attributes
];

// Simple logger
function dlog(...args) {
  if (ENABLE_DEBUG_LOGS) console.log(LOG_PREFIX, ...args);
}

// Utility: safe click with guard against disabled/hidden
function safeClick(btn) {
  try {
    const rect = btn.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0;
    const disabled = btn.disabled || btn.getAttribute("aria-disabled") === "true";

    if (!visible || disabled) return false;

    btn.click();
    dlog("Clicked:", btn);
    return true;
  } catch (e) {
    dlog("Click error:", e);
    return false;
  }
}

// Heuristic to confirm a button is the "Skip" button
function isSkipButton(el) {
  if (!(el instanceof HTMLElement)) return false;
  const label = (el.getAttribute("aria-label") || "").toLowerCase();
  const text = (el.textContent || "").toLowerCase();
  // Match "skip ad" / "skip ads" / "skip"
  const skipRegex = /\bskip\b.*\b(ad|ads)?\b|\b(ad|ads)\b.*\bskip\b/;
  return skipRegex.test(label) || skipRegex.test(text);
}

// Scan function that tries to find and click skip buttons immediately
function scanAndSkip() {
  for (const sel of CANDIDATE_SELECTORS) {
    const nodes = document.querySelectorAll(sel);
    for (const n of nodes) {
      if (isSkipButton(n)) {
        if (safeClick(n)) return true; // stop after the first successful click
      }
      // Sometimes the inner <span> has the text and the <button> is the parent
      const parentBtn = n.closest("button");
      if (parentBtn && isSkipButton(parentBtn)) {
        if (safeClick(parentBtn)) return true;
      }
    }
  }
  return false;
}

// Observe mutations in key containers for instant reaction when the UI changes
function attachObservers() {
  const opts = { childList: true, subtree: true, attributes: true };

  // 1) Whole document observer as a catch-all
  const docObserver = new MutationObserver((_mutations) => {
    scanAndSkip();
  });
  docObserver.observe(document.documentElement || document.body, opts);

  // 2) Player-specific observer if available (reacts when ad state toggles)
  const player = document.querySelector("#movie_player, .html5-video-player");
  if (player) {
    const playerObserver = new MutationObserver((_mutations) => {
      scanAndSkip();
    });
    playerObserver.observe(player, opts);
  }

  // 3) Fallback interval to catch any missed cases or late loads
  const intervalId = setInterval(scanAndSkip, SCAN_INTERVAL_MS);

  // Clean up when the page is being unloaded (navigations inside SPA)
  window.addEventListener("beforeunload", () => {
    try {
      docObserver.disconnect();
    } catch {}
    try {
      clearInterval(intervalId);
    } catch {}
  });

  dlog("Observers attached.");
}

// YouTube is a SPA—watch for page changes (yt-navigate) and re-arm if needed
function hookYouTubeSPA() {
  // Initial attach
  attachObservers();

  // Reattach after YouTube’s internal navigations
  window.addEventListener("yt-navigate-finish", () => {
    dlog("yt-navigate-finish");
    // A small delay lets the new DOM settle
    setTimeout(scanAndSkip, 100);
  });
}

// Start ASAP
(function init() {
  dlog("Initializing...");
  // If DOM is already interactive/complete, go now
  if (document.readyState === "complete" || document.readyState === "interactive") {
    hookYouTubeSPA();
  } else {
    window.addEventListener("DOMContentLoaded", hookYouTubeSPA, { once: true });
  }
})();
