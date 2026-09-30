'use strict';
/* YoniTube popup.js v6 */
const SRV='http://127.0.0.1:5000';
const SK='yn_s_v6',WK='yn_w_v2',TK='yn_t_v2';
const SPD_DESCS={slow:'🐢 4 חיבורים, 2MB/s — אנטי-בוט',medium:'⚡ 8 חיבורים — מהיר ויציב',fast:'🚀 16 חיבורים aria2c — מקסימום'};
const DEFAULT_S={darkMode:true,defSpeed:'medium',basePath:'',folderPlaylist:false,folderChannel:false,showQueueThumbs:true,enableSubs:false,subLang:'he',subFormat:'srt'};
const SITE_META={youtube:{color:'#f00',domain:'youtube.com'},soundcloud:{color:'#f60',domain:'soundcloud.com'},vimeo:{color:'#1ab7ea',domain:'vimeo.com'},tiktok:{color:'#333',domain:'tiktok.com'},twitter:{color:'#1da1f2',domain:'x.com'},instagram:{color:'#e1306c',domain:'instagram.com'},twitch:{color:'#9146ff',domain:'twitch.tv'}};
const COOKIE_DOMAINS=['.youtube.com','youtube.com','.music.youtube.com','music.youtube.com','.google.com','google.com','.accounts.google.com','accounts.google.com'];
let S={...DEFAULT_S},watchItems=[],qItems={};
let deletedUids=new Set();
let plItems=[],plLoaded=false;
let aTab='download',selT='video',selH=null,selQ=null,selVF='mp4',selAF='mp3',selCT='all';
let _lastCookiePush=0;
let _lastCookiePushHash='';

document.addEventListener('DOMContentLoaded',async()=>{
  await _load(); applyTheme(); _restoreTab(); _bindAll();
  // Reset inline styles on status UI so CSS classes (.on/.off) work unopposed.
  // Old code set style.backgroundColor/style.color directly, which would
  // override CSS and leave "מתחבר..." stuck even when checkSrv updated classes.
  ['statusDot','statusText','statusBar','statusIndicator'].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    el.style.backgroundColor=''; el.style.color=''; el.style.boxShadow=''; el.style.borderColor='';
  });
  const bar=document.querySelector('.status-bar');
  if(bar){bar.style.backgroundColor=''; bar.style.color='';}
  // Force immediate server status check
  checkSrv();
  startPoll(); autoFill();
  // Check server status and show/hide YoniTube UI accordingly
  checkServerStatus();
  // Push cookies immediately, wait a tick so server is online first
  setTimeout(()=>{_pushCookies().catch(()=>{});}, 500);
  // And every 60 seconds refresh cookies
  setInterval(()=>_pushCookies().catch(()=>{}),60000);
  // Load queue from server first, then render
  await loadQueueFromServer();
  renderQueue();
});

async function _load(){
  return new Promise(r=>chrome.storage.local.get([SK,WK,'yn_qItems','yn_deleted_uids'],d=>{
    S=Object.assign({...DEFAULT_S},d[SK]||{});
    // Update selection variables from saved settings
    if(S.selVF) selVF=S.selVF;
    if(S.selAF) selAF=S.selAF;
    if(S.selH) selH=S.selH;
    if(S.selQ) selQ=S.selQ;
    // lastCheck=0 used to flood MP4 duplicates via watch_check — baseline to now
    watchItems=(d[WK]||[]).map(it=>({...it,lastCheck:it.lastCheck>0?it.lastCheck:Date.now()}));
    chrome.storage.local.set({[WK]:watchItems});
    // Load queue items from storage
    qItems=d.yn_qItems||{};
    // Load deleted UIDs from storage
    deletedUids=new Set(d.yn_deleted_uids||[]);
    r();
  }));
}
function save(){chrome.storage.local.set({[SK]:S,[WK]:watchItems,'yn_qItems':qItems,'yn_deleted_uids':Array.from(deletedUids)});}
function applyTheme(){
  document.body.className=S.darkMode?'dark':'light';
  const logoImg=document.querySelector('.logo-image');
  if(logoImg){
    logoImg.src=S.darkMode?'logo_dark.svg':'logo_light.svg';
  }
  const logoSimple=document.querySelector('.logo-simple');
  if(logoSimple){
    logoSimple.src=S.darkMode?'logo_dark.svg':'logo_light.svg';
  }
}

function _restoreTab(){
  chrome.storage.local.get([TK],d=>{const sv=d[TK]||{};if(sv.tab)_activateTab(sv.tab);});
}
function _saveTab(){chrome.storage.local.set({[TK]:{tab:aTab}});}
function _activateTab(tab,sub){
  document.querySelectorAll('.nav-item,.tab-content').forEach(e=>e.classList.remove('active'));
  const b=document.querySelector(`.nav-item[data-tab="${tab}"]`),p=document.getElementById('tab-'+tab);
  if(b&&p){b.classList.add('active');p.classList.add('active');aTab=tab;}
  if(aTab==='queue')renderQueue();
  if(aTab==='watch')renderWatch();
}

function _bindAll(){
  // Tabs
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item,.tab-content').forEach(e=>e.classList.remove('active'));
    b.classList.add('active');aTab=b.dataset.tab;
    document.getElementById('tab-'+aTab).classList.add('active');
    _saveTab();
    if(aTab==='queue')renderQueue();
    if(aTab==='watch')renderWatch();
  }));
  // Quality
  document.querySelectorAll('.quality-btn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.quality-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const h=b.dataset.h||null;
    if(h==='2160'){
      selH=null; selQ='best';
    }else{
      selH=h; selQ=null;
    }
    S.selH=selH; S.selQ=selQ; save();
  }));
  // Video chips
  document.querySelectorAll('#videoOptions .chip').forEach(c=>c.addEventListener('click',()=>{
    document.querySelectorAll('#videoOptions .chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');selVF=c.dataset.fmt; S.selVF=selVF; save();
  }));
  // Audio chips
  document.querySelectorAll('#audioOptions .chip').forEach(c=>c.addEventListener('click',()=>{
    document.querySelectorAll('#audioOptions .chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');selAF=c.dataset.fmt; S.selAF=selAF; save();
  }));
  // Store available resolutions
  // Function to fetch available subtitles from server for current URL
  async function fetchAvailableSubtitles(url){
    if(!url||(!url.includes('youtube')&&!url.includes('youtu.be')))return;
    const slLang=document.getElementById('subLang');if(!slLang)return;
    try{
      const res=await fetch(SRV+'/get_subtitles',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url}),
        signal:AbortSignal.timeout(8000)
      });
      const data=await res.json();
      if(data.ok && data.subtitles && data.subtitles.length){
        const curVal=slLang.value||S.subLang||'he';
        slLang.innerHTML='';
        data.subtitles.forEach(sub=>{
          const op=document.createElement('option');
          op.value=sub.code;
          op.textContent=sub.name;
          slLang.appendChild(op);
        });
        if(data.subtitles.some(s=>s.code===curVal)) slLang.value=curVal;
        else slLang.value=data.subtitles[0].code;
        S.subLang=slLang.value; save();
      }
    }catch(e){
      console.log('Failed to fetch subtitles:',e);
    }
  }

  // Restore saved choices to UI
  if(S.selVF){
    document.querySelectorAll('#videoOptions .chip').forEach(c=>{
      if(c.dataset.fmt===S.selVF){ c.classList.add('active'); selVF=S.selVF; }
      else c.classList.remove('active');
    });
  }
  if(S.selAF){
    document.querySelectorAll('#audioOptions .chip').forEach(c=>{
      if(c.dataset.fmt===S.selAF){ c.classList.add('active'); selAF=S.selAF; }
      else c.classList.remove('active');
    });
  }
  if(S.selH||S.selQ){
    document.querySelectorAll('.quality-btn').forEach(b=>{
      const h=b.dataset.h||null;
      if((S.selQ==='best'&&h==='2160')||(S.selH&&h===String(S.selH))){
        b.classList.add('active'); selH=S.selH; selQ=S.selQ;
      }else b.classList.remove('active');
    });
  }
  const rw=document.getElementById('resW'), rh=document.getElementById('resH');
  if(rw&&S.resW) rw.value=S.resW;
  if(rh&&S.resH) rh.value=S.resH;
  const tw=document.getElementById('thumbW'), thh=document.getElementById('thumbH');
  if(tw&&S.thumbW) tw.value=S.thumbW;
  if(thh&&S.thumbH) thh.value=S.thumbH;
  const et=document.getElementById('embedThumb');
  if(et){ et.checked=S.embedThumb!==false; et.addEventListener('change',()=>{ S.embedThumb=et.checked; save(); }); }
  const br=document.getElementById('mp3Bitrate');
  if(br){ if(S.mp3Bitrate) br.value=S.mp3Bitrate; br.addEventListener('change',()=>{ S.mp3Bitrate=br.value; save(); }); }

  // Numeric inputs with validation & auto-save
  ['resW','resH','thumbW','thumbH'].forEach(id=>{
    const e=document.getElementById(id);if(e){
      e.addEventListener('keydown',(ev)=>{
        if([8,9,27,13,37,38,39,40].includes(ev.keyCode)) return;
        if(ev.ctrlKey && [65,67,86,88].includes(ev.keyCode)) return;
        if((ev.keyCode<48||ev.keyCode>57) && (ev.keyCode<96||ev.keyCode>105)){
          ev.preventDefault();
        }
      });
      
      e.addEventListener('input',()=>{
        const val=parseInt(e.value);
        if(id==='resH' && val && (val<144||val>7680)){
          e.style.borderColor='#ef4444';
          setTimeout(()=>e.style.borderColor='',500);
        }
        else if(id==='resW' && val && (val<256||val>4320)){
          e.style.borderColor='#ef4444';
          setTimeout(()=>e.style.borderColor='',500);
        }
        else if(id==='thumbH' && val && (val<16||val>4096)){
          e.style.borderColor='#ef4444';
          setTimeout(()=>e.style.borderColor='',500);
        }
        else if(id==='thumbW' && val && (val<16||val>4096)){
          e.style.borderColor='#ef4444';
          setTimeout(()=>e.style.borderColor='',500);
        }
        else if(val) e.style.borderColor='#22c55e';
        else e.style.borderColor='';

        if(id==='resW') S.resW=e.value.trim();
        if(id==='resH') S.resH=e.value.trim();
        if(id==='thumbW') S.thumbW=e.value.trim();
        if(id==='thumbH') S.thumbH=e.value.trim();
        save();
      });
    }
  });
  // Subtitle checkbox & language selection
  const cbSub=document.getElementById('enableSubs'),slLang=document.getElementById('subLang');
  if(cbSub&&slLang){
    cbSub.checked=!!S.enableSubs;
    if(S.subLang)slLang.value=S.subLang;
    slLang.disabled=!cbSub.checked;
    slLang.style.opacity=cbSub.checked?'1':'0.4';
    cbSub.addEventListener('change',()=>{
      slLang.disabled=!cbSub.checked;
      slLang.style.opacity=cbSub.checked?'1':'0.4';
      S.enableSubs=cbSub.checked; save();
    });
    slLang.addEventListener('change',()=>{S.subLang=slLang.value; save();});
  }
  // Resolution checkbox
  const cbRes=document.getElementById('enableRes');
  if(cbRes){
    cbRes.checked=!!S.enableRes;
    const resInputs=document.getElementById('resInputs');
    if(resInputs){
      resInputs.style.opacity=cbRes.checked?'1':'0.4';
      resInputs.style.pointerEvents=cbRes.checked?'auto':'none';
    }
    cbRes.addEventListener('change',()=>{
      if(resInputs){
        resInputs.style.opacity=cbRes.checked?'1':'0.4';
        resInputs.style.pointerEvents=cbRes.checked?'auto':'none';
      }
      S.enableRes=cbRes.checked; save();
    });
  }
  // Content type pills
  document.querySelectorAll('.type-pill').forEach(p=>p.addEventListener('click',()=>{
    document.querySelectorAll('.type-pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');selCT=p.dataset.ct;
    // Reload playlist if it was loaded
    if(plLoaded){plLoaded=false;_fetchPl();}
  }));
  // Format cards
  document.querySelectorAll('.format-card').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.format-card').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const t=b.dataset.type;
    if(t==='video'){selT='video';document.getElementById('videoOptions').style.display='block';document.getElementById('audioOptions').style.display='none';document.getElementById('thumbOptions').style.display='none';}
    else if(t==='audio'){selT='audio';document.getElementById('videoOptions').style.display='none';document.getElementById('audioOptions').style.display='block';document.getElementById('thumbOptions').style.display='none';}
    else if(t==='thumb'){selT='thumb';document.getElementById('videoOptions').style.display='none';document.getElementById('audioOptions').style.display='none';document.getElementById('thumbOptions').style.display='block';}
  }));
  // URL bar
  const inp=document.getElementById('urlInput'),clr=document.getElementById('clearBtn');
  inp.addEventListener('input',async()=>{
    clr.style.display=inp.value?'flex':'none';
    _chkPl(inp.value);
    // Fetch available resolutions when URL changes
    if(inp.value && (inp.value.includes('youtube')||inp.value.includes('youtu.be'))){
      await fetchAvailableResolutions(inp.value);
    }
  });
  clr.addEventListener('click',()=>{inp.value='';clr.style.display='none';_hidePl();inp.focus();});
  document.getElementById('pasteBtn')?.addEventListener('click',async()=>{
    try{const t=await navigator.clipboard.readText();if(t){inp.value=t.trim();clr.style.display='flex';_chkPl(t.trim());await fetchAvailableResolutions(t.trim());return;}}catch{}
    showSt('inf','לחץ Ctrl+V');setTimeout(clearSt,2500);
  });
  
  // Resolution validation with visual feedback
  const resW=document.getElementById('resW');
  const resH=document.getElementById('resH');
  const thumbW=document.getElementById('thumbW');
  const thumbH=document.getElementById('thumbH');
  
  async function validateResolution(input){
    const val=parseInt(input.value);
    if(!input.value.trim()){
      input.style.borderColor='';
      return false;
    }
    if(isNaN(val)||val<=0||val>7680){
      input.style.borderColor='#ef4444';
      input.style.borderWidth='2px';
      setTimeout(()=>input.style.borderColor='',500);
      return false;
    }
    
    input.style.borderColor='#22c55e';
    input.style.borderWidth='2px';
    return true;
  }
  
  [resW,resH,thumbW,thumbH].forEach(input=>{
    if(input){
      input.addEventListener('input',async()=>await validateResolution(input));
      input.addEventListener('blur',async()=>await validateResolution(input));
    }
  });
  
  // Download
  document.getElementById('dlBtn')?.addEventListener('click',async()=>{const u=getUrl();if(u){const body=await _body(u);if(body)_sendDl(body);}});
  // Server status
  document.getElementById('statusIndicator')?.addEventListener('click',()=>{
    chrome.runtime.sendMessage({type:'toggleServer'},r=>{
      if(r?.action==='error')showSt('err',r.msg||'שגיאה');
      else if(r?.action==='started')showSt('ok','✅ השרת הופעל');
      else if(r?.action==='stopped')showSt('inf','🛑 השרת כובה');
    });
  });
  // Terms
  document.getElementById('termsLink')?.addEventListener('click',e=>{e.preventDefault();chrome.runtime.sendMessage({type:'openTerms'});});
  _bindPl();_bindQueue();_bindWatch();_bindSettings();
}

function _chkPl(url){
  if(!url){_hidePl();return;}
  const isPl=(/list=[A-Za-z0-9_-]+/.test(url)&&!/[?&]v=/.test(url))||/\/(channel|@|c\/|user\/|playlist\?)/i.test(url);
  const isCh=/\/(channel\/|@|c\/|user\/)/i.test(url);
  const banner=document.getElementById('plBanner');
  banner.style.display=isPl?'flex':'none';
  if(isPl){
    document.querySelector('.playlist-text').textContent=isCh?'ערוץ':'פלייליסט';
    document.querySelector('.playlist-icon').textContent=isCh?'📺':'📋';
  }else _hidePl();
}
function _hidePl(){
  const plBanner=document.getElementById('plBanner');
  const plPicker=document.getElementById('plPicker');
  if(plBanner) plBanner.style.display='none';
  if(plPicker) plPicker.style.display='none';
  plLoaded=false;plItems=[];
}
async function autoFill(){
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({active:true,currentWindow:true},tabs=>{
      if (chrome.runtime?.lastError) return;
      const u=tabs[0]?.url||'';
      if(u && (u.includes('youtube')||u.includes('youtu.be'))){
        const inp=document.getElementById('urlInput'); if(inp) inp.value=u;
        const clr=document.getElementById('clearBtn'); if(clr) clr.style.display='flex';
        _chkPl(u);
        fetchAvailableSubtitles(u).catch(()=>{});
      }
    });
  } catch(e) {
    console.log('autoFill safe check:', e);
  }
}

async function _body(url){
  const b={url,speed:S.defSpeed,content_type:selCT};
  if(S.basePath)b.base_path=S.basePath;
  if(S.folderPlaylist)b.folder_playlist=true;
  if(S.folderChannel)b.folder_channel=true;
  const th=_ytThumb(url); if(th)b.thumb=th;
  if(selT==='video'){
    b.format=selVF;
    if(selH)b.height=parseInt(selH);
    if(selQ)b.quality=selQ;
    const cbRes=document.getElementById('enableRes');
    if(cbRes?.checked){
      const w=document.getElementById('resW')?.value.trim(),h=document.getElementById('resH')?.value.trim();
      if(w) b.width=parseInt(w);
      if(h) b.height=parseInt(h);
    }
    const cbSub=document.getElementById('enableSubs');
    if(cbSub?.checked){const sl=document.getElementById('subLang')?.value||'he';b.subtitle_lang=sl;b.subtitle_format='srt';}
  }else if(selT==='audio'){
    b.format=selAF;
    const embedThumbEl=document.getElementById('embedThumb');
    b.embed_thumbnail=embedThumbEl?embedThumbEl.checked:false;
    // Cover resolution from thumb tab fields (if filled)
    const tw=document.getElementById('thumbW')?.value.trim(),thh=document.getElementById('thumbH')?.value.trim();
    if(tw&&thh){b.thumb_width=parseInt(tw);b.thumb_height=parseInt(thh);}
    if(selAF==='mp3'){const br=document.getElementById('mp3Bitrate')?.value;if(br)b.audio_quality=br;}
  }else if(selT==='thumb'){
    b.format='thumbnail';
    const tw=document.getElementById('thumbW')?.value.trim(),thh=document.getElementById('thumbH')?.value.trim();
    if(tw&&thh){b.thumb_width=parseInt(tw);b.thumb_height=parseInt(thh);}
  }
  return b;
}

function getUrl(){
  const raw=document.getElementById('urlInput').value.trim();
  if(!raw){showSt('err','נא להדביק קישור');return null;}
  return raw;
}

// ── Cookie sync (YouTube -> yt-dlp Netscape format) ────────────────
function _isYoutubeRelevantCookie(c){
  const domain=(c.domain||'').toLowerCase().replace(/^\./,'');
  if(domain==='youtube.com'||domain.endsWith('.youtube.com'))return true;
  if(domain==='music.youtube.com')return true;
  if(domain==='google.com')return true;
  if(domain==='accounts.google.com')return true;
  return false;
}

async function _getCookiesTxt(){
  // Pull cookies for all relevant Google/YouTube domains from Chrome
  const all=[];
  for(const d of COOKIE_DOMAINS){
    try{
      const arr=await chrome.cookies.getAll({domain:d});
      for(const c of arr){
        if(!c||!c.name||!_isYoutubeRelevantCookie(c))continue;
        const val=c.value||'';
        if(val.includes('\t')||val.includes('\n')||val.includes('\r'))continue;
        all.push({
          domain: c.domain.startsWith('.')?c.domain: (c.hostOnly?c.domain:'.'+c.domain),
          flag:   c.domain.startsWith('.') || !c.hostOnly,
          path:   c.path || '/',
          secure: !!c.secure,
          expiry: c.expirationDate ? Math.floor(c.expirationDate) : (Date.now()/1000|0)+3600*24*365,
          name:   c.name,
          value:  val,
        });
      }
    }catch{}
  }
  if(!all.length) return '';
  // Netscape cookie.txt format:
  // # Netscape HTTP Cookie File
  // domain  flag  path  secure  expiry  name  value
  const lines=['# Netscape HTTP Cookie File','# Downloaded by YoniTube Extension',''];
  for(const c of all){
    lines.push([c.domain, c.flag?'TRUE':'FALSE', c.path, c.secure?'TRUE':'FALSE', String(c.expiry), c.name, c.value].join('\t'));
  }
  return lines.join('\n')+'\n';
}
function _hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}
async function _pushCookies(force=false){
  const now=Date.now();
  if(!force && now-_lastCookiePush<5000) return true;
  try{
    const txt=await _getCookiesTxt();
    if(!txt) return false;
    const hash = _hashString(txt);
    if(!force && hash === _lastCookiePushHash){
      _lastCookiePush=now;
      return true;
    }
    _lastCookiePush=now;
    await fetch(SRV+'/update_cookies',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({cookies_txt: txt}),
      signal: AbortSignal.timeout(2500),
    });
    _lastCookiePushHash = hash;
    try{
      fetch(SRV+'/cookies',{method:'POST',headers:{'Content-Type':'text/plain; charset=utf-8'},body:txt,signal:AbortSignal.timeout(1500)}).catch(()=>{});
    }catch{}
    return true;
  }catch{return false;}
}

function _sendDl(body){
  const btn=document.getElementById('dlBtn');btn.disabled=true;showSt('inf','📡 שולח...');
  _pushCookies(true).catch(()=>{}).finally(()=>{
    fetch(SRV+'/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(r=>r.json())
      .then(d=>{
        if(d.error)showSt('err','❌ '+d.error);
        else{
          showSt('ok','✅ '+(d.format||'').toUpperCase()+' נוסף ('+(d.queue||0)+' בתור)');
          if(d.uid){
            qItems[d.uid]={uid:d.uid,title:d.title||'',format:d.format||body.format,pct:0,
              status:'queued',source:'youtube',thumb:d.thumb||body.thumb||'',url:body.url};
            save();
            if(aTab==='queue')renderQueue();
          }
        }
      })
      .catch(()=>showSt('err','❌ שרת לא פועל — הפעל YoniTube_Server.exe'))
      .finally(()=>{btn.disabled=false;});
  });
}
function showSt(t,m){
  const e=document.getElementById('status');
  e.className='status-message '+t;
  e.textContent=m;
  e.style.display='block';
}
function clearSt(){
  const e=document.getElementById('status');
  e.className='status-message';
  e.style.display='none';
}

// ── Srv polling ───────────────────────────────────────────────────
let _qDirty=false;
let _firstStatusCheck=true;
function startPoll(){checkSrv();setInterval(checkSrv,100);}
function checkSrv(){
  const timeout = _firstStatusCheck ? 500 : 2500;
  fetch(SRV+'/status',{signal:AbortSignal.timeout(timeout)})
    .then(r=>r.json())
    .then(d=>{
      serverOnline=true;
      const act=d.stats?.active||0,q=d.queue||0;
      const sd=document.getElementById('statusDot'),si=document.getElementById('statusIndicator'),
            sb=document.getElementById('statusBar'),st=document.getElementById('statusText');
      if(sd)sd.className='status-dot on';
      if(si)si.className='status-indicator on';
      if(sb)sb.className='status-bar on';
      const parts=[];if(q>0)parts.push(q+' בתור');if(act>0)parts.push(act+' יורדים');
      if(st)st.textContent='פעיל'+(parts.length?' | '+parts.join(', '):'');
      _firstStatusCheck=false;
      const am=d.active_map||{};
      Object.entries(am).forEach(([uid,info])=>{
        if(deletedUids.has(uid))return;
        const ex=qItems[uid];
        if(!ex){qItems[uid]={uid,...info,thumb:info.thumb||_ytThumb(info.url)||''};_qDirty=true;}
        else{
          const prevPct=ex.pct||0,prevStatus=ex.status,prevTitle=ex.title,prevThumb=ex.thumb;
          Object.assign(qItems[uid],info);
          const newPct=Math.max(prevPct,info.pct||0);
          if(newPct!==prevPct){qItems[uid].pct=newPct;_qDirty=true;}
          if(!qItems[uid].thumb){qItems[uid].thumb=prevThumb||_ytThumb(info.url||ex.url)||'';_qDirty=true;}
          if(!qItems[uid].title&&prevTitle){qItems[uid].title=prevTitle;_qDirty=true;}
          if(info.status!==prevStatus)_qDirty=true;
          // Force immediate update for downloading items
          if(['downloading','converting','merging','embedding'].includes(info.status) && aTab==='queue'){
            renderQueue();
          }
        }
        // Always render queue for new items
        if(!ex && aTab==='queue'){
          renderQueue();
        }
      });
      if(aTab==='queue')renderQueue();
      if(_qDirty){save();_qDirty=false;}
    })
    .catch(()=>{
      serverOnline=false;
      const sd=document.getElementById('statusDot'),si=document.getElementById('statusIndicator'),
            sb=document.getElementById('statusBar'),st=document.getElementById('statusText');
      if(sd)sd.className='status-dot off';
      if(si)si.className='status-indicator off';
      if(sb)sb.className='status-bar off';
      if(st)st.textContent='כבוי';
      _firstStatusCheck=false;
    });
  fetch(SRV+'/history?limit=60',{signal:AbortSignal.timeout(2500)})
    .then(r=>r.json())
    .then(d=>{
      (d.items||[]).forEach(item=>{
        if(!item.uid||deletedUids.has(item.uid))return;
        const ex=qItems[item.uid];const rt=_isReal(item.title);
        const th=item.thumb||_ytThumb(item.url)||'';
        if(!ex){qItems[item.uid]={uid:item.uid,title:rt?item.title:'',format:item.format,
          pct:item.status==='✅'?100:0,status:item.status==='✅'?'done':'err',
          source:item.source||'youtube',thumb:th,url:item.url||'',bytes_done:item.bytes||0};_qDirty=true;}
        else{
          let changed=false;
          if(rt&&item.title&&ex.title!==item.title){ex.title=item.title;changed=true;}
          if(th&&!ex.thumb){ex.thumb=th;changed=true;}
          if(item.url&&!ex.url){ex.url=item.url;changed=true;}
          if(item.status==='✅'&&ex.status!=='done'){ex.status='done';ex.pct=100;changed=true;}
          if(changed)_qDirty=true;
        }
      });
      if(aTab==='queue')renderQueue();
      if(_qDirty){save();_qDirty=false;}
    }).catch(()=>{});
}
function _isReal(t){return !!(t&&String(t).trim().length>1&&!/^https?:\/\//i.test(t)&&!/youtube\.com|youtu\.be/i.test(t));}
function _ytId(u){const m=String(u||'').match(/(?:v=|\/shorts\/|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/);return m?m[1]:'';}
function _ytThumb(u,vid){const id=vid||_ytId(u);return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:'';}
function _qThumb(item){return item.thumb||_ytThumb(item.url)||'';}

// Check server status and show/hide YoniTube UI accordingly
let serverOnline=false;
function checkServerStatus(){
  fetch(SRV+'/ping',{signal:AbortSignal.timeout(2000)})
    .then(r=>r.json())
    .then(d=>{
      serverOnline=d.ok===true;
      showYoniTubeUI();
      if(serverOnline){
        chrome.tabs.query({},tabs=>{
          tabs.forEach(tab=>{
            if(tab.url&&(tab.url.includes('youtube.com')||tab.url.includes('tiktok.com')||tab.url.includes('instagram.com'))){
              chrome.tabs.sendMessage(tab.id,{type:'YONITUBE_SERVER_STATUS',online:true}).catch(()=>{});
            }
          });
        });
      }
    })
    .catch(()=>{
      serverOnline=false;
      showYoniTubeUI();
    });
}

// Listen for server status changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
  if(message.type==='YONITUBE_SERVER_STATUS'){
    serverOnline=message.online;
    showYoniTubeUI();
  }
  return true;
});

function showYoniTubeUI(){
  // Show YoniTube UI elements (use inline display since it's structural, not theme-related)
  const hdr=document.querySelector('.app-header');
  const nav=document.querySelector('.nav-bar');
  const sb=document.getElementById('statusBar');
  if(hdr)hdr.style.display='flex';
  if(nav)nav.style.display='flex';
  if(sb)sb.style.display='block';
  // Status color must be driven by classNames ONLY (never inline style)
  // so that checkSrv polling can toggle them via className without conflicts.
  // showYoniTubeUI only ensures structural visibility; actual on/off styling
  // comes from the CSS classes assigned by checkSrv().
}

// Load queue items from server on popup open
async function loadQueueFromServer(){
  try{
    const res=await fetch(SRV+'/queue');
    if(res.ok){
      const data=await res.json();
      const serverQueue=data.queue || {};
      let changed=false;
      // Merge server queue with local qItems, but don't overwrite deleted items
      Object.keys(serverQueue).forEach(uid=>{
        if(deletedUids.has(uid))return;
        const ex=qItems[uid];
        if(!ex){
          qItems[uid]=serverQueue[uid];
          changed=true;
        }else{
          // Update existing item with server data
          Object.assign(qItems[uid],serverQueue[uid]);
        }
      });
      // Restore hiddenThumb state from storage if exists
      chrome.storage.local.get(['yn_hidden_thumbs'],d=>{
        const hiddenThumbs=d.yn_hidden_thumbs || {};
        Object.keys(qItems).forEach(uid=>{
          if(hiddenThumbs[uid]){
            qItems[uid].hiddenThumb=true;
          }
        });
      });
      if(changed)save();
    }
  }catch(e){
    // Silently fail - server might be offline
    console.error('Failed to load queue from server:',e);
  }
}

// ── Playlist ──────────────────────────────────────────────────────
function _bindPl(){
  document.getElementById('plPickBtn')?.addEventListener('click',async()=>{
    const pk=document.getElementById('plPicker');
    if(pk.style.display==='block'){pk.style.display='none';return;}
    pk.style.display='block';if(!plLoaded)await _fetchPl();
  });
  document.getElementById('plAllBtn')?.addEventListener('click',()=>{const u=getUrl();if(!u)return;_sendDl(_body(u));_hidePl();});
  document.getElementById('plSelAll')?.addEventListener('click',()=>document.querySelectorAll('.pl-item input').forEach(c=>c.checked=true));
  document.getElementById('plSelNone')?.addEventListener('click',()=>document.querySelectorAll('.pl-item input').forEach(c=>c.checked=false));
  document.getElementById('plDlSelected')?.addEventListener('click',async()=>{
    const checked=[...document.querySelectorAll('.pl-item input:checked')];if(!checked.length)return;
    await _pushCookies(true).catch(()=>{});
    let n=0;
    for(const cb of checked){const item=plItems[parseInt(cb.dataset.idx)];if(!item)continue;
      try{await fetch(SRV+'/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_body(item.url))});n++;}catch{}}
    showSt('ok','✅ '+n+' הורדות נשלחו');_hidePl();
  });
}
async function _fetchPl(){
  const url=getUrl();if(!url)return;
  document.getElementById('plLoader').style.display='block';
  document.getElementById('plControls').style.display='none';
  document.getElementById('plList').innerHTML='';
  try{
    await _pushCookies(true).catch(()=>{});
    const r=await fetch(SRV+'/list_playlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,content_type:selCT})});
    const d=await r.json();plItems=d.items||[];plLoaded=true;
    document.getElementById('plLoader').style.display='none';
    document.getElementById('plCount').textContent=plItems.length+' פריטים';
    document.getElementById('plControls').style.display='flex';
    const list=document.getElementById('plList');list.innerHTML='';
    plItems.forEach((item,idx)=>{
      const row=document.createElement('div');row.className='pl-item';
      const cb=document.createElement('input');cb.type='checkbox';cb.checked=true;cb.dataset.idx=idx;
      const t=document.createElement('div');t.className='pl-item-title';t.textContent=item.title||item.id;
      const dur=document.createElement('div');dur.className='pl-item-dur';dur.textContent=item.duration||'';
      row.appendChild(cb);row.appendChild(t);row.appendChild(dur);
      row.addEventListener('click',e=>{if(e.target!==cb)cb.checked=!cb.checked;});
      list.appendChild(row);
    });
  }catch{document.getElementById('plLoader').textContent='❌ שגיאה';}
}

// ── Queue ─────────────────────────────────────────────────────────
function _bindQueue(){
  document.getElementById('qKillBtn')?.addEventListener('click',()=>{
    fetch(SRV+'/kill_all',{method:'POST'}).catch(()=>{});
    Object.values(qItems).forEach(item=>{
      if(['downloading','queued','converting'].includes(item.status)){
        item.status='err';
      }
    });
    renderQueue();
    showSt('inf','🛑 עצירה נשלחה');
  });
  document.getElementById('qClearBtn')?.addEventListener('click',async()=>{
    const uidsToDelete=[];
    Object.keys(qItems).forEach(uid=>{
      if(['done','err','stopped'].includes(qItems[uid].status)){
        deletedUids.add(uid);
        uidsToDelete.push(uid);
        delete qItems[uid];
      }
    });
    save();
    // Clear hidden thumbs storage for deleted items
    chrome.storage.local.get(['yn_hidden_thumbs'],d=>{
      const hiddenThumbs=d.yn_hidden_thumbs || {};
      uidsToDelete.forEach(uid=>delete hiddenThumbs[uid]);
      chrome.storage.local.set({yn_hidden_thumbs:hiddenThumbs});
    });
    renderQueue();
    // Also delete from server
    try{
      await fetch(SRV+'/delete_queue',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({uids:uidsToDelete})
      });
    }catch(e){
      console.error('Failed to delete from server:',e);
    }
  });
}
function renderQueue(){
  const list=document.getElementById('queueList');
  const items=Object.values(qItems);
  const act=items.filter(x=>x.status==='downloading'||x.status==='converting'||x.status==='merging'||x.status==='embedding').length;
  const inq=items.filter(x=>x.status==='queued').length;
  const parts=[];if(inq>0)parts.push(inq+' בתור');if(act>0)parts.push(act+' יורדים');
  document.getElementById('qCount').textContent=parts.join(' | ');
  if(!items.length){list.innerHTML='<div class="empty-state">🎵 אין הורדות</div>';return;}
  const ord={downloading:0,converting:1,queued:2,done:3,err:4};
  items.sort((a,b)=>(ord[a.status]||3)-(ord[b.status]||3));
  list.querySelectorAll('.q-item').forEach(el=>{if(!items.find(i=>i.uid===el.dataset.uid))el.remove();});
  const emptyEl=list.querySelector('.empty-state');if(items.length&&emptyEl)emptyEl.remove();
  items.forEach((item,i)=>{
    const existing=list.querySelector(`.q-item[data-uid="${item.uid}"]`);
    const pct=Math.min(100,item.pct||0);
    if(existing){
      const bar=existing.querySelector('.q-bar'),pctLbl=existing.querySelector('.q-pct');
      const curW=parseFloat(bar.style.width)||0;
      const nextW=item.status==='done'||item.status==='err'?100:Math.max(curW,pct);
      // Force immediate update
      bar.style.width=nextW+'%';bar.className='q-bar'+_barCls(item.status);
      pctLbl.textContent=item.status==='done'?'✅':item.status==='err'?'❌':Math.round(nextW)+'%';
      const titleEl=existing.querySelector('.q-title');
      if(!titleEl.dataset.edited&&_isReal(item.title))titleEl.textContent=item.title;
      if(item.thumb||item.url){
        const wrap=existing.querySelector('.q-thumb-wrap');
        let img=wrap.querySelector('.q-thumb');
        const src=_qThumb(item);
        if(src){
          if(!img){img=document.createElement('img');img.className='q-thumb';img.onerror=()=>{img.style.display='none';};wrap.appendChild(img);}
          if(img.getAttribute('src')!==src){img.style.display='';img.src=src;}
        }
      }
      existing.querySelector('.q-meta').textContent=_meta(item);
    }else{
      const el=_qItem(item);
      const sibs=[...list.querySelectorAll('.q-item')];
      if(i>=sibs.length)list.appendChild(el);else list.insertBefore(el,sibs[i]);
    }
  });
}
function _barCls(s){
  if(s==='done') return ' done';
  if(s==='err') return ' err';
  if(s==='converting') return ' converting';
  if(s==='merging') return ' converting';
  if(s==='embedding') return ' converting';
  if(s==='nokia_compat') return ' converting';
  if(s==='queued') return ' queued';
  return '';
}
function _meta(item){
  const fmt=(item.format||'').toUpperCase();const h=item.height?` · ${item.height}p`:'';
  const done=item.bytes_done||0,total=item.total_bytes||0;
  const sz=done>0?` · ${_fb(done)}`+(total>0?`/${_fb(total)}`:''):'';
  const spd=item.speed_str?` · ${item.speed_str}`:'';
  const ico={queued:'⏳',downloading:'📥',converting:'🔄',merging:'🔀',embedding:'🖼️',nokia_compat:'📱',done:'✅',err:'❌'};
  return fmt+h+sz+spd+' '+(ico[item.status]||'');
}
function _fb(b){
  if(!b || b<=0) return '';
  if(b>=1<<30) return (b/(1<<30)).toFixed(1)+'GB';
  if(b>=1<<20) return (b/(1<<20)).toFixed(1)+'MB';
  if(b>=1<<10) return (b/(1<<10)).toFixed(0)+'KB';
  return b+'B';
}
function _qItem(item){
  const row=document.createElement('div');row.className='q-item';row.dataset.uid=item.uid;
  const wrap=document.createElement('div');wrap.className='q-thumb-wrap';
  const ph=document.createElement('div');ph.className='q-thumb-ph';
  ph.textContent=['mp3','m4a','flac','wav','aac','ogg','opus','wma','aiff'].includes(item.format)?'🎵':item.format==='thumbnail'?'📷':'🎬';
  wrap.appendChild(ph);
  const thumbSrc=_qThumb(item);
  // Only show thumbnail if showQueueThumbs is enabled
  if(thumbSrc && S.showQueueThumbs){
    // Check if this item has hidden thumbnail state
    const hiddenThumb = item.hiddenThumb || false;
    const img=document.createElement('img');img.className='q-thumb';img.src=thumbSrc;
    if(hiddenThumb) img.style.display='none';
    img.onerror=()=>{img.style.display='none';};
    // Create a placeholder area that remains even when image is hidden
    const thumbArea=document.createElement('div');thumbArea.className='q-thumb-area';
    thumbArea.appendChild(img);
    img.addEventListener('click',e=>{
      e.stopPropagation();
      const isHidden = img.style.display==='none';
      img.style.display=isHidden?'':'none';
      // Save the state to storage
      item.hiddenThumb = !isHidden;
      chrome.storage.local.get(['yn_hidden_thumbs'],d=>{
        const hiddenThumbs=d.yn_hidden_thumbs || {};
        hiddenThumbs[item.uid]=item.hiddenThumb;
        chrome.storage.local.set({yn_hidden_thumbs:hiddenThumbs});
      });
    });
    // Add click handler to the area to show image if hidden
    thumbArea.addEventListener('click',e=>{
      if(e.target===thumbArea && img.style.display==='none'){
        e.stopPropagation();
        img.style.display='';
        item.hiddenThumb = false;
        chrome.storage.local.get(['yn_hidden_thumbs'],d=>{
          const hiddenThumbs=d.yn_hidden_thumbs || {};
          delete hiddenThumbs[item.uid];
          chrome.storage.local.set({yn_hidden_thumbs:hiddenThumbs});
        });
      }
    });
    wrap.appendChild(thumbArea);
  }
  // Remove site badge as per user request
  row.appendChild(wrap);
  const info=document.createElement('div');info.className='q-info';
  const titleEl=document.createElement('div');titleEl.className='q-title';
  titleEl.textContent=_isReal(item.title)?item.title:(item.title||'📡 טוען...');
  if(!['done','err'].includes(item.status)){
    titleEl.style.cursor='text';titleEl.title='לחץ לשינוי שם';
    titleEl.addEventListener('click',e=>{
      e.stopPropagation();
      const inp_=document.createElement('input');inp_.type='text';inp_.value=titleEl.textContent;
      Object.assign(inp_.style,{width:'100%',background:'#1e2a4a',border:'1px solid #2563eb',borderRadius:'3px',padding:'1px 4px',color:'#e8e8f0',fontSize:'10px',fontWeight:'700',outline:'none'});
      inp_.onclick=ev=>ev.stopPropagation();
      inp_.onblur=()=>{const v=inp_.value.trim();if(v){titleEl.textContent=v;titleEl.dataset.edited='1';if(qItems[item.uid])qItems[item.uid].title=v;}inp_.replaceWith(titleEl);};
      inp_.onkeydown=ev=>{if(ev.key==='Enter')inp_.blur();if(ev.key==='Escape')inp_.replaceWith(titleEl);};
      titleEl.replaceWith(inp_);inp_.focus();inp_.select();
    });
  }
  const metaEl=document.createElement('div');metaEl.className='q-meta';metaEl.textContent=_meta(item);
  const bw=document.createElement('div');bw.className='q-bar-wrap';
  const bar=document.createElement('div');bar.style.width=Math.min(100,item.pct||0)+'%';bar.className='q-bar'+_barCls(item.status);bw.appendChild(bar);
  info.appendChild(titleEl);info.appendChild(metaEl);info.appendChild(bw);row.appendChild(info);
  const pctLbl=document.createElement('div');pctLbl.className='q-pct';
  pctLbl.textContent=item.status==='done'?'✅':item.status==='err'?'❌':Math.round(item.pct||0)+'%';
  row.appendChild(pctLbl);
  const cancel=document.createElement('button');cancel.className='q-cancel';cancel.textContent='✕';
  cancel.addEventListener('click',e=>{
    e.stopPropagation();
    if(['downloading','queued','converting','merging','embedding','nokia_compat'].includes(item.status)){
      fetch(SRV+'/cancel',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({uid:item.uid})
      }).catch(()=>{});
    }
    deletedUids.add(item.uid);
    delete qItems[item.uid];
    save();
    renderQueue();
  });
  row.appendChild(cancel);
  return row;
}

// ── Watch ─────────────────────────────────────────────────────────
function _bindWatch(){
  const addBtn = document.getElementById('watchAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const urlInp = document.getElementById('watchUrl');
      const fmtSel = document.getElementById('watchFormat');
      const url = urlInp ? urlInp.value.trim() : '';
      if (!url) return;
      const type = fmtSel ? fmtSel.value : 'video';
      _addWatch(url, type);
      if (urlInp) urlInp.value = '';
    });
  }
  renderWatch();
}
async function _addWatch(url,type){
  const fmtMap={video:'mp4',audio:'mp3',thumb:'thumbnail'};
  // lastCheck=now so watch_check won't flood old videos as MP4 duplicates
  const item={url,fmt:fmtMap[type]||'mp4',type,lastCheck:Date.now(),added:Date.now(),channelName:'',channelImg:''};
  watchItems.push(item);save();renderWatch();
  try{
    const r=await fetch(SRV+'/channel_info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const d=await r.json();
    if(d.name){item.channelName=d.name;item.channelImg=d.thumb||'';save();renderWatch();}
  }catch{}
}
function renderWatch(){
  const list=document.getElementById('watchList');list.innerHTML='';
  if(!watchItems.length){list.innerHTML='<div class="empty-state">אין מעקבים</div>';return;}
  watchItems.forEach((item,idx)=>{
    const row=document.createElement('div');row.className='watch-item';
    const av=document.createElement('div');
    Object.assign(av.style,{width:'36px',height:'36px',borderRadius:'50%',background:'#1e2a4a',flexShrink:'0',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px'});
    if(item.channelImg){const ci=document.createElement('img');ci.src=item.channelImg;ci.crossOrigin='anonymous';ci.style.cssText='width:36px;height:36px;object-fit:cover;border-radius:50%;';ci.onerror=()=>{ci.remove();av.textContent='📺';};av.appendChild(ci);}
    else av.textContent='📺';
    row.appendChild(av);
    const col=document.createElement('div');Object.assign(col.style,{flex:'1',minWidth:'0',overflow:'hidden'});
    const nm=document.createElement('div');nm.style.cssText='font-size:11px;font-weight:700;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    nm.textContent=item.channelName&&item.channelName.length>1?item.channelName:_shortUrl(item.url);nm.title=item.url;
    const dt=document.createElement('div');dt.style.cssText='font-size:9px;color:#555;';
    dt.textContent=(item.fmt||'mp4').toUpperCase()+' · '+(item.lastCheck>0?_ago(item.lastCheck):'טרם נבדק');
    col.appendChild(nm);col.appendChild(dt);row.appendChild(col);
    const dlBtn_=document.createElement('button');dlBtn_.textContent='⬇';
    Object.assign(dlBtn_.style,{background:'linear-gradient(135deg,#1e2a4a,#1d4ed8)',border:'none',borderRadius:'5px',color:'#93c5fd',cursor:'pointer',padding:'4px 8px',fontSize:'11px',fontWeight:'700',flexShrink:'0'});
    dlBtn_.addEventListener('click',()=>{
      const body={url:item.url,format:item.fmt,speed:S.defSpeed};
      if(S.basePath)body.base_path=S.basePath;
      if(S.folderChannel)body.folder_channel=true;
      _pushCookies(true).catch(()=>{}).finally(()=>{
        fetch(SRV+'/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).catch(()=>{});
      });
      showSt('ok','✅ '+(nm.textContent)+' נשלח');
    });
    row.appendChild(dlBtn_);
    const del=document.createElement('button');del.className='q-cancel';del.textContent='✕';
    del.addEventListener('click',()=>{watchItems.splice(idx,1);save();renderWatch();});
    row.appendChild(del);list.appendChild(row);
  });
}
function _shortUrl(u){try{const p=new URL(u);return(p.pathname.replace(/^\/@?/,'')||p.hostname.replace('www.','')).slice(0,22);}catch{return u.slice(0,22);}}
function _ago(ts){const d=Date.now()-ts;if(d<60000)return'עכשיו';if(d<3600000)return Math.floor(d/60000)+'ד';return Math.floor(d/3600000)+'ש';}
setInterval(()=>{watchItems.forEach(item=>{
  fetch(SRV+'/watch_check',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({url:item.url,format:item.fmt,since:item.lastCheck,speed:S.defSpeed,base_path:S.basePath||undefined})})
    .then(r=>r.json()).then(d=>{console.log('Watch check response:',d);item.lastCheck=Date.now();save();if(aTab==='watch')renderWatch();}).catch(e=>{console.error('Watch check error:',e);});
});},10*60*1000);

// ── Settings ──────────────────────────────────────────────────────
function _bindSettings(){
  const dm=document.getElementById('darkMode');dm.checked=S.darkMode;
  dm.addEventListener('change',()=>{S.darkMode=dm.checked;applyTheme();save();});
  const ds=document.getElementById('defSpeed');ds.value=S.defSpeed;
  const desc=document.getElementById('spdDesc');if(desc)desc.textContent=SPD_DESCS[S.defSpeed]||'';
  ds.addEventListener('change',()=>{S.defSpeed=ds.value;save();if(desc)desc.textContent=SPD_DESCS[S.defSpeed]||'';
    fetch(SRV+'/set_speed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({speed:S.defSpeed})}).catch(()=>{});
  });
  const bp=document.getElementById('basePath');bp.value=S.basePath||'';
  bp.addEventListener('click',()=>{
    const entered=prompt('נתיב תיקיית הורדות (ללא שם YoniTube):\nלדוגמה: C:\\Users\\שם\\Downloads',S.basePath||'');
    if(entered!==null){
      const p=entered.trim().replace(/^["']|["']$/g,'');
      bp.value=p;S.basePath=p;save();
      showSt('ok','✅ נתיב נשמר: '+p);setTimeout(clearSt,2000);
    }
  });
  document.getElementById('savePathBtn')?.addEventListener('click',()=>{
    S.basePath=bp.value.trim().replace(/^["']|["']$/g,'');bp.value=S.basePath;save();
    showSt('ok','✅ נשמר');setTimeout(clearSt,1400);
  });
  const fp=document.getElementById('folderPlaylist');fp.checked=S.folderPlaylist;fp.addEventListener('change',()=>{S.folderPlaylist=fp.checked;save();});
  const fc=document.getElementById('folderChannel');fc.checked=S.folderChannel;fc.addEventListener('change',()=>{S.folderChannel=fc.checked;save();});
  const sq=document.getElementById('showQueueThumbs');sq.checked=S.showQueueThumbs;sq.addEventListener('change',()=>{S.showQueueThumbs=sq.checked;save();renderQueue();});
  document.getElementById('factoryResetBtn')?.addEventListener('click',()=>{
    if(!confirm('לאפס לגדרות יצרן?'))return;
    S={...DEFAULT_S};save();applyTheme();
    dm.checked=S.darkMode;ds.value=S.defSpeed;bp.value='';fp.checked=false;fc.checked=false;sq.checked=true;
    if(desc)desc.textContent=SPD_DESCS[S.defSpeed]||'';
    showSt('ok','✅ אופס');setTimeout(clearSt,1400);
  });
  // Button editor
  _bindButtonEditor();
}

// ─– Button Editor ───────────────────────────────────────────────────
function _bindButtonEditor(){
  const btnText=document.getElementById('btnText');
  const btnColor=document.getElementById('btnColor');
  const btnTextColor=document.getElementById('textColor');
  const btnShape=document.getElementById('btnShape');
  const borderWidth=document.getElementById('borderWidth');
  const borderColor=document.getElementById('borderColor');
  const btnShadowOn=document.getElementById('btnShadowOn');
  const btnShadowSize=document.getElementById('btnShadowSize');
  const btnShadowSizeLbl=document.getElementById('btnShadowSizeLbl');
  const btnShadowColor=document.getElementById('btnShadowColor');
  const textShadowOn=document.getElementById('textShadowOn');
  const textShadowSize=document.getElementById('textShadowSize');
  const textShadowSizeLbl=document.getElementById('textShadowSizeLbl');
  const textShadowColor=document.getElementById('textShadowColor');
  const previewBtn=document.getElementById('previewBtn');
  const BTN_STORAGE = 'yt_global_button_data';
  const DOWNLOAD_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 16l4-5h-3V4h-2v7H8l4 5z"/><path d="M4 18h16v2H4z"/></svg>';

  // Symbol keyboard — build with categories, open only on input focus
  const symKb = document.getElementById('symbolKeyboard');
  const symGrid = document.getElementById('symbolGrid');
  let _symCat = 'media';

  const SYMBOLS = {
    media: ['🎬','🎵','🎧','🎶','🎤','🎥','🎞️','🎙️','💿','📀','📼','📽️','📺','📻','📹','🎚️','🎛️','🔊','🔉','🔈','🔇','🔔','🔕','🎼','🎻','🎷','🎸','🥁','🎹','🎺'],
    download: ['⬇','⬆','⬅','➡','⬇️','⬆️','⬅️','➡️','📥','📤','💾','⤵','⤴','⤓','⤒','↓','↑','←','→','↧','↥','↩','↪','🔽','🔼','⏬','⏫','⏭','⏮'],
    arrows: ['▲','▼','◀','▶','◆','◇','➜','➤','➢','➣','➥','➦','➧','➨','➩','➪','➫','➬','➭','➮','➯','⮕','⬉','⬈','⬊','⬋','↗','↘','↙','↖','⇧','⇩','⇦','⇨','⇪','⇫','⇬','⇭','⇮','⇯'],
    shapes: ['●','○','◉','◎','◍','◌','◆','◇','■','□','▪','▫','▬','▭','▮','▯','▲','△','▼','▽','◀','◁','▶','▷','⬢','⬡','⬣','⬠','⬡','★','☆','✦','✧','♦','♢','♥','♡','♠','♤','♣','♧'],
    symbols: ['✓','✔','✅','☑','✗','✘','❌','✖','⚠️','⚠','❗','❕','❓','❔','♪','♫','♩','♬','¶','§','#','&','*','@','©','®','™','℠','№','↯','∞','∆','∇','∏','∑','√','∛','±','×','÷','=','≠','≈','≡','≤','≥','∠','⊥','∥','∩','∪','⊂','⊃','⊆','⊇','∅','∀','∃','∄','∈','∉','∋','∌','∝','°','′','″'],
    money: ['₪','$','€','£','¥','₩','₹','₽','₿','¢','ƒ','฿','₫','₡','₲','₴','₵','₦','₱','₸','₺','₼','₾','৳','៛','₪','$','€'],
    math: ['∞','∆','∇','∏','∑','∫','∬','∭','∮','√','∛','±','∓','×','÷','=','≠','≈','≡','≅','∼','≃','≤','≥','<','>','∠','⊥','∥','∩','∪','⊂','⊃','⊆','⊇','⊕','⊗','∅','∀','∃','∄','∈','∉','∋','∌','∝','°','π','π','μ','σ','Σ','Ω','ω','α','β','γ','δ','ε','ζ','η','θ','λ','ρ','τ','φ','χ','ψ'],
    emoji: ['🔥','⭐','❤️','💕','💖','💙','💚','💛','💜','🖤','🤍','🤎','💔','✅','❌','⚠️','🚀','📱','💻','⌨️','🖥️','🖨️','⌚','🎯','✨','🌟','💫','⭐','🌈','☀️','🌙','⚡','☁️','🌊','🔥','💧','🌱','🌿','🍀','🌸','🌺','🎨','🎭','🎮','🎲','🎯','🏆','🥇','🥈','🥉','🎁','🎈','🎉','🎊','💡','🔑','🔒','🔓','🛒','💳','💰','💎','👑','🤖','🎪'],
    text: ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7','8','9','.',',','!','?',':',';','-','_','=','+','(',')','[',']','{','}','<','>','/','\\','|','"',"'",'`','~','^','%']
  };
  SYMBOLS.all = [...new Set([...SYMBOLS.media, ...SYMBOLS.download, ...SYMBOLS.arrows, ...SYMBOLS.shapes, ...SYMBOLS.symbols, ...SYMBOLS.money, ...SYMBOLS.math, ...SYMBOLS.emoji, ...SYMBOLS.text])];

  function renderSymbols(){
    const list = SYMBOLS[_symCat] || [];
    symGrid.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(sym => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = sym;
      b.title = sym;
      b.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const start = btnText.selectionStart ?? btnText.value.length;
        const end = btnText.selectionEnd ?? btnText.value.length;
        btnText.value = btnText.value.slice(0,start) + sym + btnText.value.slice(end);
        btnText.selectionStart = btnText.selectionEnd = start + sym.length;
        btnText.focus();
        savePopupState();
        updatePreview();
      });
      frag.appendChild(b);
    });
    symGrid.appendChild(frag);
  }
  renderSymbols();

  document.querySelectorAll('.sym-cat-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.sym-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _symCat = btn.dataset.cat || 'media';
      renderSymbols();
    });
  });

  // Open keyboard only when input focused
  btnText.addEventListener('focus', () => symKb.classList.add('open'));
  btnText.addEventListener('click', () => symKb.classList.add('open'));
  // Close when clicking outside keyboard + input
  document.addEventListener('mousedown', e => {
    if (!symKb.contains(e.target) && e.target !== btnText) {
      symKb.classList.remove('open');
    }
  }, true);

  // Listen for copied style from content script
  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg&&msg.type==='copied_button_settings'&&msg.settings){
      const bs=msg.settings||{};
      if(bs.text!==undefined)btnText.value=bs.text;
      if(bs.color)btnColor.value=bs.color;
      if(bs.textColor)btnTextColor.value=bs.textColor;
      if(bs.borderRadius)btnShape.value=bs.borderRadius;
      if(bs.borderWidth!==undefined)borderWidth.value=parseInt(bs.borderWidth)||0;
      if(bs.borderColor)borderColor.value=bs.borderColor;
      if(bs.btnShadowOn!==undefined)btnShadowOn.checked=bs.btnShadowOn;
      if(bs.btnShadowSize!==undefined)btnShadowSize.value=bs.btnShadowSize;
      if(bs.btnShadowColor)btnShadowColor.value=bs.btnShadowColor;
      if(bs.textShadowOn!==undefined)textShadowOn.checked=bs.textShadowOn;
      if(bs.textShadowSize!==undefined)textShadowSize.value=bs.textShadowSize;
      if(bs.textShadowColor)textShadowColor.value=bs.textShadowColor;
      updateShadowLabels();
      savePopupState();
      updatePreview();
      showSt('ok','🎯 עיצוב הכפתור הועתק! ערוך אותו כאן ולחץ הוסף');
      setTimeout(clearSt,2500);
      _activateTab('button');
    }
    return true;
  });

  // Load saved button settings (including copied settings if popup closed before message arrived)
  chrome.storage.local.get([BTN_STORAGE, 'yn_button_settings', 'yn_copied_button_settings'], r => {
    const fromGlobal = r[BTN_STORAGE];
    const fromPopup = r.yn_button_settings || {};
    const fromCopy = r.yn_copied_button_settings || null;
    // Prefer latest copied settings (most recent copy intent); fall back to saved
    const bs = fromCopy || (fromGlobal && fromGlobal.settings) || fromPopup;
    function applyBs(){
      if(bs.text !== undefined) btnText.value = bs.text;
      if(bs.color) btnColor.value = bs.color;
      if(bs.textColor) btnTextColor.value = bs.textColor;
      else {
        btnTextColor.value = getBrightness(btnColor.value) > 140 ? '#0f0f0f' : '#ffffff';
      }
      if(bs.borderRadius) btnShape.value = bs.borderRadius;
      if(bs.borderWidth !== undefined) borderWidth.value = parseInt(bs.borderWidth);
      if(bs.borderColor) borderColor.value = bs.borderColor;
      if(bs.btnShadowOn !== undefined) btnShadowOn.checked = bs.btnShadowOn;
      if(bs.btnShadowSize !== undefined) btnShadowSize.value = bs.btnShadowSize;
      if(bs.btnShadowColor) btnShadowColor.value = bs.btnShadowColor;
      if(bs.textShadowOn !== undefined) textShadowOn.checked = bs.textShadowOn;
      if(bs.textShadowSize !== undefined) textShadowSize.value = bs.textShadowSize;
      if(bs.textShadowColor) textShadowColor.value = bs.textShadowColor;
      updateShadowLabels();
      updatePreview();
    }
    if (fromCopy) {
      // If we have copied data, clear it so next popup opens fresh
      chrome.storage.local.remove(['yn_copied_button_settings'], () => applyBs());
    } else {
      applyBs();
    }
    if (fromCopy) _activateTab('button');
  });

  function updateShadowLabels() {
    btnShadowSizeLbl.textContent = btnShadowSize.value + 'px';
    textShadowSizeLbl.textContent = textShadowSize.value + 'px';
  }

  // עדכון התצוגה המקדימה בזמן אמת
  function updatePreview(){
    const hasText = (btnText.value || '').trim() !== '';
    const isCircle = btnShape.value === '50%';
    if (hasText) {
      previewBtn.innerText = btnText.value;
    } else {
      previewBtn.innerHTML = DOWNLOAD_SVG;
    }
    previewBtn.style.backgroundColor = btnColor.value;
    previewBtn.style.borderRadius = btnShape.value;
    previewBtn.style.color = btnTextColor.value;
    if (hasText) {
      previewBtn.style.fontWeight = 'bold';
      previewBtn.style.whiteSpace = 'pre';
      previewBtn.style.display = 'inline-flex';
      previewBtn.style.alignItems = 'center';
      previewBtn.style.justifyContent = 'center';
      previewBtn.style.boxSizing = 'border-box';
      if (isCircle) {
        // Circle with text: force perfect circle - width always equals height
        // Use uniform padding and start with a safe square size; we'll fine-tune below
        previewBtn.style.padding = '10px';
        previewBtn.style.width = '90px';
        previewBtn.style.height = '90px';
        previewBtn.style.minWidth = '';
      } else {
        previewBtn.style.width = 'auto';
        previewBtn.style.height = 'auto';
        previewBtn.style.minWidth = '90px';
        previewBtn.style.padding = '8px 16px';
      }
    } else {
      previewBtn.style.width = '40px';
      previewBtn.style.height = '40px';
      previewBtn.style.padding = '0';
      previewBtn.style.fontWeight = '';
      previewBtn.style.whiteSpace = '';
      previewBtn.style.display = 'flex';
      previewBtn.style.alignItems = 'center';
      previewBtn.style.justifyContent = 'center';
    }
    const bw = parseInt(borderWidth.value) || 0;
    if (bw > 0) {
      previewBtn.style.border = `${bw}px solid ${borderColor.value}`;
    } else {
      previewBtn.style.border = 'none';
    }
    // Shadows
    if (btnShadowOn.checked && parseInt(btnShadowSize.value) > 0) {
      previewBtn.style.boxShadow = `0px 4px ${btnShadowSize.value}px ${btnShadowColor.value}`;
    } else {
      previewBtn.style.boxShadow = 'none';
    }
    if (textShadowOn.checked && parseInt(textShadowSize.value) > 0) {
      previewBtn.style.textShadow = `0px 1px ${textShadowSize.value}px ${textShadowColor.value}`;
    } else {
      previewBtn.style.textShadow = 'none';
    }
    // Circle with text - after the first render pass, expand square to fit content
    if (hasText && isCircle) {
      setTimeout(() => {
        const w = previewBtn.scrollWidth;
        const h = previewBtn.scrollHeight;
        const size = Math.max(90, w, h);
        previewBtn.style.width = size + 'px';
        previewBtn.style.height = size + 'px';
        // Re-apply border/shadow in case of style reset (shouldn't happen but safe)
        if (bw > 0) {
          previewBtn.style.border = `${bw}px solid ${borderColor.value}`;
        }
      }, 0);
    }
  }

  function getBrightness(hex) {
    const v = (hex || '').replace('#', '');
    if (v.length < 6) return 200;
    const r = parseInt(v.substr(0, 2), 16);
    const g = parseInt(v.substr(2, 2), 16);
    const b = parseInt(v.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  // האזנה לשינויים בשדות
  [btnText,btnColor,btnTextColor,btnShape,borderWidth,borderColor,btnShadowOn,btnShadowSize,btnShadowColor,textShadowOn,textShadowSize,textShadowColor].forEach(el=>{
    el.addEventListener('input', () => {
      savePopupState();
      updateShadowLabels();
      updatePreview();
    });
  });

  function currentSettings() {
    return {
      text: btnText.value,
      icon: (btnText.value || '').trim() === '',
      color: btnColor.value,
      textColor: btnTextColor.value,
      borderRadius: btnShape.value,
      borderWidth: String(borderWidth.value || '0'),
      borderColor: borderColor.value,
      btnShadowOn: btnShadowOn.checked,
      btnShadowSize: String(btnShadowSize.value || '0'),
      btnShadowColor: btnShadowColor.value,
      textShadowOn: textShadowOn.checked,
      textShadowSize: String(textShadowSize.value || '0'),
      textShadowColor: textShadowColor.value
    };
  }

  function savePopupState() {
    chrome.storage.local.set({ yn_button_settings: currentSettings() });
  }

  // מנגנון מזרק צבע (EyeDropper)
  async function pickColor(targetInput){
    if(!window.EyeDropper){
      alert('מזרק הצבע אינו נתמך בדפדפן זה');
      return;
    }
    const eyeDropper=new EyeDropper();
    try{
      const result=await eyeDropper.open();
      targetInput.value=result.sRGBHex;
      savePopupState();
      updatePreview();
    }catch(e){}
  }

  document.getElementById('pickColorBtn')?.addEventListener('click',()=>pickColor(btnColor));
  document.getElementById('pickTextColorBtn')?.addEventListener('click',()=>pickColor(btnTextColor));
  document.getElementById('pickBorderColorBtn')?.addEventListener('click',()=>pickColor(borderColor));

  // יצירת הכפתור בדף (פותח מצב עריקה -- גרר, שנה גודל, ואז Enter לשמירה)
  document.getElementById('addBtn')?.addEventListener('click',async()=>{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)return;

    try{
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    }catch(e){}

    chrome.tabs.sendMessage(tab.id, { action: 'spawn_button', settings: currentSettings() });
    showSt('ok','✅ גרר את הכפתור למקום הרצוי, שנה גודל ולחץ Enter לשמירה');
  });

  // מצב הצבה מדויקת: הכפתור עוקב אחרי העכבר בדף עד ללחיצה (כמו גרור מתצוגה מקדימה)
  async function triggerPlaceOnPage(){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)return;
    try{
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    }catch(e){}
    chrome.tabs.sendMessage(tab.id,{action:'spawn_button_place_mode',settings:currentSettings()});
    showSt('ok','📍 עבור לעמוד יוטיוב — הכפתור עוקב אחרי העכבר, לחץ כדי להציב, Esc לביטול');
    // try to close popup so user can interact with page; otherwise user sees the hint
    try { window.close(); } catch(e){}
  }
  // Make preview draggable: click/drag start → close popup and pass to page's place mode
  previewBtn.setAttribute('draggable', 'true');
  previewBtn.style.cursor = 'grab';
  previewBtn.title = '✨ גרור אותי לעמוד יוטיוב או לחץ כאן כדי להתחיל';
  previewBtn.addEventListener('mousedown', (e) => {
    try { previewBtn.style.cursor = 'grabbing'; } catch(err) {}
  });
  previewBtn.addEventListener('mouseup', (e) => {
    try { previewBtn.style.cursor = 'grab'; } catch(err) {}
  });
  previewBtn.addEventListener('dragstart',(e)=>{
    e.preventDefault();
    triggerPlaceOnPage();
  });
  previewBtn.addEventListener('click',(e)=>{
    e.preventDefault();
    triggerPlaceOnPage();
  });

  // העתקת עיצוב כפתור קיים ביוטיוב (copy mode)
  document.getElementById('copyBtnStyle')?.addEventListener('click',async()=>{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)return;
    try{
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    }catch(e){}
    chrome.tabs.sendMessage(tab.id,{action:'enable_copy_mode'});
    showSt('ok','🎯 עבור לעמוד יוטיוב ולחץ על כפתור כדי להעתיק את עיצובו');
  });

  // מחיקת אלמנטים ביוטיוב (mode)
  document.getElementById('deleteElementBtn')?.addEventListener('click',async()=>{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)return;

    try{
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    }catch(e){}
    chrome.tabs.sendMessage(tab.id,{action:'enable_delete_mode'});
    showSt('ok','✅ מצב מחיקה מופעל - לחץ על אלמנט למחיקה');
  });

  // איפוס כל הכפתורים ביוטיוב
  document.getElementById('resetAllBtn')?.addEventListener('click',async()=>{
    if(!confirm('לאפס את כל הכפתורים ביוטיוב?'))return;
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)return;

    try{
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    }catch(e){}
    chrome.tabs.sendMessage(tab.id,{action:'reset_all_buttons'});
    showSt('ok','✅ כל הכפתורים אופסו');
  });

  // הפעלה ראשונית של התצוגה המקדימה
  updatePreview();
}