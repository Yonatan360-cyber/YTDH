// ================== YoniTube content.js (final) ==================
// Logo | Video | Playlist | Channel | Music
// Features: MP3/MP4▶/עוד | thumbnail section | scroll-follow | SPA-safe

// ── CSS ──────────────────────────────────────────────────────────
(function injectStyle() {
    if (document.getElementById('yt-yoni-style')) return;
    const s = document.createElement('style');
    s.id = 'yt-yoni-style';
    s.textContent = `
        @keyframes ytPull {
            from { opacity:0; transform:translateY(7px); }
            to   { opacity:1; transform:translateY(0); }
        }
        .yt-yoni-item { animation: none; }

        /* Toggle switch */
        .yn-tgl-wrap { display:inline-flex; align-items:center; cursor:pointer; gap:7px; user-select:none; }
        .yn-tgl { position:relative; width:34px; height:18px; flex-shrink:0; }
        .yn-tgl input { opacity:0; width:0; height:0; position:absolute; }
        .yn-tgl-track {
            position:absolute; inset:0;
            background:#aaa; border-radius:18px; transition:background .2s;
        }
        .yn-tgl input:checked ~ .yn-tgl-track { background:#4caf50; }
        .yn-tgl-thumb {
            position:absolute; top:2px; left:2px;
            width:14px; height:14px;
            background:#fff; border-radius:50%;
            transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.3);
        }
        .yn-tgl input:checked ~ .yn-tgl-thumb { transform:translateX(16px); }
    `;
    (document.head || document.documentElement).appendChild(s);
})();

// ── Logo ─────────────────────────────────────────────────────────
let _logoInterval = null;
function finalLogoFix() {
    try {
        const renderer = document.querySelector('ytd-topbar-logo-renderer');
        if (!renderer) return;
        const anchor = renderer.querySelector('a#logo') || renderer;

        // Hide original YT SVG icons only (not container, not search siblings)
        anchor.querySelectorAll('yt-icon, yt-logo, .logo-icon').forEach(el => {
            if (!el.classList.contains('yoni-img')) el.style.display = 'none';
        });

        let img = anchor.querySelector('.yoni-img');
        if (!img) {
            img = document.createElement('img');
            img.className = 'yoni-img';
            img.onclick = e => { e.preventDefault(); e.stopPropagation(); location.href='/'; };
            anchor.insertBefore(img, anchor.firstChild);
        }
        img.style.cssText = 'height:20px;width:auto;display:block;cursor:pointer;flex-shrink:0;';
        
        // Improved dark mode detection for all YouTube pages
        const dark = document.documentElement.hasAttribute('dark') || 
                     document.body.classList.contains('dark') ||
                     document.documentElement.classList.contains('dark');
        const theater = document.querySelector('ytd-watch-flexy[theater]');
        const useLightText = dark || theater;
        const src = chrome.runtime.getURL(useLightText ? 'logo_dark.svg' : 'logo_light.svg');
        if (img.src !== src) img.src = src;
        renderer.style.overflow = 'visible';
        renderer.style.minWidth = '100px';
    } catch (e) {
        if (e?.message?.includes('Extension context invalidated')) _ynStopAll();
    }
}
_logoInterval = setInterval(() => { if (!_ynValid()) { _ynStopAll(); return; } finalLogoFix(); }, 1500);
setTimeout(finalLogoFix, 300);

(function _watchLogoThemeChanges(){
    try {
        finalLogoFix();
        const htmlObs = new MutationObserver(_debounce(finalLogoFix, 30));
        htmlObs.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
        
        // Also watch for class changes on body for dark mode
        const bodyObs = new MutationObserver(_debounce(finalLogoFix, 30));
        bodyObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        
        const ytWatch = document.querySelector('ytd-watch-flexy');
        if (ytWatch) {
            const watchObs = new MutationObserver(_debounce(finalLogoFix, 30));
            watchObs.observe(ytWatch, { attributes: true, attributeFilter: ['theater'] });
        } else {
            const dynamicObs = new MutationObserver(() => {
                const w = document.querySelector('ytd-watch-flexy');
                if (w && !w._logoObsAttached) {
                    w._logoObsAttached = true;
                    const watchObs = new MutationObserver(_debounce(finalLogoFix, 30));
                    watchObs.observe(w, { attributes: true, attributeFilter: ['theater'] });
                }
            });
            dynamicObs.observe(document.body, { childList: true, subtree: true });
        }
    } catch(e){}
})();

// Handle extension context invalidation
window.addEventListener('beforeunload', () => _ynStopAll());

// ── Extension-context safety wrapper ──────────────────────────────
let _ynDead = false;
const _ynIntervals = [];
const _ynValid = () => {
    if (_ynDead) return false;
    try {
        void chrome.runtime.id;
        return true;
    } catch (e) {
        if (e?.message?.includes('Extension context invalidated')) _ynStopAll();
        return false;
    }
};
function _ynStopAll() {
    if (_ynDead) return;
    _ynDead = true;
    if (_logoInterval) { clearInterval(_logoInterval); _logoInterval = null; }
    _ynIntervals.forEach(id => clearInterval(id));
    _ynIntervals.length = 0;
}
function _ynSetInterval(fn, ms) {
    const id = setInterval(() => { if (!_ynValid()) { _ynStopAll(); return; } fn(); }, ms);
    _ynIntervals.push(id);
    return id;
}
const _ynChromeGet = (keys, cb) => {
    try {
        if (!_ynValid() || !chrome.storage?.local) { cb({}); return; }
        chrome.storage.local.get(keys, r => {
            if (chrome.runtime.lastError) { cb({}); return; }
            cb(r || {});
        });
    } catch (e) { cb({}); }
};
const _ynChromeSet = (obj, cb) => {
    try {
        if (!_ynValid() || !chrome.storage?.local) { if (cb) cb(); return; }
        chrome.storage.local.set(obj, () => {
            if (chrome.runtime.lastError) { if (cb) cb(); return; }
            if (cb) cb();
        });
    } catch (e) { if (cb) cb(); }
};
const _ynChromeRemove = (keys, cb) => {
    try {
        if (!_ynValid() || !chrome.storage?.local) { if (cb) cb(); return; }
        chrome.storage.local.remove(keys, () => {
            if (chrome.runtime.lastError) { if (cb) cb(); return; }
            if (cb) cb();
        });
    } catch (e) { if (cb) cb(); }
};
const _ynSendMsg = (msg, cb) => {
    try {
        if (!_ynValid() || !chrome.runtime?.sendMessage) { if (cb) cb(); return; }
        chrome.runtime.sendMessage(msg, resp => {
            if (chrome.runtime.lastError) { if (cb) cb(); return; }
            if (cb) cb(resp);
        });
    } catch (e) { if (cb) cb(); }
};
const _ynOnMsg = (fn) => {
    try {
        if (!_ynValid() || !chrome.runtime?.onMessage) return;
        chrome.runtime.onMessage.addListener((m, s, r) => {
            try { return fn(m, s, r); } catch (e) {}
        });
    } catch (e) {}
};

// ── Download ──────────────────────────────────────────────────────
function _pageMeta(url) {
    const out = {};
    try {
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title, ytmusic-player-bar .title');
        const t = (titleEl && (titleEl.textContent || titleEl.getAttribute('title') || '')).trim();
        if (t) out.title = t;
        else if (document.title) out.title = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
    } catch {}
    try {
        const m = String(url || location.href).match(/(?:v=|\/shorts\/|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/);
        if (m) out.thumb = `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`;
    } catch {}
    return out;
}

function sendDownload(url, format, height, customRes, thumbOpts, extraOpts) {
    const rawTitle = document.title ? document.title.replace(/- YouTube$/i, '').trim() : '';
    const body = { url: url.replace('music.youtube.com', 'www.youtube.com'), format, title: rawTitle };
    if (height)    body.height = parseInt(height);
    if (customRes) { body.width = parseInt(customRes.w); body.height = parseInt(customRes.h); }
    if (thumbOpts) {
        if (thumbOpts.embed_thumbnail === false) body.embed_thumbnail = false;
        if (thumbOpts.thumb_width)  body.thumb_width  = thumbOpts.thumb_width;
        if (thumbOpts.thumb_height) body.thumb_height = thumbOpts.thumb_height;
        if (thumbOpts.thumb_format)  body.thumb_format  = thumbOpts.thumb_format;
    }
    if (extraOpts) {
        if (extraOpts.subtitle_lang)   body.subtitle_lang   = extraOpts.subtitle_lang;
        if (extraOpts.subtitle_format) body.subtitle_format = extraOpts.subtitle_format;
    }
    // content_type from yn_content query (channel picker)
    try {
        const ct = new URL(body.url).searchParams.get('yn_content');
        if (ct) body.content_type = ct;
    } catch {}
    Object.assign(body, _pageMeta(body.url));
    // Merge saved settings (path / folders / speed / subs)
    _ynChromeGet(['yn_s_v6','yn_s_v5'], r => {
        try {
            const s = r.yn_s_v6 || r.yn_s_v5 || {};
            if (s.defSpeed) body.speed = s.defSpeed;
            if (s.basePath) body.base_path = s.basePath;
            if (s.folderPlaylist) body.folder_playlist = true;
            if (s.folderChannel) body.folder_channel = true;
            if (s.enableSubs && s.subLang && !body.subtitle_lang) {
                body.subtitle_lang = s.subLang;
                if (s.subFormat) body.subtitle_format = s.subFormat;
            }
        } catch (e) {}
        _exportCookiesAndDownload(body);
    });
}

function _ynSaveQueuedItem(d, body) {
    if (!d || !d.uid) return;
    try {
        _ynChromeGet(['yn_qItems','yn_deleted_uids'], r => {
            try {
                const q = r.yn_qItems || {};
                const dels = new Set(r.yn_deleted_uids || []);
                if (dels.has(d.uid)) dels.delete(d.uid);
                if (!q[d.uid]) {
                    const b = body || {};
                    q[d.uid] = {
                        uid: d.uid,
                        title: d.title || b.title || '',
                        format: d.format || b.format || '',
                        pct: 0,
                        status: 'queued',
                        source: 'youtube',
                        thumb: d.thumb || b.thumb || '',
                        url: b.url || ''
                    };
                    _ynChromeSet({
                        'yn_qItems': q,
                        'yn_deleted_uids': Array.from(dels)
                    });
                }
            } catch(e) {}
        });
    } catch(e) {}
}

function _exportCookiesAndDownload(body) {
    _ynSendMsg({ type: 'downloadWithCookies', body }, (resp) => {
        if (resp && resp.ok) {
            try { console.log('YoniTube:', resp.data || resp); } catch {}
            _ynSaveQueuedItem(resp && resp.data, body);
        } else {
            _doSendDownload(body);
        }
    });
}

function _doSendDownload(body) {
    fetch('http://127.0.0.1:5000/download', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
    }).then(r=>r.json()).then(d=>{
        console.log('YoniTube:',d);
        _ynSaveQueuedItem(d, body);
    }).catch(e=>console.error('YoniTube:',e));
}

function getVideoUrl() {
    const v = new URLSearchParams(location.search).get('v');
    return v ? 'https://www.youtube.com/watch?v=' + v : null;
}

// ── Menu State ────────────────────────────────────────────────────
let _submenu = null, _anchorBtn = null, _anchorBelow = false;

function _closeAll() {
    document.querySelectorAll('.yn-menu-video,.yn-menu-playlist,.yn-menu-channel,.yn-menu-music,.yn-sub')
            .forEach(el => el.remove());
    _submenu = _anchorBtn = null; _anchorBelow = false;
}

document.addEventListener('click', e => {
    if (!e.target.closest('.yn-menu-video,.yn-menu-playlist,.yn-menu-channel,.yn-menu-music,.yn-sub'))
        _closeAll();
});

// SPA nav detection
let _lastHref = location.href;
setInterval(() => { if (location.href !== _lastHref) { _lastHref = location.href; _closeAll(); } }, 400);

// Scroll follow
function _reposition() {
    if (!_anchorBtn) return;
    const main = document.querySelector('.yn-menu-video,.yn-menu-playlist,.yn-menu-channel,.yn-menu-music');
    if (!main) return;
    _placeMenu(main, _anchorBtn.getBoundingClientRect(), _anchorBelow);
    if (_submenu) _placeSub(_submenu, main.getBoundingClientRect());
}
let _rTick = false;
window.addEventListener('scroll', () => {
    if (!_rTick) { requestAnimationFrame(() => { _reposition(); _rTick = false; }); _rTick = true; }
}, { passive:true });

// ── Position helpers ──────────────────────────────────────────────
// taskbar safe zone: 52px from bottom (Windows taskbar)
const _TASKBAR = 52;

function _placeMenu(menu, r, below) {
    menu.style.position = 'fixed';
    const mh = menu.offsetHeight || 160;
    const mw = menu.offsetWidth || 140;
    let top, left;
    if (below) {
        top = r.bottom + 6;
        // If doesn't fit below AND we have space above, flip to above
        const fitsBelow = (top + mh + _TASKBAR) < window.innerHeight;
        const fitsAbove = (r.top - mh - 6) > 4;
        if (!fitsBelow && fitsAbove) {
            top = r.top - mh - 6;
        }
        left = r.left;
    } else {
        let calcTop = r.top - mh - 6;
        // if goes off top, flip below
        if (calcTop < 4) calcTop = r.bottom + 6;
        top = calcTop;
        left = Math.max(4, r.left - 30);
    }
    // clamp above top / below taskbar
    top = Math.min(top, window.innerHeight - mh - _TASKBAR);
    top = Math.max(4, top);
    menu.style.top = top + 'px';
    // clamp right edge
    const maxLeft = window.innerWidth - mw - 4;
    if (left > maxLeft) left = maxLeft;
    left = Math.max(4, left);
    menu.style.left = left + 'px';
    // Make visible after positioning
    menu.style.visibility = 'visible';
}

function _placeSub(sub, mr) {
    const sw = sub.offsetWidth || 180, sh = sub.offsetHeight || 10, gap = 5;
    const fitR = mr.right + gap + sw < window.innerWidth - 4;
    sub.style.left = (fitR ? mr.right + gap : mr.left - sw - gap) + 'px';
    let top = Math.max(4, Math.min(mr.top, window.innerHeight - sh - _TASKBAR));
    sub.style.top = top + 'px';
}

// ── Menu Builder ──────────────────────────────────────────────────
function _buildMenu(isDark) {
    const hov   = isDark ? 'rgba(255,255,255,0.09)' : '#f0f0f0';
    const xClr  = isDark ? '#aaa' : '#666';
    const divC  = isDark ? 'rgba(255,255,255,0.09)' : '#eee';
    // brand: sharp enough to read
    const brand = isDark ? 'rgba(255,255,255,0.6)' : '#777';

    const menu = document.createElement('div');
    Object.assign(menu.style, {
        background:   isDark ? '#282828' : '#fff',
        borderRadius: '12px',
        border:       isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #ddd',
        boxShadow:    '0 4px 14px rgba(0,0,0,0.22)',
        padding:      '4px 0',
        minWidth:     '140px',
        fontSize:     '13px',
        color:        isDark ? '#fff' : '#000',
        userSelect:   'none',
        zIndex:       '99999',
        overflow:     'hidden',
        visibility:   'hidden',
    });

    // Header: ✕ left | by. The_Yonatan right
    const hdr = document.createElement('div');
    Object.assign(hdr.style, {
        display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 9px 0',
    });

    const xBtn = document.createElement('span');
    xBtn.textContent = '✕';
    Object.assign(xBtn.style, { cursor:'pointer', fontWeight:'bold', fontSize:'8px', color:xClr, transition:'all 0.15s' });
    xBtn.onmouseenter = () => { xBtn.style.transform='scale(1.3)'; xBtn.style.color=isDark?'#fff':'#000'; };
    xBtn.onmouseleave = () => { xBtn.style.transform=''; xBtn.style.color=xClr; };
    xBtn.onclick = e => { e.stopPropagation(); _closeAll(); };

    const brandEl = document.createElement('a');
    brandEl.textContent = 'by. The_Yonatan';
    brandEl.href = 'https://yonatan360-cyber.github.io/web/';
    brandEl.target = '_blank';
    Object.assign(brandEl.style, {
        fontSize:'9px', fontWeight:'600', letterSpacing:'0.3px',
        color:brand, textDecoration:'none', cursor:'pointer', userSelect:'none',
    });
    brandEl.onmouseenter = () => brandEl.style.color = isDark ? 'rgba(255,255,255,0.9)' : '#333';
    brandEl.onmouseleave = () => brandEl.style.color = brand;
    brandEl.onclick = e => e.stopPropagation();

    hdr.appendChild(xBtn); hdr.appendChild(brandEl);
    menu.appendChild(hdr);

    // ── Server status line — animated stripe + hover tooltip ──────
    const statusLine = document.createElement('div');
    statusLine.id = 'yn-srv-line';
    Object.assign(statusLine.style, {
        height: '3px',
        background: 'repeating-linear-gradient(90deg,#333 0px,#555 8px,#333 16px)',
        backgroundSize: '200% 100%',
        animation: 'yn-stripe 1.4s linear infinite',
        margin: '2px 0 0',
        cursor: 'pointer',
        transition: 'height 0.2s',
        overflow: 'hidden',
        position: 'relative',
    });

    // Inject keyframe once
    if (!document.getElementById('yn-stripe-kf')) {
        const kf = document.createElement('style');
        kf.id = 'yn-stripe-kf';
        kf.textContent = `
@keyframes yn-stripe-green {
  0%   { background-position: 0% 0; }
  100% { background-position: 200% 0; }
}
@keyframes yn-stripe-red {
  0%   { background-position: 0% 0; }
  100% { background-position: 200% 0; }
}
@keyframes yn-stripe-neutral {
  0%   { background-position: 0% 0; }
  100% { background-position: 200% 0; }
}
#yn-srv-line:hover .yn-srv-tooltip {
    opacity: 1 !important;
    max-height: 28px !important;
}`;
        document.head.appendChild(kf);
    }

    // Hover tooltip inside the line
    const tooltip = document.createElement('div');
    tooltip.className = 'yn-srv-tooltip';
    Object.assign(tooltip.style, {
        fontSize: '10px', fontWeight: '600', color: '#fff',
        padding: '2px 10px', lineHeight: '16px', whiteSpace: 'nowrap',
        opacity: '0', maxHeight: '0', overflow: 'hidden',
        transition: 'opacity 0.2s, max-height 0.2s',
        background: 'inherit',
    });
    tooltip.textContent = '● מתחבר...';
    statusLine.appendChild(tooltip);

    // Status update function — gradient-slide like popup
    let _srvOnline = false;
    // Make _srvOnline globally accessible
    window._srvOnline = () => _srvOnline;
    function _updateSrvLine(online, text) {
        _srvOnline = online;
        if (!document.getElementById('yn-kf')) {
            const kf = document.createElement('style');
            kf.id = 'yn-kf';
            kf.textContent = `@keyframes yn-gradient-slide{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
            (document.head||document.documentElement).appendChild(kf);
        }
        if (online) {
            statusLine.style.background = 'linear-gradient(90deg,#22c55e 0%,#4ade80 50%,#22c55e 100%)';
            statusLine.style.backgroundSize = '200% 100%';
            statusLine.style.animation = 'yn-gradient-slide 2s linear infinite';
            statusLine.style.boxShadow = '0 0 8px rgba(34,197,94,.4)';
            tooltip.textContent = '● פעיל' + (text ? ' | ' + text : '');
            tooltip.style.color = '#dcfce7';
        } else {
            statusLine.style.background = 'linear-gradient(90deg,#ef4444 0%,#f87171 50%,#ef4444 100%)';
            statusLine.style.backgroundSize = '200% 100%';
            statusLine.style.animation = 'yn-gradient-slide 2s linear infinite';
            statusLine.style.boxShadow = 'none';
            tooltip.textContent = '● כבוי — לחץ להפעלה';
            tooltip.style.color = '#fecaca';
        }
        statusLine.onmouseenter = () => {
            statusLine.style.height = '20px';
            tooltip.style.opacity = '1';
            tooltip.style.maxHeight = '28px';
        };
        statusLine.onmouseleave = () => {
            statusLine.style.height = '3px';
            tooltip.style.opacity = '0';
            tooltip.style.maxHeight = '0';
        };
    }

    // Initial check
    _updateSrvLine(false, '');
    (function _pollSrvLine() {
        fetch('http://127.0.0.1:5000/status', { signal: AbortSignal.timeout(2000) })
            .then(r => r.json())
            .then(d => {
                const act = d.stats?.active || 0;
                const q   = d.queue || 0;
                const parts = [];
                if (q   > 0) parts.push(q   + ' בתור');
                if (act > 0) parts.push(act + ' יורדים');
                _updateSrvLine(true, parts.join(', '));
            })
            .catch(() => _updateSrvLine(false, ''));
    })();
    const _srvTimer = setInterval(() => {
        fetch('http://127.0.0.1:5000/status', { signal: AbortSignal.timeout(2000) })
            .then(r => r.json())
            .then(d => {
                const act = d.stats?.active || 0, q = d.queue || 0;
                const parts = [];
                if (q > 0)   parts.push(q + ' בתור');
                if (act > 0) parts.push(act + ' יורדים');
                _updateSrvLine(true, parts.join(', '));
            })
            .catch(() => _updateSrvLine(false, ''));
    }, 3500);
    const _srvObs = new MutationObserver(() => {
        if (!document.body.contains(menu)) { clearInterval(_srvTimer); _srvObs.disconnect(); }
    });
    _srvObs.observe(document.body, { childList: true, subtree: false });
    menu.appendChild(statusLine);

    let _optIdx = 0;
    function addOpt(text, indent, onClick) {
        const row = document.createElement('div');
        row.className = 'yt-yoni-item';
        row.textContent = text;
        Object.assign(row.style, {
            padding: indent ? '8px 16px 8px 26px' : '10px 16px',
            cursor:'pointer', fontSize: indent ? '12px' : '13px',
            animationDelay: '0ms',
        });
        row.onmouseenter = () => row.style.background = hov;
        row.onmouseleave = () => row.style.background = 'transparent';
        if (onClick) row.onclick = e => { e.stopPropagation(); onClick(); };
        menu.appendChild(row);
        return row;
    }

    function addSep() {
        const d = document.createElement('div');
        Object.assign(d.style, { height:'1px', background:divC, margin:'2px 0' });
        menu.appendChild(d);
    }

    function addTermsLink() {
        const link = document.createElement('div');
        link.textContent = 'תנאי שימוש';
        Object.assign(link.style, {
            padding:'5px 16px', fontSize:'10px', color: isDark ? '#444' : '#bbb',
            cursor:'pointer', textAlign:'center', borderTop:`1px solid ${divC}`, marginTop:'2px',
        });
        link.onmouseenter = () => link.style.color = isDark ? '#888' : '#777';
        link.onmouseleave = () => link.style.color = isDark ? '#444' : '#bbb';
        link.onclick = e => {
            e.stopPropagation();
            _ynSendMsg({type:'openTerms'});
            _closeAll();
        };
        menu.appendChild(link);
    }

    return { menu, addOpt, addSep, addTermsLink, isDark };
}

// ── Sub-panel ─────────────────────────────────────────────────────
function _openSub(mainMenu, isDark, buildFn) {
    document.querySelectorAll('.yn-sub').forEach(el => el.remove());
    _submenu = null;
    const sub = document.createElement('div');
    sub.className = 'yn-sub';
    Object.assign(sub.style, {
        position:'fixed', zIndex:'100001', borderRadius:'10px', padding:'4px 0',
        minWidth:'180px', maxHeight:'85vh', overflowY:'auto',
        background: isDark ? '#282828' : '#fff',
        color:      isDark ? '#fff' : '#000',
        border:     isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #ddd',
        boxShadow:  '0 6px 20px rgba(0,0,0,0.28)',
        fontSize:'13px', userSelect:'none',
    });
    buildFn(sub, isDark);
    document.body.appendChild(sub);
    _submenu = sub;
    _placeSub(sub, mainMenu.getBoundingClientRect());
    return sub;
}

// ── Accordion helper ───────────────────────────────────────────────
function _accordion(container, label, isDark, buildBody) {
    const hov = isDark ? 'rgba(255,255,255,0.09)' : '#f0f0f0';
    const gC  = isDark ? '#aaa' : '#888';
    const wrap = document.createElement('div');
    const hdr  = document.createElement('div');
    Object.assign(hdr.style, { display:'flex', alignItems:'center', gap:'5px', padding:'9px 16px', cursor:'pointer' });
    hdr.onmouseenter = () => hdr.style.background = hov;
    hdr.onmouseleave = () => hdr.style.background = 'transparent';
    const arrow = document.createElement('span');
    arrow.textContent = '▾';
    Object.assign(arrow.style, { fontSize:'11px', color:gC, transition:'transform 0.18s', display:'inline-block' });
    const lbl = document.createElement('span');
    lbl.textContent = label;
    hdr.appendChild(arrow); hdr.appendChild(lbl);
    const body = document.createElement('div');
    body.style.cssText = `display:none;background:${isDark?'rgba(255,255,255,0.04)':'#f6f6f6'}`;
    buildBody(body);
    let open = false;
    const setOpen = v => {
        open = v;
        body.style.display    = v ? 'block' : 'none';
        arrow.style.transform = v ? 'rotate(180deg)' : '';
    };
    hdr.onclick = e => { e.stopPropagation(); setOpen(!open); };
    wrap.appendChild(hdr); wrap.appendChild(body);
    container.appendChild(wrap);
    return { setOpen };
}

// ── Toggle switch helper ──────────────────────────────────────────
function _makeToggle(labelText, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'yn-tgl-wrap';
    const tgl = document.createElement('span');
    tgl.className = 'yn-tgl';
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.checked = checked;
    const track = document.createElement('span'); track.className = 'yn-tgl-track';
    const thumb = document.createElement('span'); thumb.className = 'yn-tgl-thumb';
    tgl.appendChild(inp); tgl.appendChild(track); tgl.appendChild(thumb);
    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    Object.assign(lbl.style, { fontSize:'12px' });
    wrap.appendChild(tgl); wrap.appendChild(lbl);
    inp.onchange = () => onChange(inp.checked);
    wrap.onclick = e => e.stopPropagation();
    return { wrap, get checked() { return inp.checked; } };
}

// ── Quality sub-panel ─────────────────────────────────────────────
const QUALS = [
    {label:'וידאו — איכות מיטבית',h:'best'},
    {label:'1080p',h:'1080'},
    {label:'720p',h:'720'},
    {label:'480p',h:'480'},
    {label:'360p',h:'360'},
];

function _openQualitySub(mainMenu, isDark, getUrl) {
    _openSub(mainMenu, isDark, (sub, dk) => {
        const hov = dk ? 'rgba(255,255,255,0.09)' : '#f0f0f0';
        QUALS.forEach((q, i) => {
            const opt = document.createElement('div');
            opt.className = 'yt-yoni-item';
            opt.textContent = q.label;
            Object.assign(opt.style, { padding:'10px 16px', cursor:'pointer', animationDelay:(i*30)+'ms' });
            opt.onmouseenter = () => opt.style.background = hov;
            opt.onmouseleave = () => opt.style.background = 'transparent';
            opt.onclick = () => {
                const url = getUrl(); if (!url) { alert('לא זוהה URL'); return; }
                sendDownload(url, 'mp4', q.h === 'best' ? null : q.h, null);
                _closeAll();
            };
            sub.appendChild(opt);
        });
    });
    if (_submenu) _submenu.dataset.origin = 'quality';
}

// ── "עוד" sub-panel ───────────────────────────────────────────────
const VID_FMTS = [
    {l:'.mp4',v:'mp4'},{l:'.mkv',v:'mkv'},{l:'.webm',v:'webm'},
    {l:'.mov',v:'mov'},{l:'.avi',v:'avi'},{l:'.flv',v:'flv'},
    {l:'.mpg/.mpeg',v:'mpg'},{l:'.3gp',v:'3gp'},{l:'.ts/.m2ts',v:'ts'},
];
const AUD_FMTS = [
    {l:'.mp3',v:'mp3'},{l:'.m4a',v:'m4a'},{l:'.wav',v:'wav'},
    {l:'.flac',v:'flac'},{l:'.aac',v:'aac'},{l:'.ogg',v:'ogg'},
    {l:'.opus',v:'opus'},{l:'.wma',v:'wma'},{l:'.aiff',v:'aiff'},
];

function _openMoreSub(mainMenu, isDark, getUrl) {
    let savedRes    = null;
    let thumbOn     = true;
    let thumbRes    = null;
    let thumbFormat = 'jpg';
    let audAccRef   = null;
    let fmtAccRef   = null;
    let subOn = false, subLang = 'he';
    const getSubOpts = () => subOn ? { subtitle_lang: subLang, subtitle_format: 'srt' } : null;

    _openSub(mainMenu, isDark, (sub, dk) => {
        const hov     = dk ? 'rgba(255,255,255,0.09)' : '#f0f0f0';
        const divC    = dk ? 'rgba(255,255,255,0.09)' : '#eee';
        const inputBg = dk ? 'rgba(255,255,255,0.08)' : '#fff';
        const inputBr = dk ? '1px solid rgba(255,255,255,0.2)' : '1px solid #ccc';

        const mkInput = ph => {
            const inp = document.createElement('input');
            inp.type='text'; inp.inputMode='decimal'; inp.placeholder=ph;
            Object.assign(inp.style, { display:'block', width:'100%', marginBottom:'6px',
                padding:'5px 8px', borderRadius:'5px', boxSizing:'border-box',
                border:inputBr, background:inputBg, color:dk?'#fff':'#000', fontSize:'12px', outline:'none' });
            inp.addEventListener('input', function() {
                const c=this.value.replace(/[^0-9]/g,''); 
                if(this.value!==c) this.value=c;
                // Validate resolution range
                const val = parseInt(this.value);
                if (ph.includes('גובה')) {
                    if (val && (val < 144 || val > 7680)) {
                        this.style.borderColor = '#ef4444';
                    } else {
                        this.style.borderColor = inputBr;
                    }
                } else if (ph.includes('רוחב')) {
                    if (val && (val < 256 || val > 4320)) {
                        this.style.borderColor = '#ef4444';
                    } else {
                        this.style.borderColor = inputBr;
                    }
                }
            });
            inp.onclick = e => e.stopPropagation(); return inp;
        };
        const mkOkBtn = () => {
            const ok=document.createElement('button'); ok.textContent='OK';
            Object.assign(ok.style, { display:'block',width:'100%',padding:'5px',border:'none',
                borderRadius:'5px',fontSize:'12px',fontWeight:'600',cursor:'pointer',
                transition:'background 0.15s',background:'#888',color:'#fff' });
            ok.disabled=false; return ok;
        };
        const setOkState=(ok,w,h)=>{ const v=w.value.trim()&&h.value.trim();
            ok.disabled=false; ok.style.background=v?(dk?'#5a8a5a':'#4caf50'):(dk?'#6a6a6a':'#888'); ok.style.cursor='pointer'; };
        const mkMenuItem=(label,emoji,onClick)=>{
            const row=document.createElement('div'); row.className='yt-yoni-item';
            Object.assign(row.style,{display:'flex',alignItems:'center',gap:'8px',padding:'9px 16px',cursor:'pointer',fontSize:'13px'});
            if(emoji){const em=document.createElement('span');em.textContent=emoji;Object.assign(em.style,{fontSize:'13px',flexShrink:'0'});row.appendChild(em);}
            const lbl=document.createElement('span'); lbl.textContent=label; row.appendChild(lbl);
            row.onmouseenter=()=>row.style.background=hov; row.onmouseleave=()=>row.style.background='transparent';
            if(onClick) row.onclick=e=>{e.stopPropagation();onClick();}; return row;
        };

        // [1] רזולוציה
        let vidAccSetOpen=null;
        const resAcc=_accordion(sub,'רזולוציה',dk,body=>{
            body.style.padding='8px 14px 10px';
            const wInp=mkInput('רוחב (px)'), hInp=mkInput('גובה (px)'), ok=mkOkBtn();
            wInp.addEventListener('input',()=>setOkState(ok,wInp,hInp));
            hInp.addEventListener('input',()=>setOkState(ok,wInp,hInp));
            ok.onclick=e=>{ e.stopPropagation(); if(ok.disabled)return;
                const wVal=wInp.value.trim(), hVal=hInp.value.trim();
                savedRes=(wVal&&hVal)?{w:wVal,h:hVal}:null; resAcc.setOpen(false);
                if(fmtAccRef)fmtAccRef.setOpen(true); if(vidAccSetOpen)vidAccSetOpen(true); };
            body.appendChild(wInp); body.appendChild(hInp); body.appendChild(ok);
        });
        sub.appendChild(_div1px(divC));

        // [2] פורמטים
        const fmtAcc=_accordion(sub,'פורמטים',dk,fmtBody=>{
            const vidAcc=_accordion(fmtBody,'וידאו',dk,b=>{
                VID_FMTS.forEach((f,i)=>{
                    const opt=document.createElement('div'); opt.className='yt-yoni-item'; opt.textContent=f.l;
                    Object.assign(opt.style,{padding:'7px 16px 7px 28px',cursor:'pointer',fontSize:'12px',animationDelay:(i*20)+'ms'});
                    opt.onmouseenter=()=>opt.style.background=hov; opt.onmouseleave=()=>opt.style.background='transparent';
                    opt.onclick=()=>{ const url=getUrl(); if(!url){alert('לא זוהה URL');return;}
                        const tOpts=!thumbOn?{embed_thumbnail:false}:(thumbRes?{thumb_width:parseInt(thumbRes.w),thumb_height:parseInt(thumbRes.h),thumb_format:thumbFormat}:null);
                        sendDownload(url,f.v,null,savedRes,tOpts,getSubOpts()); _closeAll(); };
                    b.appendChild(opt);
                });
            });
            vidAccSetOpen=vidAcc.setOpen;
            const audAcc=_accordion(fmtBody,'אודיו',dk,b=>{
                AUD_FMTS.forEach((f,i)=>{
                    const opt=document.createElement('div'); opt.className='yt-yoni-item'; opt.textContent=f.l;
                    Object.assign(opt.style,{padding:'7px 16px 7px 28px',cursor:'pointer',fontSize:'12px',animationDelay:(i*20)+'ms'});
                    opt.onmouseenter=()=>opt.style.background=hov; opt.onmouseleave=()=>opt.style.background='transparent';
                    opt.onclick=()=>{ const url=getUrl(); if(!url){alert('לא זוהה URL');return;}
                        const tOpts=!thumbOn?{embed_thumbnail:false}:(thumbRes?{thumb_width:parseInt(thumbRes.w),thumb_height:parseInt(thumbRes.h),thumb_format:thumbFormat}:null);
                        sendDownload(url,f.v,null,null,tOpts,getSubOpts()); _closeAll(); };
                    b.appendChild(opt);
                });
            });
            audAccRef=audAcc;
        });
        fmtAccRef=fmtAcc;
        sub.appendChild(_div1px(divC));

        // [3] תמונת עטיפה
        _accordion(sub,'תמונת עטיפה',dk,body=>{
            body.style.padding='6px 14px 12px';
            const tgl=_makeToggle('הטמע תמונת עטיפה',true,checked=>{
                thumbOn=checked;
                thumbResArea.style.opacity=checked?'1':'0.35';
                thumbResArea.style.pointerEvents=checked?'auto':'none';
            });
            tgl.wrap.style.marginBottom='8px'; body.appendChild(tgl.wrap);
            
            // Image format selection
            const fmtLabel=document.createElement('div');
            Object.assign(fmtLabel.style,{fontSize:'12px',color:dk?'#aaa':'#666',marginBottom:'4px'});
            fmtLabel.textContent='פורמט תמונה:';
            body.appendChild(fmtLabel);
            
            const fmtSelect=document.createElement('select');
            Object.assign(fmtSelect.style,{width:'100%',padding:'5px',borderRadius:'5px',border:inputBr,background:inputBg,color:dk?'#fff':'#000',fontSize:'12px',marginBottom:'8px'});
            ['jpg','png','webp'].forEach(fmt=>{
                const opt=document.createElement('option');
                opt.value=fmt;
                opt.textContent=fmt.toUpperCase();
                if(fmt===thumbFormat) opt.selected=true;
                fmtSelect.appendChild(opt);
            });
            fmtSelect.onchange=e=>{ thumbFormat=e.target.value; };
            body.appendChild(fmtSelect);
            
            const thumbResArea=document.createElement('div');
            const note=document.createElement('div');
            Object.assign(note.style,{fontSize:'10px',color:dk?'#666':'#aaa',marginBottom:'4px'});
            note.textContent='OK — שמור ופתח תפריט אודיו'; thumbResArea.appendChild(note);
            const twInp=mkInput('רוחב תמונה (px)'), thInp=mkInput('גובה תמונה (px)'), tokBtn=mkOkBtn();
            twInp.addEventListener('input',()=>setOkState(tokBtn,twInp,thInp));
            thInp.addEventListener('input',()=>setOkState(tokBtn,twInp,thInp));
            tokBtn.onclick=e=>{ e.stopPropagation(); if(tokBtn.disabled)return;
                thumbRes={w:twInp.value.trim(),h:thInp.value.trim()};
                if(fmtAccRef)fmtAccRef.setOpen(true); if(audAccRef)audAccRef.setOpen(true); };
            thumbResArea.appendChild(twInp); thumbResArea.appendChild(thInp); thumbResArea.appendChild(tokBtn);
            body.appendChild(thumbResArea);
            body.appendChild(_div1px(divC,'8px 0'));
            // "הורדת תמונת עטיפה" — regular menu item
            const dlRow=mkMenuItem('הורדת תמונת עטיפה','📷',()=>{
                const url=getUrl(); if(!url){alert('לא זוהה URL');return;}
                const tOpts=thumbRes?{thumb_width:parseInt(thumbRes.w),thumb_height:parseInt(thumbRes.h),thumb_format:thumbFormat}:null;
                sendDownload(url,'thumbnail',null,null,tOpts,getSubOpts()); _closeAll();
            });
            body.appendChild(dlRow);
        });
        sub.appendChild(_div1px(divC));

        // [4] קבועים מראש
        _accordion(sub,'קבועים מראש',dk,body=>{
            body.style.padding='6px 14px 10px';
            const PRESETS_KEY='yonitube_presets'; let presets=[];
            const listEl=document.createElement('div'); Object.assign(listEl.style,{marginBottom:'8px'}); body.appendChild(listEl);
            const renderPresets=()=>{ listEl.innerHTML='';
                _ynChromeGet([PRESETS_KEY],result=>{
                    presets=result[PRESETS_KEY]||[];
                    if(!presets.length){const e=document.createElement('div');Object.assign(e.style,{fontSize:'11px',color:dk?'#555':'#aaa',padding:'4px 0'});e.textContent='אין קבועים — לחץ + להוספה';listEl.appendChild(e);return;}
                    presets.forEach((p,idx)=>{
                        const row=document.createElement('div');
                        Object.assign(row.style,{display:'flex',alignItems:'center',gap:'6px',padding:'5px 0',borderBottom:`1px solid ${dk?'#222':'#eee'}`});
                        const nm=document.createElement('span'); nm.textContent=p.name; Object.assign(nm.style,{flex:'1',fontSize:'12px',fontWeight:'600'});
                        const inf=document.createElement('span'); inf.textContent=`${p.format.toUpperCase()}${p.height?' '+p.height+'p':''}`; Object.assign(inf.style,{fontSize:'10px',color:dk?'#888':'#999'});
                        const useBtn=document.createElement('button'); useBtn.textContent='▶';
                        Object.assign(useBtn.style,{background:'#1e3a8a',border:'none',borderRadius:'4px',color:'#fff',cursor:'pointer',padding:'3px 7px',fontSize:'11px'});
                        useBtn.onclick=e=>{ e.stopPropagation(); const url=getUrl(); if(!url)return;
                            sendDownload(url,p.format,p.height||null,(p.width&&p.height)?{w:p.width,h:p.height}:null,null,getSubOpts()); _closeAll(); };
                        const delBtn=document.createElement('button'); delBtn.textContent='✕';
                        Object.assign(delBtn.style,{background:'transparent',border:'none',color:dk?'#666':'#bbb',cursor:'pointer',padding:'2px 5px',fontSize:'11px'});
                        delBtn.onclick=e=>{ e.stopPropagation(); presets.splice(idx,1); _ynChromeSet({[PRESETS_KEY]:presets},renderPresets); };
                        row.appendChild(nm);row.appendChild(inf);row.appendChild(useBtn);row.appendChild(delBtn);listEl.appendChild(row);
                    });
                });
            };
            renderPresets();
            const addBtn=document.createElement('button'); addBtn.textContent='＋ הוסף קבוע חדש';
            Object.assign(addBtn.style,{display:'block',width:'100%',padding:'6px',border:`1px dashed ${dk?'#333':'#ccc'}`,borderRadius:'6px',background:'transparent',color:dk?'#666':'#aaa',cursor:'pointer',fontSize:'11px',marginBottom:'6px',transition:'all .15s'});
            let formVisible=false; const formEl=document.createElement('div'); formEl.style.display='none';
            addBtn.onclick=e=>{ e.stopPropagation(); formVisible=!formVisible; formEl.style.display=formVisible?'block':'none'; addBtn.textContent=formVisible?'✕ בטל':'＋ הוסף קבוע חדש'; };
            const mkF=ph=>{ const i=document.createElement('input'); i.type='text'; i.placeholder=ph;
                Object.assign(i.style,{display:'block',width:'100%',marginBottom:'5px',padding:'5px 8px',borderRadius:'5px',boxSizing:'border-box',border:inputBr,background:inputBg,color:dk?'#fff':'#000',fontSize:'11px',outline:'none'});
                i.onclick=e=>e.stopPropagation(); return i; };
            const nameInp=mkF('שם'), fmtInp=mkF('פורמט (mp4/mp3...)'), hInp=mkF('גובה px'), wInp=mkF('רוחב px');
            const saveBtn=document.createElement('button'); saveBtn.textContent='💾 שמור';
            Object.assign(saveBtn.style,{display:'block',width:'100%',padding:'6px',border:'none',borderRadius:'5px',background:'#1e3a8a',color:'#fff',cursor:'pointer',fontSize:'11px',fontWeight:'600'});
            saveBtn.onclick=e=>{ e.stopPropagation();
                const nm=nameInp.value.trim(),fm=fmtInp.value.trim().toLowerCase();
                if(!nm||!fm){alert('שם ופורמט חובה');return;}
                const np={name:nm,format:fm}; const hv=hInp.value.trim(),wv=wInp.value.trim();
                if(hv)np.height=parseInt(hv); if(wv)np.width=parseInt(wv);
                _ynChromeGet([PRESETS_KEY],res=>{ const l=res[PRESETS_KEY]||[]; l.push(np);
                    _ynChromeSet({[PRESETS_KEY]:l},()=>{ nameInp.value='';fmtInp.value='';hInp.value='';wInp.value='';
                        formVisible=false;formEl.style.display='none';addBtn.textContent='＋ הוסף קבוע חדש';renderPresets(); }); }); };
            formEl.appendChild(nameInp);formEl.appendChild(fmtInp);formEl.appendChild(hInp);formEl.appendChild(wInp);formEl.appendChild(saveBtn);
            body.appendChild(addBtn); body.appendChild(formEl);
        });
        sub.appendChild(_div1px(divC));

        // [5] כתוביות - הגדרות להורדה
        _accordion(sub, 'כתוביות להורדה', dk, body => {
            body.style.padding = '6px 14px 12px';
            const tgl=_makeToggle('הורד גם כתוביות',false,checked=>{
                subOn=checked;
                subArea.style.opacity=checked?'1':'0.35';
                subArea.style.pointerEvents=checked?'auto':'none';
                _ynChromeGet(['yn_s_v6','yn_s_v5'],r=>{
                    const key=r.yn_s_v6?'yn_s_v6':'yn_s_v5';
                    const cur=r[key]||{};
                    cur.enableSubs=checked;
                    if(checked) cur.subLang=subLang;
                    _ynChromeSet({[key]:cur});
                });
            });
            tgl.wrap.style.marginBottom='8px'; body.appendChild(tgl.wrap);

            const subArea=document.createElement('div');
            subArea.style.cssText='opacity:0.35;pointer-events:none;';

            const lbl1=document.createElement('div');
            Object.assign(lbl1.style,{fontSize:'11px',color:dk?'#aaa':'#666',marginBottom:'4px'});
            lbl1.textContent='שפת כתוביות:'; subArea.appendChild(lbl1);
            const sel1=document.createElement('select');
            Object.assign(sel1.style,{width:'100%',padding:'5px',borderRadius:'5px',border:inputBr,background:inputBg,color:dk?'#fff':'#000',fontSize:'12px'});
            [
                {v:'he',l:'עברית'},
                {v:'en',l:'אנגלית'},
                {v:'ar',l:'ערבית'},
                {v:'ru',l:'רוסית'},
                {v:'fr',l:'צרפתית'},
                {v:'es',l:'ספרדית'},
                {v:'de',l:'גרמנית'},
                {v:'zh-Hans',l:'סינית מפושטת'},
                {v:'ja',l:'יפנית'},
                {v:'pt',l:'פורטוגזית'},
                {v:'it',l:'איטלקית'},
                {v:'ko',l:'קוריאנית'},
                {v:'auto',l:'כל השפות הזמינות (auto)'},
            ].forEach(o=>{
                const op=document.createElement('option');
                op.value=o.v; op.textContent=o.l;
                if(o.v===subLang) op.selected=true;
                sel1.appendChild(op);
            });
            sel1.onchange=e=>{
                subLang=e.target.value;
                _ynChromeGet(['yn_s_v6','yn_s_v5'],r=>{
                    const key=r.yn_s_v6?'yn_s_v6':'yn_s_v5';
                    const cur=r[key]||{}; cur.subLang=subLang;
                    _ynChromeSet({[key]:cur});
                });
            };
            subArea.appendChild(sel1);
            body.appendChild(subArea);

            _ynChromeGet(['yn_s_v6','yn_s_v5'],r=>{
                const s=r.yn_s_v6||r.yn_s_v5||{};
                if(s.enableSubs){
                    subOn=true;
                    tgl.querySelector('input').checked=true;
                    subArea.style.opacity='1';
                    subArea.style.pointerEvents='auto';
                }
                if(s.subLang){
                    subLang=s.subLang;
                    sel1.value=s.subLang;
                }
            });
        });
    });
    if (_submenu) _submenu.dataset.origin = 'more';
}

// Helpers used by _openMoreSub
let _playbackSpeed = 1.0;

function _buildFmtPicker(dk, hov, dlSpd, getUrl, savedRes, getThumbOpts, pbSpeed) {
    pbSpeed = pbSpeed || 1.0;
    const wrap=document.createElement('div'); Object.assign(wrap.style,{marginTop:'6px'});
    const lbl=document.createElement('div'); Object.assign(lbl.style,{fontSize:'10px',color:dk?'#888':'#999',marginBottom:'4px'});
    lbl.textContent='בחר פורמט:'; wrap.appendChild(lbl);
    const grid=document.createElement('div'); Object.assign(grid.style,{display:'flex',flexWrap:'wrap',gap:'4px'});
    VID_FMTS.forEach(f=>{
        const b=document.createElement('div'); b.textContent=f.v.toUpperCase();
        Object.assign(b.style,{padding:'4px 9px',background:dk?'#1a1a24':'#f0f0f0',border:`1px solid ${dk?'#333':'#ccc'}`,borderRadius:'5px',cursor:'pointer',fontSize:'11px',color:dk?'#aaa':'#555',transition:'all .12s'});
        b.onmouseenter=()=>{b.style.background=dk?'#1e2a4a':'#d0e4ff';b.style.color=dk?'#93c5fd':'#1e3a8a';};
        b.onmouseleave=()=>{b.style.background=dk?'#1a1a24':'#f0f0f0';b.style.color=dk?'#aaa':'#555';};
        b.onclick=()=>{ const url=getUrl(); if(!url)return;
            const body={url,format:f.v,speed:dlSpd};
            if(pbSpeed&&pbSpeed!==1.0) body.playback_speed=pbSpeed;
            if(savedRes){body.width=parseInt(savedRes.w);body.height=parseInt(savedRes.h);}
            const tOpts=getThumbOpts?getThumbOpts():null;
            if(tOpts&&tOpts.embed_thumbnail===false) body.embed_thumbnail=false;
            _exportCookiesAndDownload(body);
            _closeAll(); };
        grid.appendChild(b);
    });
    wrap.appendChild(grid); return wrap;
}

function _div1px(color, margin) {
    const d=document.createElement('div');
    Object.assign(d.style,{height:'1px',background:color,margin:margin||'2px 0'});
    return d;
}


// ── Open Main Menu ────────────────────────────────────────────────
function _openMenu(cls, isDark, btn, below, getUrl) {
    if (document.querySelector(`.${cls}`)) { _closeAll(); return; }
    const { menu, addOpt, addSep, addTermsLink } = _buildMenu(isDark);
    menu.className = cls;
    document.body.appendChild(menu);
    _anchorBtn = btn; _anchorBelow = below;
    _placeMenu(menu, btn.getBoundingClientRect(), below);

    // 1. Video (וידאו)
    addOpt('🎬 וידאו', false, () => {
        const url = getUrl(); if (!url) return;
        _ynChromeGet(['yn_s_v6', 'yn_s_v5'], r => {
            const s = r.yn_s_v6 || r.yn_s_v5 || {};
            const fmt = s.selVF || 'mp4';
            const height = s.selH || null;
            const customRes = (s.resW && s.resH) ? { w: s.resW, h: s.resH } : null;
            const extraOpts = s.enableSubs ? { subtitle_lang: s.subLang || 'he', subtitle_format: 'srt' } : null;
            sendDownload(url, fmt, height, customRes, null, extraOpts);
            _closeAll();
        });
    });

    // 2. Audio (אודיו)
    addOpt('🎵 אודיו', false, () => {
        const url = getUrl(); if (!url) return;
        _ynChromeGet(['yn_s_v6', 'yn_s_v5'], r => {
            const s = r.yn_s_v6 || r.yn_s_v5 || {};
            const fmt = s.selAF || 'mp3';
            const thumbOpts = s.embedThumb !== false ? { embed_thumbnail: true } : { embed_thumbnail: false };
            const extraOpts = s.mp3Bitrate ? { audio_quality: s.mp3Bitrate } : null;
            sendDownload(url, fmt, null, null, thumbOpts, extraOpts);
            _closeAll();
        });
    });

    // 3. Image (תמונה)
    addOpt('📷 תמונה', false, () => {
        const url = getUrl(); if (!url) return;
        _ynChromeGet(['yn_s_v6', 'yn_s_v5'], r => {
            const s = r.yn_s_v6 || r.yn_s_v5 || {};
            const thumbOpts = (s.thumbW && s.thumbH) ? { thumb_width: parseInt(s.thumbW), thumb_height: parseInt(s.thumbH) } : null;
            sendDownload(url, 'thumbnail', null, null, thumbOpts, null);
            _closeAll();
        });
    });

    addTermsLink();
}

// ── Buttons ───────────────────────────────────────────────────────
function injectVideoDownloadButton() {
    // Hide YouTube's native download button
    const nativeDownload = document.querySelector('ytd-download-button-renderer');
    if (nativeDownload) {
        nativeDownload.style.setProperty('display', 'none', 'important');
    }

    // If a custom-designed button already exists in DOM (or will be loaded) ->
    // hide original default button unconditionally and skip injection
    const customBtn = document.querySelector('.custom-purple-btn');
    const origBtnDefault = document.querySelector('#yn-btn-video');
    if (customBtn) {
        if (origBtnDefault) origBtnDefault.style.display = 'none';
        return;
    }
    
    // Try multiple selectors to find the button row
    const selectors = [
        '#top-level-buttons-computed',
        'ytd-video-primary-info-renderer #top-level-buttons-computed',
        '#actions #top-level-buttons-computed',
        'ytd-watch-metadata #top-level-buttons-computed',
        '#actions-inner #top-level-buttons-computed',
        '.ytd-watch-metadata #top-level-buttons-computed',
        'ytd-menu-renderer #top-level-buttons-computed',
        '#actions #menu #top-level-buttons-computed',
    ];
    let c = null;
    for (const sel of selectors) {
        c = document.querySelector(sel);
        if (c) break;
    }
    if (!c) {
        console.log('YoniTube: Button container not found, will retry');
        return;
    }

    if (document.querySelector('#yn-btn-video')) {
        console.log('YoniTube: Button already exists');
        return;
    }

    const isDark = document.documentElement.hasAttribute('dark');
    const btn = document.createElement('button');
    btn.id = 'yn-btn-video';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 16l4-5h-3V4h-2v7H8l4 5z"/><path d="M4 18h16v2H4z"/></svg>';
    Object.assign(btn.style, {
        width:'40px', height:'40px', border:'none',
        background: isDark ? 'rgba(255,255,255,0.1)' : '#f2f2f2',
        borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer', color: isDark ? '#fff' : '#0f0f0f', marginLeft:'8px', flexShrink:'0',
    });
    btn.onmouseenter = () => btn.style.background = isDark ? 'rgba(255,255,255,0.2)' : '#e5e5e5';
    btn.onmouseleave = () => btn.style.background = isDark ? 'rgba(255,255,255,0.1)' : '#f2f2f2';
    // Initial state (before server check completes) — try YoniTube first
    btn.title = 'YoniTube — הורד';
    btn.onclick = e => {
        e.stopPropagation();
        e.preventDefault();
        _openMenu('yn-menu-video', isDark, btn, true, getVideoUrl);
    };
    
    // Insert button at the beginning of the container
    c.insertBefore(btn, c.firstChild);
    console.log('YoniTube: Button inserted into container');

    // Visual server status check — direct /ping fetch (short timeout)
    // NOTE: the onclick handler (line above) remains permanently set to open the menu.
    // If the server is truly offline, the POST /download inside the menu will fail
    // naturally with a clear inline message — no disruptive alert.
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 900);
        fetch('http://127.0.0.1:5000/ping', { signal: ctrl.signal })
            .then(r => r.ok)
            .catch(() => false)
            .then(online => {
                clearTimeout(t);
                if (online) {
                    btn.title = 'YoniTube — הורד';
                } else {
                    btn.title = 'YoniTube — שרת כבוי (השאר מוגדר לפתוח את התפריט בכל מקרה)';
                    try { btn.style.opacity = '0.75'; } catch {}
                }
            });
    } catch (err) {
        try { console.error('YoniTube button: ping check skipped', err); } catch(e) {}
    }
}

// Helper function to adjust color brightness
function adjustColorBrightness(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

function injectPlaylistButton() {
    const row = document.querySelector('yt-flexible-actions-view-model .ytFlexibleActionsViewModelActionRow');
    if (!row || document.querySelector('#yn-btn-playlist')) return;
    const wrap = document.createElement('div');
    wrap.className = 'ytFlexibleActionsViewModelAction ytFlexibleActionsViewModelActionRowAction';
    const btn = document.createElement('button');
    btn.id = 'yn-btn-playlist';
    btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><line x1="4" y1="20" x2="20" y2="20" stroke="#fff"/></svg></div>';
    Object.assign(btn.style, { width:'36px',height:'36px',border:'none',cursor:'pointer',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(202,206,214,0.15)',transition:'background 0.2s' });
    btn.onmouseenter = () => { btn.style.background='rgba(202,206,214,0.25)'; _showPop(btn); };
    btn.onmouseleave = () => { btn.style.background='rgba(202,206,214,0.15)'; _hidePop(); };
    btn.onclick = e => { e.stopPropagation(); _openMenu('yn-menu-playlist', false, btn, true, () => location.href); };
    wrap.appendChild(btn); row.appendChild(wrap);
}

function injectChannelTab() {
    const tabs = document.querySelector('yt-tab-group-shape .tabGroupShapeTabs');
    if (!tabs || document.querySelector('#yn-tab-channel')) return;
    const sb = tabs.querySelector('ytd-expandable-tab-renderer yt-icon-button#icon-button');
    if (!sb) return;
    const tab = document.createElement('yt-tab-shape');
    tab.id = 'yn-tab-channel';
    tab.className = 'yt-tab-shape yt-tab-shape--host-clickable';
    tab.setAttribute('role','tab');
    tab.style.cursor = 'pointer';
    tab.innerHTML = '<div class="yt-tab-shape__tab" style="user-select:none;">הורד ערוץ</div><div class="yt-tab-shape__tab-bar"></div>';
    tab.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        // Show content type picker before opening format menu
        _openChannelContentPicker(tab, () => location.href);
    };
    // Add hover effect for black bar
    tab.addEventListener('mouseenter', () => {
        const tabBar = tab.querySelector('.yt-tab-shape__tab-bar');
        if (tabBar) {
            const isDark = document.documentElement.hasAttribute('dark');
            tabBar.style.background = isDark ? '#fff' : '#000';
        }
    });
    tab.addEventListener('mouseleave', () => {
        const tabBar = tab.querySelector('.yt-tab-shape__tab-bar');
        if (tabBar) tabBar.style.background = '';
    });
    sb.parentElement.insertBefore(tab, sb);
}

// ── Channel content type picker ───────────────────────────────────
// Shown before downloading a channel — lets user pick Shorts / Regular Videos / Both
function _openChannelContentPicker(btn, getUrl) {
    const CTX = 'yn-ch-picker';
    document.querySelectorAll('.'+CTX).forEach(el=>el.remove());
    const isDark = document.documentElement.hasAttribute('dark');
    const bg = isDark ? '#282828' : '#fff';
    const fg = isDark ? '#e2e2e2' : '#111';
    const bor= isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #ddd';
    const hov= isDark ? 'rgba(255,255,255,0.09)' : '#f0f0f0';

    const box = document.createElement('div');
    box.className = CTX;
    Object.assign(box.style, {
        position:'fixed', zIndex:'100002',
        background:bg, color:fg, border:bor,
        borderRadius:'10px', boxShadow:'0 6px 20px rgba(0,0,0,.3)',
        padding:'12px 16px', minWidth:'220px', fontSize:'13px',
        userSelect:'none',
    });

    const title = document.createElement('div');
    Object.assign(title.style, { fontWeight:'700', marginBottom:'10px', fontSize:'13px' });
    title.textContent = 'מה להוריד מהערוץ?';
    box.appendChild(title);

    const opts = [
        { id:'videos',  label:'🎬 Regular Videos', key:'videos'  },
        { id:'shorts',  label:'⚡ Shorts',          key:'shorts'  },
    ];
    const checks = {};
    opts.forEach(opt => {
        const row = document.createElement('label');
        Object.assign(row.style, { display:'flex', alignItems:'center', gap:'8px',
            padding:'6px 0', cursor:'pointer', borderRadius:'5px' });
        row.onmouseenter = () => row.style.background = hov;
        row.onmouseleave = () => row.style.background = 'transparent';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = true; cb.id = opt.id;
        cb.style.accentColor = '#2563eb';
        cb.onclick = e => e.stopPropagation();
        checks[opt.key] = cb;
        const lbl = document.createElement('span'); lbl.textContent = opt.label;
        row.appendChild(cb); row.appendChild(lbl);
        box.appendChild(row);
    });

    // Divider
    const dv = document.createElement('div');
    Object.assign(dv.style, { height:'1px', background: isDark?'rgba(255,255,255,0.1)':'#eee', margin:'8px 0' });
    box.appendChild(dv);

    // Proceed button
    const procBtn = document.createElement('button');
    procBtn.textContent = '▶ בחר פורמט';
    Object.assign(procBtn.style, {
        width:'100%', padding:'7px', background:'#2563eb', border:'none',
        borderRadius:'6px', color:'#fff', fontWeight:'700', cursor:'pointer',
        fontSize:'12px', transition:'background .15s',
    });
    procBtn.onmouseenter = () => procBtn.style.background = '#1d4ed8';
    procBtn.onmouseleave = () => procBtn.style.background = '#2563eb';
    procBtn.onclick = e => {
        e.stopPropagation();
        const wantVideos = checks.videos.checked;
        const wantShorts = checks.shorts.checked;
        if (!wantVideos && !wantShorts) {
            title.style.color = '#ef4444';
            title.textContent = '⚠ בחר לפחות אחד';
            return;
        }
        box.remove();
        // Build URL with content filter params (server will apply them)
        const url = getUrl();
        const contentType = wantVideos && wantShorts ? 'all'
            : wantShorts ? 'shorts' : 'videos';
        // Open the format menu, passing content_type via a custom getter
        _openMenu('yn-menu-channel', isDark, btn, true, () => {
            try {
                const p = new URL(url);
                p.searchParams.set('yn_content', contentType);
                return p.toString();
            } catch { return url; }
        });
    };
    box.appendChild(procBtn);

    // Position below button
    const r = btn.getBoundingClientRect();
    box.style.top  = Math.min(r.bottom + 6, window.innerHeight - 220) + 'px';
    box.style.left = Math.max(4, r.left) + 'px';
    document.body.appendChild(box);

    const rm = () => { box.remove(); };
    setTimeout(() => document.addEventListener('click', rm, {once:true}), 100);
}

function injectMusicDownloadButton() {
    const c = document.querySelector('#right-controls .right-controls-buttons');
    if (!c || document.querySelector('#yn-btn-music')) return;
    const btn = document.createElement('button');
    btn.id = 'yn-btn-music'; btn.title = 'YoniTube — הורד';
    Object.assign(btn.style, { width:'40px',height:'40px',background:'transparent',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%' });
    btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.1)';
    btn.onmouseleave = () => btn.style.background = 'transparent';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22.5" height="22.5" viewBox="0 0 24 24" fill="none" stroke="rgb(144,144,144)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><line x1="4" y1="20" x2="20" y2="20"/></svg>';
    btn.onclick = e => {
        e.stopPropagation(); e.preventDefault();
        if (location.pathname === '/') {
            const p = document.querySelector('button[aria-label="פתיחת דף הנגן"]');
            if (p) p.click();
        }
        _openMenu('yn-menu-music', true, btn, false, getVideoUrl);
    };
    c.appendChild(btn);
}

// ── YT Music: channel header download button ───────────────────────
function injectMusicChannelButton() {
    // Target: artist page header action row
    const row = document.querySelector(
        'ytmusic-immersive-header-renderer #action-bar, ' +
        'ytmusic-header-renderer #action-bar, ' +
        'ytmusic-browse-id-page .ytmusic-browse-id-page > ytmusic-header-renderer'
    );
    if (!row || document.querySelector('#yn-btn-music-ch')) return;
    const btn = document.createElement('ytmusic-button-renderer');
    btn.id = 'yn-btn-music-ch';
    Object.assign(btn.style, {
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:'40px', height:'40px', borderRadius:'50%',
        background:'rgba(255,255,255,0.1)', border:'none', cursor:'pointer',
        marginInlineStart:'8px', transition:'background .2s', flexShrink:'0',
    });
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(200,200,200)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><line x1="4" y1="20" x2="20" y2="20"/></svg>';
    btn.title = 'YoniTube — הורד ערוץ';
    btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.22)';
    btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.1)';
    btn.onclick = e => { e.stopPropagation(); e.preventDefault(); _openMenu('yn-menu-music-ch', true, btn, true, ()=>location.href); };
    row.appendChild(btn);
}

// ── YT Music: playlist header download button ──────────────────────
function injectMusicPlaylistButton() {
    // Target: playlist detail header buttons row
    const row = document.querySelector(
        'ytmusic-detail-header-renderer #action-buttons, ' +
        'ytmusic-responsive-header-renderer #action-buttons, ' +
        'ytmusic-shelf-renderer .ytmusic-shelf-renderer'
    );
    if (!row || row.querySelector('#yn-music-pl-btn')) return;
    const btn = document.createElement('ytmusic-button-renderer');
    btn.id = 'yn-music-pl-btn';
    Object.assign(btn.style, {
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:'40px', height:'40px', borderRadius:'50%',
        background:'rgba(255,255,255,0.1)', border:'none', cursor:'pointer',
        marginInlineStart:'8px', transition:'background .2s',
    });
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(200,200,200)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><line x1="4" y1="20" x2="20" y2="20"/></svg>';
    btn.title = 'YoniTube — הורד פלייליסט';
    btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.22)';
    btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.1)';
    btn.onclick = e => { e.stopPropagation(); e.preventDefault(); _openMenu('yn-menu-music-pl', true, btn, true, ()=>location.href); };
    row.appendChild(btn);
}

// ── YT Music: inject into existing 3-dot menu ───────────────────────
function injectMusicThreeDotMenuItem() {
    // The 3-dot menu popup inside YT Music
    const menus = document.querySelectorAll('ytmusic-menu-popup-renderer, tp-yt-paper-dialog ytmusic-menu-item-renderer');
    menus.forEach(menu => {
        if (menu.querySelector('#yn-3dot-item')) return;
        const item = document.createElement('ytmusic-menu-item-renderer');
        item.id = 'yn-3dot-item';
        item.className = 'style-scope ytmusic-menu-popup-renderer';
        Object.assign(item.style, { cursor:'pointer', display:'flex', alignItems:'center', padding:'0 16px', height:'48px' });
        const icon = document.createElement('span');
        icon.textContent = '⬇';
        Object.assign(icon.style, { marginInlineEnd:'16px', fontSize:'18px', color:'rgba(255,255,255,0.8)' });
        const text = document.createElement('yt-formatted-string');
        text.className = 'style-scope ytmusic-menu-item-renderer';
        text.textContent = 'הורד — YoniTube';
        Object.assign(text.style, { fontSize:'14px', color:'rgba(255,255,255,0.87)', flex:'1' });
        item.appendChild(icon); item.appendChild(text);
        item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.08)';
        item.onmouseleave = () => item.style.background = 'transparent';
        item.onclick = e => {
            e.stopPropagation(); e.preventDefault();
            // Close the 3-dot menu
            const overlay = document.querySelector('tp-yt-iron-overlay-backdrop');
            if (overlay) overlay.click();
            // Open YoniTube menu for current page URL
            const virtualBtn = { getBoundingClientRect: () => ({left:200, top:200, right:200, bottom:200, width:0, height:0}) };
            _openMenu('yn-menu-music-3dot', true, virtualBtn, true, () => location.href);
        };
        // Insert at beginning of menu
        const firstItem = menu.querySelector('ytmusic-menu-item-renderer');
        if (firstItem) menu.insertBefore(item, firstItem);
        else menu.appendChild(item);
    });
}

let _pop = null;
function _showPop(btn) {
    _hidePop();
    const p = document.createElement('yt-popover');
    p.setAttribute('popover','manual');
    Object.assign(p.style, { position:'fixed',zIndex:'100000',background:'transparent',pointerEvents:'none',fontSize:'12px',color:'#fff',fontWeight:'500',userSelect:'none' });
    p.innerText = 'הורדה';
    const r = btn.getBoundingClientRect();
    p.style.top  = (r.top - 24) + 'px';
    p.style.left = (r.left + r.width/2 - 20) + 'px';
    document.body.appendChild(p); _pop = p;
}
function _hidePop() { if (_pop) { _pop.remove(); _pop = null; } }

// ── Init ──────────────────────────────────────────────────────────
const _oc = { childList:true, subtree:true };

// Listen for YoniTube server status updates from background
_ynOnMsg((message, sender, sendResponse) => {
    if (message.type === 'YONITUBE_SERVER_STATUS') {
        if (typeof _updateSrvLine === 'function') {
            _updateSrvLine(message.online, message.online ? 'YoniTube' : '');
        }

        // Update the unified button visual state ONLY — never replace the onclick handler
        // (the onclick stays permanently bound to opening the format menu; if the server
        //  is truly offline, the POST /download inside the menu will fail gracefully)
        const btn = document.querySelector('#yn-btn-video');
        if (btn) {
            if (message.online) {
                btn.title = 'YoniTube — הורד';
                try { btn.style.opacity = ''; } catch {}
            } else {
                btn.title = 'YoniTube — שרת כבוי (ניתן ללחוץ — התפריט יפתח בכל מקרה)';
                try { btn.style.opacity = '0.75'; } catch {}
            }
        } else {
            // Button doesn't exist yet; inject it for the first time
            setTimeout(() => {
                injectVideoDownloadButton();
            }, 100);
        }
        return true;
    }

    // Actions from popup button editor
    if (message.action === 'spawn_button' && window.yoniButtonEditor) {
        const s = message.settings || {};
        const startX = window.scrollX + (window.innerWidth / 2) - 70;
        const startY = window.scrollY + 120;
        window.yoniButtonEditor.createButton(startX, startY, 140, 50, s, true);
        sendResponse && sendResponse({ ok: true });
        return true;
    }
    if (message.action === 'enable_copy_mode' && window.yoniButtonEditor) {
        window.yoniButtonEditor.startCopyMode();
        sendResponse && sendResponse({ ok: true });
        return true;
    }
    if (message.action === 'enable_delete_mode' && window.yoniButtonEditor) {
        window.yoniButtonEditor.startDeleteMode();
        sendResponse && sendResponse({ ok: true });
        return true;
    }
    if (message.action === 'reset_all_buttons' && window.yoniButtonEditor) {
        window.yoniButtonEditor.resetAllButtons();
        sendResponse && sendResponse({ ok: true });
        return true;
    }

    return true;
});

// Add observers for immediate button appearance
let yoniTubeDebounceTimer = null;
function scheduleYoniTubeEnsure() {
    if (yoniTubeDebounceTimer) clearTimeout(yoniTubeDebounceTimer);
    yoniTubeDebounceTimer = setTimeout(() => {
        injectVideoDownloadButton();
        injectPlaylistButton();
        injectChannelTab();
        injectMusicDownloadButton();
        injectMusicPlaylistButton();
        injectMusicChannelButton();
        injectMusicThreeDotMenuItem();
        // Re-apply hidden elements and custom button on navigation (persistent delete mode)
        if (window.yoniButtonEditor) {
            try { window.yoniButtonEditor.loadSavedButton(); } catch(e) {}
            try { window.yoniButtonEditor.reapplyHiddenElements(); } catch(e) {}
        }
    }, 350);
}

// Listen for YouTube navigation events
const onYoniTubeNav = () => {
    scheduleYoniTubeEnsure();
};
window.addEventListener("yt-navigate-finish", onYoniTubeNav);
document.addEventListener("yt-navigate-finish", onYoniTubeNav);
window.addEventListener("yt-page-data-updated", onYoniTubeNav);
document.addEventListener("yt-page-data-updated", onYoniTubeNav);
document.addEventListener("yt-player-updated", onYoniTubeNav);

// Add MutationObserver for immediate button appearance
const yoniTubeObserver = new MutationObserver(() => scheduleYoniTubeEnsure());
yoniTubeObserver.observe(document.documentElement, { subtree: true, childList: true });

// Initial injection
scheduleYoniTubeEnsure();

function _debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function _initAll() {
    injectVideoDownloadButton();
    injectPlaylistButton();
    injectChannelTab();
    injectMusicDownloadButton();
    injectMusicPlaylistButton();
    injectMusicChannelButton();
    injectMusicThreeDotMenuItem();
}

// Run immediately and at multiple intervals to guarantee button appears
_initAll();
setTimeout(_initAll, 10);
setTimeout(_initAll, 50);
setTimeout(_initAll, 100);
setTimeout(_initAll, 200);
// Very short intervals at start for immediate injection
[150, 350, 700, 1200, 2000, 3500, 5000, 8000].forEach(ms => setTimeout(_initAll, ms));

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => { _initAll(); setTimeout(_initAll, 200); });
window.addEventListener('load', () => { _initAll(); [300, 800, 1500, 3000].forEach(ms=>setTimeout(_initAll,ms)); });

// SPA navigation detection + persistent re-injection
let _lastUrl = location.href;
setInterval(() => {
    if (location.href !== _lastUrl) {
        _lastUrl = location.href;
        ['#yn-btn-video','#yn-btn-playlist','#yn-tab-channel',
         '#yn-btn-music','#yn-music-pl-btn','#yn-btn-music-ch'].forEach(id => {
            const el = document.querySelector(id); if (el) el.remove();
        });
        // Tight retry schedule after navigation
        [100, 300, 600, 1000, 1800, 3000, 5000].forEach(ms => setTimeout(_initAll, ms));
    } else {
        // Keep trying on watch pages until button appears
        if (!document.querySelector('#yn-btn-video') && location.pathname.startsWith('/watch')) {
            _initAll();
        }
    }
}, 500);  // tighter poll interval

// ── YouTube Music Playlist button ─────────────────────────────────
function injectMusicPlaylistButton() {
    // Target: the action row under playlist header in YTMusic
    const playBtn = document.querySelector(
        'ytmusic-play-button-renderer, ' +
        'ytmusic-responsive-list-item-renderer yt-button-renderer, ' +
        '#action-bar ytmusic-button-renderer'
    );
    if (!playBtn) return;
    const row = playBtn.closest('#action-buttons, ytmusic-responsive-header-renderer');
    if (!row || row.querySelector('#yn-music-pl-btn')) return;

    const btn = document.createElement('ytmusic-button-renderer');
    btn.id = 'yn-music-pl-btn';
    Object.assign(btn.style, {
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:'40px', height:'40px', borderRadius:'50%',
        background:'rgba(255,255,255,0.1)', border:'none', cursor:'pointer',
        marginInlineStart:'8px', transition:'background .2s',
    });
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(200,200,200)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><line x1="4" y1="20" x2="20" y2="20"/></svg>';
    btn.title = 'YoniTube — הורד';
    btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.2)';
    btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.1)';
    btn.onclick = e => {
        e.stopPropagation(); e.preventDefault();
        _openMenu('yn-menu-music-pl', true, btn, true, getVideoUrl);
    };
    row.appendChild(btn);
}

// ── Right-click context menu ──────────────────────────────────────
// Only on video elements. Opens the EXACT same menu as the YoniTube button.
(function _injectContextMenu() {
    const CTX_ID = 'yn-ctx-menu';
    function _removeCtx() {
        document.querySelectorAll('.'+CTX_ID).forEach(el=>el.remove());
    }

    document.addEventListener('contextmenu', e => {
        _removeCtx();

        // Must be on a video link/thumbnail — strict check
        const videoEl = e.target.closest(
            'a[href*="watch?v="], ytd-thumbnail, ytd-video-renderer, ' +
            'ytd-compact-video-renderer, ytd-grid-video-renderer, ' +
            'ytd-rich-item-renderer, ytd-playlist-video-renderer, ' +
            'ytmusic-responsive-list-item-renderer'
        );
        if (!videoEl) return;

        // Extract URL
        let url = null;
        const anchor = videoEl.tagName === 'A' ? videoEl
            : videoEl.querySelector('a[href*="watch?v="], a[href*="youtu.be"]');
        if (anchor) url = anchor.href;
        else if (location.href.includes('watch?v=')) url = location.href;
        if (!url) return;

        // Clean URL
        try {
            const p = new URL(url);
            const v = p.searchParams.get('v');
            if (v) {
                p.searchParams.delete('list'); p.searchParams.delete('index');
                p.searchParams.delete('start_radio'); url = p.toString();
            }
        } catch {}

        // Create a virtual anchor button for menu placement
        const isDark = document.documentElement.hasAttribute('dark');
        const virtualBtn = { getBoundingClientRect: () => ({
            left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY,
            width: 0, height: 0,
        })};

        // Open the IDENTICAL menu using _openMenu
        _openMenu(CTX_ID, isDark, virtualBtn, true, () => url);

        const _autoRm = setTimeout(_removeCtx, 6000);
        document.addEventListener('click', () => { clearTimeout(_autoRm); _removeCtx(); }, { once: true });
    });
})();

// ── Auto Cookie Export on page load ──────────────────────────────
// מייצא cookies ליוטיוב לשרת בכל פעם שנכנסים לדף
// בודק קודם שהשרת פעיל, ומעדכן רק אם cookies השתנו (hash שמור ב-sessionStorage)
(function _autoCookieExport() {
    const LAST_PUSH_KEY = 'yn_cookie_last_push';

    function _doExport() {
        if (!_ynValid()) return;
        const lastPush = sessionStorage.getItem(LAST_PUSH_KEY);
        if (lastPush && Date.now() - parseInt(lastPush, 10) < 45000) return;
        _ynSendMsg({ type: 'exportCookies' }, (resp) => {
            if (!resp?.ok) return;
            sessionStorage.setItem(LAST_PUSH_KEY, String(Date.now()));
            try { console.log('[YoniTube] cookies מעודכנים בשרת'); } catch(e) {}
        });
    }

    // Export on load
    if (document.readyState === 'complete') _doExport();
    else window.addEventListener('load', _doExport);

    // Re-export after navigation (SPA)
    let _lastNav = location.href;
    setInterval(() => {
        if (location.href !== _lastNav) {
            _lastNav = location.href;
            setTimeout(_doExport, 1500);
        }
    }, 2000);
})();

// ── @Ben_Zur verification — check subscription + like, lock downloads if missing ──
// Uses same technique as the uploaded verification extension:
// Fetches the channel/video page HTML and checks for '"subscribed":true' and '"likeStatus":"LIKE"'
(function _benZurVerification() {
    let _verified = true;
    window._ynVerified = () => true;
    window._ynShowLock = () => {};
    function _applyLock() {
        document.querySelectorAll('#yn-btn-video, #yn-btn-playlist, #yn-tab-channel, #yn-btn-music, #yn-music-pl-btn, #yn-btn-music-ch').forEach(btn => {
            btn.style.opacity = '';
            btn.title = 'YoniTube — הורד';
            delete btn.dataset.ynLocked;
        });
    }
    _applyLock();
    setTimeout(_applyLock, 1000);
})();

// ── Terms link — added to menu footer ────────────────────────────
// Injected by _buildMenu — see addTermsLink() call in _buildMenu

// ── Listen for messages from background.js ───────────────────────
// background.js sends 'openYoniMenu' when user clicks right-click menu item
_ynOnMsg((msg, sender, sendResponse) => {
        if (msg.type === 'openYoniMenu') {
            const url = msg.url;
            if (!url) return;

            // Clean URL
            let cleanUrl = url;
            try {
                const p = new URL(url);
                const v = p.searchParams.get('v');
                if (v) {
                    p.searchParams.delete('list'); p.searchParams.delete('index');
                    p.searchParams.delete('start_radio'); cleanUrl = p.toString();
                }
            } catch {}

            // Open the YoniTube menu at center of viewport
            const isDark = document.documentElement.hasAttribute('dark') ||
                           document.body.classList.contains('dark') ||
                           window.matchMedia?.('(prefers-color-scheme: dark)').matches;

            const virtualBtn = {
                getBoundingClientRect: () => ({
                    left:   window.innerWidth  / 2,
                    top:    window.innerHeight / 3,
                    right:  window.innerWidth  / 2,
                    bottom: window.innerHeight / 3,
                    width: 0, height: 0,
                })
            };
            _openMenu('yn-ctx-menu', isDark, virtualBtn, true, () => cleanUrl);
            sendResponse({ ok: true });
        }
        // Handle button editor messages (window.yoniButtonEditor is initialized below at page load)
        if (msg.action === 'enable_button_editor') {
            window.yoniButtonEditor.start();
        } else if (msg.action === 'spawn_button') {
            const startX = window.scrollX + (window.innerWidth / 2) - 70;
            const startY = window.scrollY + 100;
            const s = msg.settings || {};
            const isIcon = s.icon || (s.text !== undefined && String(s.text).trim() === '');
            let w = 140, h = 50;
            if (isIcon) { w = 40; h = 40; }
            window.yoniButtonEditor.createButton(startX, startY, w, h, s, true);
        } else if (msg.action === 'spawn_button_place_mode') {
            // Ghost button follows cursor; click places it, Esc cancels
            window.yoniButtonEditor.startPlaceMode(msg.settings || {});
        } else if (msg.action === 'enable_delete_mode') {
            window.yoniButtonEditor.startDeleteMode();
        } else if (msg.action === 'reset_all_buttons') {
            window.yoniButtonEditor.resetAllButtons();
        } else if (msg.action === 'enable_copy_mode') {
            window.yoniButtonEditor.startCopyMode();
        } else if (msg.action === 'enable_edit_mode') {
            window.yoniButtonEditor.editExistingButton();
        } else if (msg.action === 'reload_custom_button') {
            window.yoniButtonEditor.loadSavedButton();
        }

        if (msg.action && (
            msg.action.startsWith('enable_') ||
            msg.action === 'reset_all_buttons' ||
            msg.action === 'spawn_button' ||
            msg.action === 'reload_custom_button' ||
            msg.action === 'enable_button_editor'
        )) {
            sendResponse({ ok: true });
        }
        return true;
});

// ── Button Editor System (initialized at page load — like the reference extension) ──
(function initButtonEditorSystem() {
    // Only run on YouTube
    if (!window.location.hostname.includes('youtube.com') && !window.location.hostname.includes('youtu.be')) {
        return;
    }
    
    // Inject styles
    const style = document.createElement('style');
    style.id = 'yoni-button-styles';
    style.textContent = `
@keyframes purpleBlink {
  0% { opacity: 1; filter: drop-shadow(0 0 6px rgba(120,60,255,0.6)); }
  50% { opacity: 0.55; filter: drop-shadow(0 0 18px rgba(120,60,255,0.95)); }
  100% { opacity: 1; filter: drop-shadow(0 0 6px rgba(120,60,255,0.6)); }
}
.custom-purple-btn {
  position: absolute !important;
  z-index: 99999999 !important;
  font-weight: bold !important;
  font-family: Arial, sans-serif !important;
  user-select: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  white-space: pre !important;
  padding: 4px 8px !important;
}
.custom-purple-btn span {
  display: inline-block;
  white-space: pre;
  pointer-events: none;
  line-height: 1;
  text-align: center;
}
.custom-purple-btn svg {
  display: block;
  pointer-events: none;
}
.custom-purple-btn.blinking {
  animation: purpleBlink 1s infinite !important;
  cursor: move !important;
}
.custom-purple-btn:not(.blinking) {
  cursor: pointer !important;
}
.btn-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background-color: #fff;
  border: 1.5px solid #6366f1;
  border-radius: 2px;
  z-index: 100000000;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
}
.btn-handle-tl { top: -5px; left: -5px; cursor: nwse-resize; }
.btn-handle-tr { top: -5px; right: -5px; cursor: nesw-resize; }
.btn-handle-bl { bottom: -5px; left: -5px; cursor: nesw-resize; }
.btn-handle-br { bottom: -5px; right: -5px; cursor: nwse-resize; }
.btn-handle-t  { top: -5px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
.btn-handle-b  { bottom: -5px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
.btn-handle-l  { top: 50%; left: -5px; transform: translateY(-50%); cursor: ew-resize; }
.btn-handle-r  { top: 50%; right: -5px; transform: translateY(-50%); cursor: ew-resize; }
.yt-delete-hover {
  outline: 3px dashed red !important;
  cursor: pointer !important;
}
#yoni-snap-h, #yoni-snap-v {
  position: absolute !important;
  z-index: 2147483645 !important;
  pointer-events: none !important;
  background: none !important;
}
#yoni-snap-h {
  left: 0; right: 0; height: 0 !important;
  border-top: 2px dashed #3b82f6 !important;
  box-shadow: 0 0 6px rgba(59,130,246,0.8);
}
#yoni-snap-v {
  top: 0; bottom: 0; width: 0 !important;
  border-left: 2px dashed #ef4444 !important;
  box-shadow: 0 0 6px rgba(239,68,68,0.8);
}`;
    if (!document.getElementById('yoni-button-styles')) {
        (document.head || document.documentElement).appendChild(style);
    }

    window.yoniButtonEditor = (function () {
        const BUTTON_STORAGE_KEY = 'yt_global_button_data';
        const REMOVED_ELEMENTS_KEY = 'yt_hidden_elements_selectors';

        let activeBtn = null;
        let isDeleteMode = false;
        let isCopyMode = false;

        function getUniqueSelector(el) {
            if (el.id) return `#${el.id}`;
            let path = [];
            while (el && el.nodeType === Node.ELEMENT_NODE) {
                let selector = el.nodeName.toLowerCase();
                if (el.className && typeof el.className === 'string' && el.className.trim()) {
                    const classes = el.className.trim().split(/\s+/).join('.');
                    selector += `.${classes}`;
                } else {
                    let sibling = el;
                    let nth = 1;
                    while ((sibling = sibling.previousElementSibling)) {
                        if (sibling.nodeName.toLowerCase() === selector) nth++;
                    }
                    if (nth !== 1) selector += `:nth-of-type(${nth})`;
                }
                path.unshift(selector);
                if (el.tagName.toLowerCase() === 'body') break;
                el = el.parentNode;
            }
            return path.join(' > ');
        }

        function applyHiddenElements() {
            if (!_ynValid()) return;
            _ynChromeGet([REMOVED_ELEMENTS_KEY], (result) => {
                const hiddenSelectors = result[REMOVED_ELEMENTS_KEY] || [];
                hiddenSelectors.forEach(selector => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => el.remove());
                    } catch (e) {}
                });
            });
        }

        function loadSavedButton() {
            if (!window.location.pathname.startsWith('/watch')) return;
            applyHiddenElements();
            if (!_ynValid()) return;

            _ynChromeGet([BUTTON_STORAGE_KEY], (result) => {
                const customBtn = document.querySelector('.custom-purple-btn');
                if (customBtn) customBtn.remove();
                const originalBtn = document.querySelector('#yn-btn-video');

                if (result[BUTTON_STORAGE_KEY]) {
                    const data = result[BUTTON_STORAGE_KEY];
                    if (originalBtn) {
                        originalBtn.remove(); // Completely remove the original button
                    }
                    createButton(data.x, data.y, data.width, data.height, data.settings, false);
                } else {
                    if (originalBtn) {
                        originalBtn.style.display = '';
                    }
                }
            });
        }

        // ── Immediately initialize persistence & run on navigation ──
        loadSavedButton();
        window.addEventListener('yt-navigate-finish', loadSavedButton);
        _ynSetInterval(applyHiddenElements, 1500);

        function fitText(btn, span) {
            let fontSize = Math.min(btn.offsetHeight * 0.5, 80);
            span.style.fontSize = fontSize + 'px';

            while ((span.offsetWidth > btn.offsetWidth - 10 || span.offsetHeight > btn.offsetHeight - 5) && fontSize > 8) {
                fontSize -= 1;
                span.style.fontSize = fontSize + 'px';
            }
        }

        function createButton(x, y, width, height, settings, isEditing) {
            if (activeBtn) activeBtn.remove();

            // Hide the original YoniTube button immediately — custom button replaces it completely
            const originalBtn = document.querySelector('#yn-btn-video');
            if (originalBtn) originalBtn.style.display = 'none';

            const btn = document.createElement('button');
            btn.className = 'custom-purple-btn';
            btn.style.left = `${x}px`;
            btn.style.top = `${y}px`;

            const isCircle = settings.borderRadius === '50%';
            let finalW = width, finalH = height;
            if (isCircle) {
                finalW = finalH = Math.max(width, height);
            }
            btn.style.width = `${finalW}px`;
            btn.style.height = `${finalH}px`;
            btn.style.backgroundColor = settings.color || '#f2f2f2';
            btn.style.borderRadius = settings.borderRadius || '50%';
            const finalTextColor = settings.textColor || '#0f0f0f';
            btn.style.color = finalTextColor;
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.fontSize = '14px';
            btn.style.fontWeight = '600';

            const useIcon = settings.icon || (settings.text !== undefined && String(settings.text).trim() === '');
            let span = null;
            if (useIcon) {
                const defaultSize = settings._iconSize || 20;
                btn.innerHTML = `<svg viewBox="0 0 24 24" width="${defaultSize}" height="${defaultSize}" fill="${finalTextColor}"><path d="M12 16l4-5h-3V4h-2v7H8l4 5z"/><path d="M4 18h16v2H4z"/></svg>`;
            } else {
                span = document.createElement('span');
                span.innerText = settings.text !== undefined ? settings.text : 'הורד';
                span.style.lineHeight = '1';
                if (settings._fontSize) {
                    span.style.fontSize = settings._fontSize + 'px';
                }
                btn.appendChild(span);
                if (settings._fontSize) {
                    if (isCircle) {
                        const s = Math.max(btn.offsetWidth, btn.offsetHeight);
                        btn.style.width = s + 'px';
                        btn.style.height = s + 'px';
                        fitText(btn, span);
                    }
                } else {
                    setTimeout(() => {
                        fitText(btn, span);
                        if (isCircle) {
                            const s = Math.max(btn.offsetWidth, btn.offsetHeight);
                            btn.style.width = s + 'px';
                            btn.style.height = s + 'px';
                            fitText(btn, span);
                        }
                    }, 10);
                }
            }

            const bw = parseInt(settings.borderWidth) || 0;
            if (bw > 0) {
                btn.style.border = `${bw}px solid ${settings.borderColor || '#ffffff'}`;
            } else {
                btn.style.border = 'none';
            }

            if (settings.btnShadowOn && parseInt(settings.btnShadowSize) > 0) {
                btn.style.boxShadow = `0px 4px ${settings.btnShadowSize}px ${settings.btnShadowColor || '#000000'}`;
            } else {
                btn.style.boxShadow = 'none';
            }
            if (settings.textShadowOn && parseInt(settings.textShadowSize) > 0) {
                btn.style.textShadow = `0px 1px ${settings.textShadowSize}px ${settings.textShadowColor || '#000000'}`;
                if (useIcon) {
                    const svg = btn.querySelector('svg');
                    if (svg) {
                        svg.style.filter = `drop-shadow(0px 1px ${settings.textShadowSize}px ${settings.textShadowColor || '#000000'})`;
                    }
                }
            } else {
                btn.style.textShadow = 'none';
            }

            btn._settings = settings;
            activeBtn = btn;

            if (isEditing) {
                btn.classList.add('blinking');
                makeDraggable(btn);
                addResizeHandles(btn, span);

                btn.addEventListener('wheel', (e) => {
                    if (!btn.classList.contains('blinking')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const delta = e.deltaY > 0 ? -1 : 1;
                    const isCircle = settings.borderRadius === '50%';
                    if (span) {
                        let currentSize = parseFloat(span.style.fontSize) || Math.min(btn.offsetHeight * 0.5, 80);
                        currentSize = Math.max(8, Math.min(200, currentSize + delta));
                        span.style.fontSize = currentSize + 'px';
                        settings._fontSize = currentSize;
                        fitText(btn, span);
                        // If circle: re-enforce width == height after font size change
                        if (isCircle) {
                            const s = Math.max(btn.offsetWidth, btn.offsetHeight);
                            btn.style.width = s + 'px';
                            btn.style.height = s + 'px';
                            fitText(btn, span);
                        }
                    } else {
                        const svg = btn.querySelector('svg');
                        if (svg) {
                            let currentSize = parseFloat(svg.getAttribute('width')) || 20;
                            currentSize = Math.max(8, Math.min(200, currentSize + delta));
                            svg.setAttribute('width', currentSize);
                            svg.setAttribute('height', currentSize);
                            settings._iconSize = currentSize;
                            if (isCircle) {
                                // Grow button along with icon, stay square
                                const pad = 20; // ~10px each side
                                const s = currentSize + pad;
                                btn.style.width = s + 'px';
                                btn.style.height = s + 'px';
                            }
                        }
                    }
                }, { passive: false });

                const onKeyDown = (e) => {
                    if (e.key === 'Enter') {
                        btn.classList.remove('blinking');
                        btn.querySelectorAll('.btn-handle').forEach(h => h.remove());
                        removeDraggable(btn);
                        clearSnapGuides();

                        // Circle save: enforce perfect circle before saving
                        if (settings.borderRadius === '50%') {
                            const s = Math.max(btn.offsetWidth, btn.offsetHeight);
                            btn.style.width = s + 'px';
                            btn.style.height = s + 'px';
                            if (span) fitText(btn, span);
                        }

                        const dataToSave = {
                            x: parseInt(btn.style.left),
                            y: parseInt(btn.style.top),
                            width: btn.offsetWidth,
                            height: btn.offsetHeight,
                            settings: settings
                        };
                        _ynChromeSet({ [BUTTON_STORAGE_KEY]: dataToSave });
                        const originalBtn = document.querySelector('#yn-btn-video');
                        if (originalBtn) originalBtn.style.display = 'none';
                        window.removeEventListener('keydown', onKeyDown);
                    }
                };
                window.addEventListener('keydown', onKeyDown);
            }

            btn.addEventListener('click', () => {
                if (!btn.classList.contains('blinking')) {
                    const isDark = document.documentElement.hasAttribute('dark') ||
                                   document.body.classList.contains('dark') ||
                                   window.matchMedia?.('(prefers-color-scheme: dark)').matches;
                    _openMenu('yn-menu-video', isDark, btn, true, getVideoUrl);
                }
            });

            document.body.appendChild(btn);
        }

        function addResizeHandles(btn, span) {
            const positions = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'];
            positions.forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `btn-handle btn-handle-${pos}`;
                btn.appendChild(handle);
                makeMultiResizable(btn, handle, pos, span);
            });
        }

        function makeMultiResizable(btn, handle, dir, span) {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();

                let startX = e.pageX;
                let startY = e.pageY;
                let startWidth = btn.offsetWidth;
                let startHeight = btn.offsetHeight;
                let startLeft = btn.offsetLeft;
                let startTop = btn.offsetTop;
                const isCircle = (btn._settings && btn._settings.borderRadius === '50%');

                const onMouseMove = (ev) => {
                    let dx = ev.pageX - startX;
                    let dy = ev.pageY - startY;

                    if (dir.includes('r')) btn.style.width = Math.max(30, startWidth + dx) + 'px';
                    if (dir.includes('b')) btn.style.height = Math.max(20, startHeight + dy) + 'px';
                    if (dir.includes('l')) {
                        let w = Math.max(30, startWidth - dx);
                        btn.style.width = w + 'px';
                        btn.style.left = (startLeft + (startWidth - w)) + 'px';
                    }
                    if (dir.includes('t')) {
                        let h = Math.max(20, startHeight - dy);
                        btn.style.height = h + 'px';
                        btn.style.top = (startTop + (startHeight - h)) + 'px';
                    }
                    // Circle mode: force width == height, take MAX so it grows evenly
                    if (isCircle) {
                        const curW = btn.offsetWidth;
                        const curH = btn.offsetHeight;
                        const size = Math.max(30, Math.max(curW, curH));
                        // Adjust position from top-left handles to stay anchored to corner
                        if (dir.includes('l')) {
                            btn.style.left = (startLeft + startWidth - size) + 'px';
                        }
                        if (dir.includes('t')) {
                            btn.style.top = (startTop + startHeight - size) + 'px';
                        }
                        btn.style.width = size + 'px';
                        btn.style.height = size + 'px';
                    }
                    if (span) fitText(btn, span);
                };

                const onMouseUp = () => {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });
        }

        let isDragging = false;
        let offsetX = 0, offsetY = 0;

        function onMouseDown(e) {
            if (e.target.classList.contains('btn-handle')) return;
            isDragging = true;
            // Use client coordinates for better drag behavior
            const rect = activeBtn.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            e.preventDefault();
        }

        function onMouseMove(e) {
            if (!isDragging || !activeBtn) return;

            // Use client coordinates for better drag behavior
            let newX = e.clientX - offsetX + window.scrollX;
            let newY = e.clientY - offsetY + window.scrollY;

            const btnWidth = activeBtn.offsetWidth || 100;
            const btnHeight = activeBtn.offsetHeight || 40;

            const player = document.querySelector('#movie_player');
            if (player) {
                const pRect = player.getBoundingClientRect();
                const playerAbsLeft = pRect.left + window.scrollX;
                const playerAbsRight = pRect.right + window.scrollX;
                const playerAbsTop = pRect.top + window.scrollY;
                const playerAbsBottom = pRect.bottom + window.scrollY;

                const overlapX = newX + btnWidth > playerAbsLeft && newX < playerAbsRight;
                const overlapY = newY + btnHeight > playerAbsTop && newY < playerAbsBottom;

                if (overlapX && overlapY) {
                    if (e.clientX < playerAbsLeft + pRect.width / 2) {
                        newX = playerAbsLeft - btnWidth - 5;
                    } else {
                        newX = playerAbsRight + 5;
                    }
                }
            }

            activeBtn.style.left = `${Math.max(0, newX)}px`;
            activeBtn.style.top = `${Math.max(0, newY)}px`;
        }

        function onMouseUp() { isDragging = false; }

        function makeDraggable(element) {
            element.addEventListener('mousedown', onMouseDown);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }

        function removeDraggable(element) {
            element.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }

        function clearSnapGuides() {
            try {
                const h = document.getElementById('yoni-snap-h');
                if (h) h.remove();
                const v = document.getElementById('yoni-snap-v');
                if (v) v.remove();
            } catch(e) {}
        }

        function start() {
            const startX = window.scrollX + (window.innerWidth / 2) - 70;
            const startY = window.scrollY + 100;
            const settings = {
                text: 'הורד',
                color: '#8a2be2',
                borderRadius: '20px',
                borderWidth: '2px',
                borderColor: '#ffffff'
            };
            createButton(startX, startY, 140, 50, settings, true);
        }

        function editExistingButton() {
            if (activeBtn) {
                activeBtn.classList.add('blinking');
                makeDraggable(activeBtn);
                if (!activeBtn.querySelector('svg')) {
                    const span = activeBtn.querySelector('span');
                    if (span) addResizeHandles(activeBtn, span);
                }

                const onKeyDown = (e) => {
                    if (e.key === 'Enter') {
                        activeBtn.classList.remove('blinking');
                        activeBtn.querySelectorAll('.btn-handle').forEach(h => h.remove());
                        removeDraggable(activeBtn);

                        const dataToSave = {
                            x: parseInt(activeBtn.style.left),
                            y: parseInt(activeBtn.style.top),
                            width: activeBtn.offsetWidth,
                            height: activeBtn.offsetHeight,
                            settings: activeBtn._settings || {}
                        };
                        _ynChromeSet({ [BUTTON_STORAGE_KEY]: dataToSave });
                        window.removeEventListener('keydown', onKeyDown);
                    }
                };
                window.addEventListener('keydown', onKeyDown);
            }
        }

        function startDeleteMode() {
            isDeleteMode = true;
            const PROTECTED_SELECTORS = [
                'video', '#player', '.html5-video-player', '.html5-video-container',
                '#movie_player', 'ytd-player', 'ytd-watch-flexy',
                'ytd-app', 'ytd-masthead', '#masthead-container', '#header',
                'body', 'html',
                'ytd-search', '#search-input', '#search', '#search-form',
                'ytd-comment-renderer', 'ytd-comments', '#comments',
                '#related', 'ytd-watch-next-secondary-results-renderer',
                '#primary', '#secondary', '#page-manager',
                'ytd-playlist-panel-renderer', '#playlist',
                '.custom-purple-btn', '.yoni-img',
                '#copy-mode-overlay', '#delete-mode-overlay'
            ];
            const isProtected = (el) => {
                for (let i = 0; i < PROTECTED_SELECTORS.length; i++) {
                    try {
                        if (el.closest && el.closest(PROTECTED_SELECTORS[i])) return true;
                        if (el.matches && el.matches(PROTECTED_SELECTORS[i])) return true;
                    } catch(e) {}
                }
                // Also protect if it's a very large element (>60% of viewport)
                const r = el.getBoundingClientRect();
                if (r.width * r.height > 0.6 * window.innerWidth * window.innerHeight) return true;
                return false;
            };

            const overlay = document.createElement('div');
            overlay.id = 'delete-mode-overlay';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', right: '0', zIndex: '2147483646',
                background: 'rgba(239,68,68,0.95)', color: 'white',
                padding: '10px 16px', borderRadius: '0 0 0 12px', fontSize: '13px',
                fontFamily: 'Segoe UI,Arial,sans-serif', direction: 'rtl',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', pointerEvents: 'none',
                fontWeight: '600'
            });
            overlay.textContent = '🗑 מצב מחיקה: לחץ על אלמנט למחיקה (אלמנטים קריטיים מוגנים — Esc לביטול)';
            document.body.appendChild(overlay);
            document.body.style.setProperty('cursor', 'not-allowed', 'important');

            function cleanupDeleteMode() {
                isDeleteMode = false;
                document.body.style.removeProperty('cursor');
                const ov = document.getElementById('delete-mode-overlay');
                if (ov) ov.remove();
                document.removeEventListener('mouseover', onMouseOver, true);
                document.removeEventListener('mouseout', onMouseOut, true);
                document.removeEventListener('click', onClick, true);
                document.removeEventListener('keydown', onEsc, true);
            }

            const onEsc = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); cleanupDeleteMode(); }
            };

            const onMouseOver = (e) => {
                if (!isDeleteMode) return;
                const t = e.target;
                if (!t) return;
                if (isProtected(t)) {
                    t.classList.remove('yt-delete-hover');
                    t.classList.add('yt-delete-protected');
                } else {
                    t.classList.remove('yt-delete-protected');
                    t.classList.add('yt-delete-hover');
                }
            };
            const onMouseOut = (e) => {
                const t = e.target;
                if (!t) return;
                t.classList.remove('yt-delete-hover');
                t.classList.remove('yt-delete-protected');
            };
            const onClick = (e) => {
                if (!isDeleteMode) return;
                e.preventDefault();
                e.stopPropagation();

                const target = e.target;
                if (!target) return;
                if (isProtected(target)) {
                    // Flash red and refuse to delete
                    target.animate([
                        { transform: 'translateX(0)' },
                        { transform: 'translateX(-5px)' },
                        { transform: 'translateX(5px)' },
                        { transform: 'translateX(0)' }
                    ], { duration: 250 });
                    return;
                }

                target.classList.remove('yt-delete-hover');
                target.classList.remove('yt-delete-protected');
                target.style.setProperty('display', 'none', 'important');

                const selector = getUniqueSelector(target);

                _ynChromeGet([REMOVED_ELEMENTS_KEY], (result) => {
                    const list = result[REMOVED_ELEMENTS_KEY] || [];
                    if (!list.includes(selector)) {
                        list.push(selector);
                        _ynChromeSet({ [REMOVED_ELEMENTS_KEY]: list });
                    }
                });

                cleanupDeleteMode();
            };

            // Inject highlight styles
            try {
                const st = document.createElement('style');
                st.id = 'yt-delete-mode-styles';
                st.textContent = `
                    .yt-delete-hover { outline: 2px dashed #ef4444 !important; outline-offset: 2px !important; background: rgba(239,68,68,0.1) !important; cursor: pointer !important; }
                    .yt-delete-protected { outline: 2px dotted #f59e0b !important; outline-offset: 2px !important; background: rgba(245,158,11,0.08) !important; cursor: not-allowed !important; }
                `;
                if (!document.getElementById('yt-delete-mode-styles')) document.head.appendChild(st);
            } catch(e){}

            document.addEventListener('mouseover', onMouseOver, true);
            document.addEventListener('mouseout', onMouseOut, true);
            document.addEventListener('click', onClick, true);
            document.addEventListener('keydown', onEsc, true);
        }

        function resetAllButtons() {
            _ynChromeRemove([BUTTON_STORAGE_KEY, REMOVED_ELEMENTS_KEY]);
            if (activeBtn) activeBtn.remove();
            const originalBtn = document.querySelector('#yn-btn-video');
            if (originalBtn) originalBtn.style.display = '';
            _ynChromeGet([REMOVED_ELEMENTS_KEY], (result) => {
                const hiddenSelectors = result[REMOVED_ELEMENTS_KEY] || [];
                hiddenSelectors.forEach(selector => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => el.style.removeProperty('display'));
                    } catch (e) {}
                });
            });
        }

        function reapplyHiddenElements() {
            applyHiddenElements();
        }

        function startCopyMode() {
            isCopyMode = true;
            document.body.style.setProperty('cursor', 'copy', 'important');
            const overlay = document.createElement('div');
            overlay.id = 'copy-mode-overlay';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', right: '0', zIndex: '2147483646',
                background: 'rgba(59,130,246,0.95)', color: 'white',
                padding: '10px 16px', borderRadius: '0 0 0 12px', fontSize: '13px',
                fontFamily: 'Segoe UI,Arial,sans-serif', direction: 'rtl',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', pointerEvents: 'none',
                fontWeight: '600'
            });
            overlay.textContent = '📋 מצב העתקה: לחץ על כפתור ביוטיוב כדי להעתיק את עיצובו לפופאפ (לחץ Esc לביטול)';
            document.body.appendChild(overlay);

            function cleanupCopyMode() {
                isCopyMode = false;
                document.body.style.removeProperty('cursor');
                const ov = document.getElementById('copy-mode-overlay');
                if (ov) ov.remove();
                document.removeEventListener('mouseover', onMouseOver, true);
                document.removeEventListener('mouseout', onMouseOut, true);
                document.removeEventListener('click', onClick, true);
                document.removeEventListener('keydown', onEsc, true);
            }

            const onEsc = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); cleanupCopyMode(); }
            };

            const onMouseOver = (e) => {
                if (!isCopyMode) return;
                const target = e.target.closest('button, a[href], [role="button"], yt-button-renderer, ytd-button-renderer, ytmusic-button-renderer, yt-icon-button');
                if (target && !target.closest('.custom-purple-btn') && !target.closest('#copy-mode-overlay')) {
                    target.style.outline = '3px dashed #3b82f6';
                    target.style.outlineOffset = '2px';
                }
            };
            const onMouseOut = (e) => {
                const target = e.target.closest('button, a[href], [role="button"], yt-button-renderer, ytd-button-renderer, ytmusic-button-renderer, yt-icon-button');
                if (target) {
                    target.style.outline = '';
                    target.style.outlineOffset = '';
                }
            };
            const onClick = (e) => {
                if (!isCopyMode) return;
                e.preventDefault();
                e.stopPropagation();
                const target = e.target.closest('button, a[href], [role="button"], yt-button-renderer, ytd-button-renderer, ytmusic-button-renderer, yt-icon-button');
                if (target && !target.closest('.custom-purple-btn')) {
                    target.style.outline = '';
                    target.style.outlineOffset = '';

                    // Try to find the actual visible/styled element inside wrapper renderers
                    let styledEl = target;
                    const innerBtn = target.querySelector('button, [role="button"], a');
                    if (innerBtn) {
                        const innerCs = window.getComputedStyle(innerBtn);
                        const outerCs = window.getComputedStyle(target);
                        if (innerCs.backgroundColor && innerCs.backgroundColor !== 'rgba(0, 0, 0, 0)' && innerCs.backgroundColor !== 'transparent') {
                            styledEl = innerBtn;
                        } else if (outerCs.backgroundColor === 'rgba(0, 0, 0, 0)' || outerCs.backgroundColor === 'transparent') {
                            const ch = target.querySelector('*');
                            if (ch) styledEl = ch;
                        }
                    }
                    const cs = window.getComputedStyle(styledEl);

                    const textCandidates = [
                        styledEl.querySelector('#text, .yt-uix-button-content, .style-scope.yt-formatted-string, span, div, yt-formatted-string'),
                        target.querySelector('#text, .yt-uix-button-content, .style-scope.yt-formatted-string, span, div, yt-formatted-string')
                    ];
                    let textContent = '';
                    for (const t of textCandidates) {
                        if (t && t.children.length === 0) {
                            textContent = (t.innerText || t.textContent || '').trim();
                            if (textContent) break;
                        }
                    }
                    if (!textContent) {
                        const allText = (styledEl.innerText || styledEl.textContent || target.innerText || target.textContent || '').trim();
                        textContent = allText.slice(0, 40);
                    }

                    const svgEl = styledEl.querySelector('svg') || target.querySelector('svg');
                    const hasSVG = !!svgEl;
                    const iconOnly = hasSVG && textContent.length < 3;

                    const radius = cs.borderRadius;
                    let finalRadius = '50%';
                    if (radius && radius !== '0px' && radius !== '0') {
                        finalRadius = radius;
                    } else {
                        const isCircle = Math.abs(styledEl.offsetWidth - styledEl.offsetHeight) < 4 && styledEl.offsetWidth > 10;
                        if (isCircle) finalRadius = '50%';
                        else if (styledEl.offsetWidth > 10) finalRadius = Math.min(20, styledEl.offsetHeight / 4) + 'px';
                    }

                    // Extract shadow if present
                    let shadowOn = false, shadowSize = '4', shadowColor = '#000000';
                    const boxShadow = cs.boxShadow;
                    if (boxShadow && boxShadow !== 'none' && boxShadow) {
                        shadowOn = true;
                        const m = boxShadow.match(/(\d+)px\s+(\d+)px\s+(\d+)px/);
                        if (m) shadowSize = m[3] || '4';
                        const cm = boxShadow.match(/rgba?\([^)]+\)/);
                        if (cm) shadowColor = rgbToHex(cm[0]) || '#000000';
                    }

                    let bgColor = rgbToHex(cs.backgroundColor);
                    // If transparent, try to pick a visible background from parent layers
                    if (!bgColor || bgColor === '#000000') {
                        let p = styledEl.parentElement;
                        for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
                            const pcs = window.getComputedStyle(p);
                            const pbg = rgbToHex(pcs.backgroundColor);
                            if (pbg && pbg !== '#000000') { bgColor = pbg; break; }
                        }
                    }
                    if (!bgColor) bgColor = '#f2f2f2';

                    let txColor = rgbToHex(cs.color);
                    if (!txColor) {
                        txColor = getBrightness(bgColor) > 140 ? '#0f0f0f' : '#ffffff';
                    }

                    const borderPx = parseInt(cs.borderWidth) || 0;
                    const borderCol = rgbToHex(cs.borderColor) || '#ffffff';

                    const settings = {
                        text: iconOnly ? '' : textContent,
                        icon: iconOnly,
                        color: bgColor,
                        textColor: txColor,
                        borderRadius: finalRadius,
                        borderWidth: borderPx,
                        borderColor: borderCol,
                        btnShadowOn: shadowOn,
                        btnShadowSize: shadowSize,
                        btnShadowColor: shadowColor,
                        textShadowOn: !!cs.textShadow && cs.textShadow !== 'none',
                        textShadowSize: String(1),
                        textShadowColor: '#000000'
                    };

                    // Save to storage so popup can pick up even if it closed
                    _ynChromeSet({
                        'yn_copied_button_settings': settings,
                        'yt_global_button_data': { settings: settings }
                    }, () => {
                        _ynSendMsg({ type: 'copied_button_settings', settings: settings });
                    });

                    cleanupCopyMode();
                }
            };

            document.addEventListener('mouseover', onMouseOver, true);
            document.addEventListener('mouseout', onMouseOut, true);
            document.addEventListener('click', onClick, true);
            document.addEventListener('keydown', onEsc, true);
        }

        function getBrightness(hex) {
            if (!hex) return 0;
            const m = hex.replace('#','');
            if (m.length < 6) return 128;
            const r = parseInt(m.substring(0,2),16);
            const g = parseInt(m.substring(2,4),16);
            const b = parseInt(m.substring(4,6),16);
            return (r * 299 + g * 587 + b * 114) / 1000;
        }

        function rgbToHex(rgb) {
            if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return null;
            if (rgb.startsWith('#')) return rgb;
            const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!match) return null;
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }

        function startPlaceMode(settings) {
            settings = settings || {};
            let placed = false;
            let btn = null;

            // Build a ghost button that follows cursor
            function getSize() {
                const hasText = (settings.text || '').trim() !== '';
                const isCircle = settings.borderRadius === '50%';
                if (hasText) {
                    if (isCircle) return { w: 90, h: 90, icon: false };
                    return { w: 140, h: 50, icon: false };
                }
                return { w: 40, h: 40, icon: true };
            }
            const size = getSize();

            btn = document.createElement('button');
            btn.className = 'custom-purple-btn';
            btn.style.position = 'fixed';
            btn.style.left = (window.innerWidth/2 - size.w/2) + 'px';
            btn.style.top = (window.innerHeight/2 - size.h/2) + 'px';
            btn.style.width = size.w + 'px';
            btn.style.height = size.h + 'px';
            btn.style.backgroundColor = settings.color || '#8a2be2';
            btn.style.borderRadius = settings.borderRadius || '50%';
            btn.style.color = settings.textColor || '#ffffff';
            btn.style.zIndex = (2147483647 - 1) + '';
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.85';
            btn.style.transform = 'translate(-50%, -50%)';
            btn.style.left = '50%';
            btn.style.top = '50%';
            btn.style.userSelect = 'none';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.border = (parseInt(settings.borderWidth)||0) > 0
                ? `${parseInt(settings.borderWidth)||0}px solid ${settings.borderColor || '#ffffff'}`
                : 'none';
            if (settings.btnShadowOn && parseInt(settings.btnShadowSize)>0) {
                btn.style.boxShadow = `0px 4px ${settings.btnShadowSize}px ${settings.btnShadowColor||'#000'}`;
            }
            if (settings.textShadowOn && parseInt(settings.textShadowSize)>0) {
                btn.style.textShadow = `0px 1px ${settings.textShadowSize}px ${settings.textShadowColor||'#000'}`;
            }

            const hasText = (settings.text || '').trim() !== '';
            const DOWNLOAD_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 16l4-5h-3V4h-2v7H8l4 5z"/><path d="M4 18h16v2H4z"/></svg>`;
            if (hasText) {
                btn.textContent = settings.text;
                btn.style.fontWeight = 'bold';
                btn.style.whiteSpace = 'pre';
            } else {
                btn.innerHTML = DOWNLOAD_SVG;
            }

            // Cursor hint overlay (top right)
            const hint = document.createElement('div');
            Object.assign(hint.style, {
                position: 'fixed', top: '0', right: '0', zIndex: '2147483647',
                background: 'rgba(124, 58, 237, 0.95)', color: 'white',
                padding: '10px 16px', borderRadius: '0 0 0 12px', fontSize: '13px',
                fontFamily: 'Segoe UI,Arial,sans-serif', direction: 'rtl',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', pointerEvents: 'none',
                fontWeight: '600'
            });
            hint.textContent = '📍 מצב הצבה: גרור את העכבר ולחץ כדי להציב | Esc לביטול';
            document.body.appendChild(btn);
            document.body.appendChild(hint);
            document.body.style.setProperty('cursor', 'crosshair', 'important');

            function cleanup() {
                document.body.style.removeProperty('cursor');
                if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
                if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('click', onClick, true);
                document.removeEventListener('keydown', onEsc, true);
            }

            function onMove(e) {
                if (!btn) return;
                btn.style.left = e.clientX + 'px';
                btn.style.top = e.clientY + 'px';
            }

            function onEsc(e) {
                if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
            }

            function onClick(e) {
                if (placed) return;
                e.preventDefault();
                e.stopPropagation();
                placed = true;
                const absX = window.scrollX + e.clientX - (size.w/2);
                const absY = window.scrollY + e.clientY - (size.h/2);
                cleanup();

                // Pre-compute a safe font size to avoid fitText setTimeout causing flicker/disappear
                const hasText = (settings.text || '').trim() !== '';
                if (hasText && !settings._fontSize) {
                    const isCircle = settings.borderRadius === '50%';
                    settings._fontSize = String(
                        isCircle
                            ? Math.max(10, Math.min(26, Math.floor(Math.min(size.w, size.h) * 0.28)))
                            : Math.max(11, Math.min(24, Math.floor(size.h * 0.45)))
                    );
                }
                // Place button: isEditing=false means NO blinking, NO resize handles — ready to use
                createButton(absX, absY, size.w, size.h, settings, false);

                // Finalize: save + hide/remove the original YoniTube default button
                try {
                    const b = document.querySelector('.custom-purple-btn');
                    if (b) {
                        b.classList.remove('blinking');
                        b.querySelectorAll('.btn-handle').forEach(h => h.remove());
                        removeDraggable(b);
                        clearSnapGuides();
                        const isCircle = settings.borderRadius === '50%';
                        if (isCircle) {
                            const s = Math.max(b.offsetWidth, b.offsetHeight);
                            b.style.width = s + 'px';
                            b.style.height = s + 'px';
                            const sp = b.querySelector('span');
                            if (sp) {
                                sp.style.lineHeight = '1';
                                fitText(b, sp);
                            }
                        }
                        const dataToSave = {
                            x: parseInt(b.style.left),
                            y: parseInt(b.style.top),
                            width: b.offsetWidth,
                            height: b.offsetHeight,
                            settings: settings
                        };
                        _ynChromeSet({ [BUTTON_STORAGE_KEY]: dataToSave });
                        const originalBtn = document.querySelector('#yn-btn-video');
                        if (originalBtn) {
                            originalBtn.style.display = 'none';
                            try { originalBtn.remove(); } catch(err){}
                        }
                    }
                } catch(err) {}
            }

            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('click', onClick, true);
            document.addEventListener('keydown', onEsc, true);
        }

        return { start, startPlaceMode, startDeleteMode, resetAllButtons, createButton, startCopyMode, editExistingButton, loadSavedButton, reapplyHiddenElements, applyHiddenElements };
    })();
})();


