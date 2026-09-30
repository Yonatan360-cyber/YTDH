// YoniTube adblock.js — safe ad blocker, runs on all pages
// Does NOT touch: ytd-searchbox, #search, input fields, topbar, masthead layout elements

(function() {
  'use strict';

  // ── Strict YouTube ad selectors (SAFE — only known ad elements) ───
  const YT_AD_SELECTORS = [
    '.ad-showing',
    '.ad-interrupting',
    '#player-ads',
    '#masthead-ad',
    '.ytp-ad-module',
    '.ytp-ad-overlay-container',
    '.ytp-ad-skip-button-container',
    '.ytp-ad-progress',
    '.ytp-ad-progress-list',
    'ytd-ad-slot-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-video-renderer',
    'ytd-search-pyv-renderer',
    'ytd-banner-promo-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-display-ad-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-statement-banner-renderer',
    'ytd-rich-item-renderer.style-scope:has(ytd-ad-slot-renderer)',
    '.ytd-promoted-sparkles-text-search-renderer',
  ];

  // ── Generic ad selectors (SAFE — specific class/id names only) ───
  const GENERIC_AD_SELECTORS = [
    'ins.adsbygoogle',
    '.adsbygoogle',
    '.google-auto-placed',
    '.pub_300x250',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="adnxs.com"]',
    'iframe[src*="adsystem.com"]',
    'iframe[src*="taboola.com"]',
    'iframe[src*="outbrain.com"]',
  ];

  const ALL_SELECTORS = [...YT_AD_SELECTORS, ...GENERIC_AD_SELECTORS];

  // ── Inject CSS (safe selectors only) ─────────────────────────────
  function injectCSS() {
    if (document.getElementById('yn-adblock-css')) return;
    const style = document.createElement('style');
    style.id = 'yn-adblock-css';
    style.textContent = ALL_SELECTORS.join(',\n') + ` {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      max-height: 0 !important;
      overflow: hidden !important;
      pointer-events: none !important;
    }
    /* Restore video controls when ad is showing */
    .ad-showing .ytp-play-button,
    .ad-showing .ytp-left-controls,
    .ad-showing .ytp-right-controls {
      pointer-events: auto !important;
    }`;
    (document.head || document.documentElement).appendChild(style);
  }
  injectCSS();

  // ── YouTube: auto-skip ads ────────────────────────────────────────
  function skipYTAds() {
    if (!location.hostname.includes('youtube')) return;

    // Click skip button if present
    const skipBtn = document.querySelector(
      '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern'
    );
    if (skipBtn) { skipBtn.click(); return; }

    // Speed through ad video
    const video = document.querySelector('video');
    if (video && document.querySelector('.ad-showing')) {
      if (!video.muted) video.muted = true;
      if (video.playbackRate < 16) video.playbackRate = 16;
      if (video.duration && Number.isFinite(video.duration) && video.duration > 0) {
        try { video.currentTime = video.duration; } catch {}
      }
    }
  }

  if (location.hostname.includes('youtube')) {
    setInterval(skipYTAds, 300);
  }

  // ── MutationObserver: hide dynamically injected ads ───────────────
  // IMPORTANT: never hide ytd-searchbox, #search-form, ytd-masthead
  const SAFE_BLOCKLIST = new Set(ALL_SELECTORS);
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Skip navigation/search elements
        const tag = node.tagName && node.tagName.toLowerCase();
        if (['ytd-searchbox','input','form','ytd-masthead'].includes(tag)) continue;
        if (node.id === 'search' || node.id === 'masthead-container') continue;

        for (const sel of ALL_SELECTORS) {
          try {
            if (node.matches(sel)) {
              node.style.cssText += ';display:none!important;height:0!important;';
              break;
            }
          } catch {}
        }
      }
    }
    if (location.hostname.includes('youtube')) skipYTAds();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

})();
