"""
YoniTube Server v27 — by. The_Yonatan
תיקונים עיקריים:
• שמות קבצים תקינים — rename משתמש ב-basename בלבד
• כתוביות עובדות — MKV תמיד + srt/vtt
• MP4 תמיד H.264+AAC — אין מסך שחור, אין חסר שמע
• aria2c / ffmpeg / yt-dlp — הורדה אוטומטית אם חסרים + עדכון אוטומטי של yt-dlp
• התקדמות חיה — active_map מתעדכן עם bytes/speed בכל קו
• פס כחול בהורדה (צהוב רק בהמרה אמיתית)
• עטיפה מיידית מ-i.ytimg + כותרת מהלקוח
• AVI: mpeg4+mp3 (לא libx264/aac)
• מניעת כפילויות בתור + watch_check לא מציף
• player_client=default — לקוחות android/ios מתים, ניסיון חוזר עם קבוצה רחבה
• retry על "page needs to be reloaded" / PO token / format not available
• תיקון seed_title ב-/download ריבוי פורמטים + זיהוי שורטס ב-list_playlist
"""
import subprocess, os, sys, urllib.request, shutil, hashlib, json, glob, tempfile
import threading, re, time, random, psutil, multiprocessing, logging
import queue as Q, zipfile as ZF
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from mutagen.id3 import ID3, APIC, TIT2, TPE1, ID3NoHeaderError

app = Flask(__name__); CORS(app)

# ── Paths ──────────────────────────────────────────────────────────
if getattr(sys,'frozen',False):
    _BD = sys._MEIPASS; _ED = os.path.dirname(sys.executable)
else:
    _BD = os.path.dirname(os.path.abspath(__file__)); _ED = _BD
BASE_DIR = _ED

def _bundle_path(name):
    for base in (_BD, _ED):
        if base:
            p = os.path.join(base, name)
            if os.path.exists(p):
                return p
    return shutil.which(name) or name

YT_DLP  = _bundle_path('yt-dlp.exe')
FFMPEG  = _bundle_path('ffmpeg.exe')
FFPROBE = _bundle_path('ffprobe.exe')
_aria   = _bundle_path('aria2c.exe')
ARIA2C  = _aria if os.path.exists(_aria) else (shutil.which('aria2c') or '')
DL_DIR  = os.path.join(os.path.expanduser('~'),'Downloads','YoniTube (by. The_Yonatan)')

_LOG = os.path.join(BASE_DIR,'yonitube.log')
logging.basicConfig(filename=_LOG,level=logging.INFO,format='%(asctime)s %(message)s',encoding='utf-8')
_lg = logging.getLogger('yn')
_plock = threading.Lock()
ANSI = re.compile(r'\x1b\[[0-9;]*m')
def _p(*a, end='\n', flush=True):
    msg = ' '.join(str(x) for x in a)
    safe_msg = ANSI.sub('', msg).rstrip()
    with _plock:
        print(safe_msg, end=end, flush=flush)
    _lg.info(safe_msg)

_cores  = max(1,(psutil.cpu_count(logical=False) or multiprocessing.cpu_count())-1)
_RAM    = psutil.virtual_memory().total/(1024**3)
# Dynamic worker count based on CPU cores and RAM
MAX_W   = min(8, max(3, _cores * 2)) if _RAM >= 8 else min(4, max(2, _cores))
TIMEOUT = 7200; RETRIES = 3

# ── Auto-download deps ─────────────────────────────────────────────
def _dl(url, dest, label):
    _p(f'  ⬇️  {label}...')
    last=[0]
    def _prog(n,bs,tot):
        if tot>0:
            p=min(100,int(n*bs*100/tot))
            if p-last[0]>=20: _p(f'      {p}%'); last[0]=p
    tmp=dest+'.tmp'
    try:
        urllib.request.urlretrieve(url,tmp,reporthook=_prog)
        os.replace(tmp,dest); _p(f'  ✅ {label} ({os.path.getsize(dest)//1024}KB)'); return True
    except Exception as e:
        _p(f'  ❌ {label}: {e}')
        try: os.remove(tmp)
        except: pass
        return False

def _dl_zip(url, dest_dir, filenames, label):
    tmp=os.path.join(dest_dir,'_tmp.zip')
    last=[0]
    def _prog(n,bs,tot):
        if tot>0:
            p=min(100,int(n*bs*100/tot))
            if p-last[0]>=20: _p(f'      {p}%'); last[0]=p
    _p(f'  ⬇️  {label}...')
    try:
        urllib.request.urlretrieve(url,tmp,reporthook=_prog)
        with ZF.ZipFile(tmp,'r') as z:
            for m in z.namelist():
                b=os.path.basename(m).lower()
                if b in filenames:
                    dst=os.path.join(dest_dir,os.path.basename(m))
                    with z.open(m) as s, open(dst,'wb') as d: d.write(s.read())
                    _p(f'  ✅ {os.path.basename(m)} ({os.path.getsize(dst)//1024}KB)')
        os.remove(tmp); return True
    except Exception as e:
        _p(f'  ❌ {label}: {e}')
        try: os.remove(tmp)
        except: pass
        return False

def _ytdlp_version():
    try:
        r=subprocess.run([YT_DLP,'--version'],capture_output=True,text=True,timeout=30,encoding='utf-8',errors='replace')
        if r.returncode==0: return (r.stdout or '').strip()
    except Exception: pass
    return ''

def _ytdlp_latest():
    try:
        req=urllib.request.Request('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',
                                   headers={'User-Agent':'YoniTube'})
        with urllib.request.urlopen(req,timeout=15) as resp:
            return (json.load(resp).get('tag_name') or '').strip()
    except Exception as e:
        _p(f'  ⚠️ yt-dlp update check: {e}')
        return ''

def ensure_deps():
    global ARIA2C
    if not os.path.exists(YT_DLP):
        _dl('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',YT_DLP,'yt-dlp')
    if not os.path.exists(FFMPEG) or not os.path.exists(FFPROBE):
        _dl_zip('https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip',
                _BD,{'ffmpeg.exe','ffprobe.exe'},'ffmpeg 7.1')
    if not ARIA2C or not os.path.exists(ARIA2C):
        ok=_dl_zip('https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip',
                   _BD,{'aria2c.exe'},'aria2c')
        if ok: ARIA2C=os.path.join(_BD,'aria2c.exe')
    # Auto-update yt-dlp when a newer release exists — YouTube breaks old builds fast
    ver=_ytdlp_version()
    latest=_ytdlp_latest() if ver else ''
    if ver and latest and ver!=latest:
        _p(f'  🔄 מעדכן yt-dlp {ver} → {latest}')
        if _dl('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',YT_DLP,'yt-dlp'):
            ver=_ytdlp_version()
    if ver: _p(f'  ✅ yt-dlp זמין (v{ver})')
    else: _p('  ⚠️ yt-dlp לא זמין')

_p('\n'+'═'*60)
_p('  YoniTube Server v27  by. The_Yonatan')
_p('═'*60)
ensure_deps()
for n,p in [('yt-dlp',YT_DLP),('ffmpeg',FFMPEG),('ffprobe',FFPROBE)]:
    _p(f'  {"✅" if os.path.exists(p) else "❌"} {n}')
_p(f'  {"✅" if ARIA2C and os.path.exists(ARIA2C) else "⚠️ "} aria2c: {ARIA2C or "חסר"}')
_p(f'  🌐 http://127.0.0.1:5000   📁 {DL_DIR}')
_p('═'*60+'\n')

# ── Cookies ────────────────────────────────────────────────────────
COOKIE_ARGS: list = []

def _validate_cookies_text(txt):
    txt = (txt or '').strip()
    if not txt:
        return True, ''
    fd, tmp_path = tempfile.mkstemp(prefix='yn-cookies-', suffix='.txt')
    os.close(fd)
    try:
        with open(tmp_path, 'w', encoding='utf-8') as fh:
            fh.write(txt)
        import http.cookiejar as cj
        jar = cj.MozillaCookieJar(tmp_path)
        jar.load(ignore_discard=True, ignore_expires=True)
        return True, ''
    except Exception as exc:
        return False, f'invalid cookie file: {exc}'
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

def _init_cookies():
    global COOKIE_ARGS
    cf=os.path.join(BASE_DIR,'cookies.txt')
    if os.path.exists(cf) and os.path.getsize(cf)>100:
        ok, msg = _validate_cookies_text(open(cf, 'r', encoding='utf-8', errors='replace').read())
        if ok:
            COOKIE_ARGS=['--cookies',cf]; _p('🍪 cookies.txt נמצא')
        else:
            COOKIE_ARGS=[]; _p(f'🍪 cookies.txt לא תקין: {msg}')
_init_cookies()

_UAS=['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36']

# ── Formats ────────────────────────────────────────────────────────
AUDIO_FMTS={'mp3','m4a','wav','flac','aac','ogg','opus','wma','aiff'}
VIDEO_FMTS={'mp4','mkv','webm','mov','avi','flv','mpg','mpeg','3gp','ts'}
VALID_FMTS=AUDIO_FMTS|VIDEO_FMTS|{'thumbnail'}
_NEEDS_RECODE={'avi','mov','mpg','mpeg','3gp','ts','wmv','flv','asf','rm','rmvb','divx','xvid'}
_FF_CODEC={
    # AVI: mpeg4+mp3 — libx264/aac לעיתים נכשלים ב-mux ל-AVI
    'avi': ['-c:v','mpeg4','-q:v','5','-c:a','libmp3lame','-b:a','192k','-pix_fmt','yuv420p'],
    'mov': ['-c:v','libx264','-preset','fast','-crf','22','-c:a','aac','-b:a','192k','-movflags','+faststart'],
    'mpg': ['-c:v','mpeg2video','-q:v','4','-c:a','mp2','-b:a','192k'],
    'mpeg':['-c:v','mpeg2video','-q:v','4','-c:a','mp2','-b:a','192k'],
    '3gp': ['-c:v','libx264','-profile:v','baseline','-level','3.0','-c:a','aac','-b:a','64k','-pix_fmt','yuv420p'],
    'ts':  ['-c:v','libx264','-preset','fast','-c:a','aac','-b:a','192k'],
    'flv': ['-c:v','flv1','-q:v','5','-c:a','libmp3lame','-b:a','160k'],
    'wmv': ['-c:v','wmv2','-q:v','5','-c:a','wmav2','-b:a','192k'],
    'asf': ['-c:v','wmv2','-q:v','5','-c:a','wmav2','-b:a','192k'],
    'rm':  ['-c:v','libx264','-preset','fast','-crf','22','-c:a','aac','-b:a','192k'],
    'rmvb':['-c:v','libx264','-preset','fast','-crf','22','-c:a','aac','-b:a','192k'],
    'divx':['-c:v','mpeg4','-q:v','5','-c:a','libmp3lame','-b:a','192k','-pix_fmt','yuv420p'],
    'xvid':['-c:v','mpeg4','-q:v','5','-c:a','libmp3lame','-b:a','192k','-pix_fmt','yuv420p'],
}
_FF_AUDIO={'wma':['-c:a','wmav2','-b:a','192k'],'aiff':['-c:a','pcm_s16be']}
_THUMB_OK={'mp3','m4a','aac','flac','opus'}
_ff_sem=threading.Semaphore(2)
_ff_thr=max(1,_cores//2)

def _vsel(h=None,w=None):
    """Prefer H.264+AAC, always end with broad fallbacks (YouTube changes often)."""
    c=(f'[height<={h}]' if h else '')+(f'[width<={w}]' if w else '')
    return '/'.join([
        f'bestvideo[ext=mp4][vcodec^=avc1]{c}+bestaudio[ext=m4a]/bestaudio',
        f'bestvideo[vcodec^=avc1]{c}+bestaudio/best',
        f'bestvideo[ext=mp4]{c}+bestaudio/best',
        f'bestvideo{c}+bestaudio/best',
        f'best[height<={h}]' if h else 'best[ext=mp4]',
        'best/b',
    ])

def _safe_folder(name):
    n=re.sub(r'[<>:"/\\|?*\x00-\x1f]',' ',(name or '').strip()).strip(' .')
    n=re.sub(r'\s+',' ',n)
    return (n[:80] or 'Unknown')

def _resolve_dl_dir(base_path=''):
    """Resolve user download root → .../YoniTube (by. The_Yonatan)."""
    if not base_path or not str(base_path).strip():
        return DL_DIR
    p=os.path.expandvars(os.path.expanduser(str(base_path).strip().strip('"').strip("'")))
    # Accept forward slashes on Windows
    p=os.path.normpath(p)
    if not os.path.isabs(p):
        p=os.path.join(os.path.expanduser('~'),p)
    target_dir=os.path.join(p,'YoniTube (by. The_Yonatan)')
    # Check if the path is accessible
    try:
        os.makedirs(target_dir,exist_ok=True)
        # Test write access
        test_file=os.path.join(target_dir,'.write_test')
        with open(test_file,'w') as f:
            f.write('test')
        os.remove(test_file)
        return target_dir
    except (OSError,PermissionError,FileNotFoundError) as e:
        _p(f'⚠️  נתיב הורדה לא זמין: {p} ({e}) - חוזר לנתיב ברירת מחדל')
        return DL_DIR

def _utfenv():
    e=os.environ.copy(); e['PYTHONUTF8']='1'; e['PYTHONIOENCODING']='utf-8'; return e

def process_audio_for_legacy_nokia(mp3_path, raw_image_path, title, artist):
    """Process MP3 for legacy Nokia devices with proper ID3v2.3 and UTF-16 encoding."""
    # Use the same directory as the MP3 for temp file
    temp_img = os.path.join(os.path.dirname(mp3_path), "t.jpg")
    _p(f'🔧 Nokia compat: {os.path.basename(mp3_path)} with {os.path.basename(raw_image_path)}')
    try:
        # 1. שמירה על הרזולוציה המקורית המלאה של התמונה
        with Image.open(raw_image_path) as img:
            img = img.convert('RGB')
            img.save(temp_img, 'JPEG', progressive=False, quality=95)
        _p(f'  ✅ Image saved to {temp_img} (original resolution)')
            
        # 2. ניקוי ויצירת תגית ID3v2.3 חדשה מאפס ללא שאריות וזבל
        try:
            tags = ID3(mp3_path)
        except ID3NoHeaderError:
            tags = ID3()
            
        tags.clear()
        tags.update_to_v23()
        _p(f'  ✅ ID3 tags cleared and updated to v2.3')
        
        # 3. הזרקת התמונה - אותיות גדולות בלבד ב-MIME (הסוד של נוקיה!)
        with open(temp_img, 'rb') as img_file:
            img_data = img_file.read()
            tags.add(APIC(
                encoding=0,          
                mime='IMAGE/JPEG',     
                type=3,                
                desc='',                
                data=img_data
            ))
        _p(f'  ✅ APIC tag added with IMAGE/JPEG ({len(img_data)} bytes)')
            
        # 4. הזרקת שם השיר בעברית (UTF-16 עם BOM)
        clean_title = title.encode('utf-8', errors='ignore').decode('utf-8')
        clean_artist = artist.encode('utf-8', errors='ignore').decode('utf-8')
        tags.add(TIT2(encoding=1, text=[clean_title]))
        tags.add(TPE1(encoding=1, text=[clean_artist]))
        _p(f'  ✅ TIT2/TPE1 tags added: {clean_title} / {clean_artist}')
        tags.save(mp3_path, v2_version=3)
        _p(f'  ✅ Tags saved to MP3')
        
    except Exception as e:
        _p(f'  ❌ Nokia compat error: {e}')
        raise
    finally:
        if os.path.exists(temp_img):
            os.remove(temp_img)

# ── State ──────────────────────────────────────────────────────────
task_queue  = Q.Queue()
active_map  = {}; active_lock = threading.Lock()
queued_map  = {}
active_procs= {}; procs_lock  = threading.Lock()
history     = []; hist_lock   = threading.Lock()
stats={'total':0,'success':0,'failed':0,'active':0,'bytes':0}
slk=threading.Lock()
_uid_lock=threading.Lock(); _uid_ctr=0

def make_uid(url='',fmt='',h=None,w=None):
    global _uid_ctr
    with _uid_lock: _uid_ctr+=1; c=_uid_ctr
    return hashlib.md5(f'{url}|{fmt}|{h}|{w}|{c}'.encode()).hexdigest()[:8]

def _yt_id(url=''):
    """Extract YouTube video id from URL if present."""
    if not url: return ''
    m=re.search(r'(?:v=|/shorts/|youtu\.be/|/embed/)([A-Za-z0-9_-]{11})',url)
    return m.group(1) if m else ''

def _yt_thumb(url='', vid=''):
    vid=vid or _yt_id(url)
    return f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg' if vid else ''

def _seed_title(url='', title=''):
    t=(title or '').strip()
    if t: return t
    vid=_yt_id(url)
    return vid or (url[-50:] if url else '')

def _already_queued(url, fmt, h=None, w=None):
    """True if same url+format(+res) already queued or downloading."""
    with active_lock:
        for mp in (queued_map, active_map):
            for it in mp.values():
                if it.get('url')==url and it.get('format')==fmt \
                   and it.get('height')==h and it.get('width')==w:
                    return True
    return False

_SPD_FILE=os.path.join(BASE_DIR,'yn_speed.txt')
GLOBAL_SPEED='medium'
try:
    s=open(_SPD_FILE).read().strip()
    if s in ('slow','medium','fast'): GLOBAL_SPEED=s
except: pass

_SPD={'slow':dict(ax=4,as_=4,fr=2,sleep=3.5),'medium':dict(ax=12,as_=12,fr=max(4,_cores),sleep=1.0),'fast':dict(ax=24,as_=24,fr=min(24,_cores*2),sleep=0.2)}

# ── Progress parsers ───────────────────────────────────────────────
_PCT  = re.compile(r'(\d+\.?\d*)\s*%')
_SPDP = re.compile(r'(\d+\.?\d*)\s*(GiB|MiB|KiB|GB|MB|KB)/s')
_ETAP = re.compile(r'ETA\s+(\d+:\d+)')
_TOTP = re.compile(r'of\s+~?\s*(\d+\.?\d*)\s*(GiB|MiB|KiB|B)')
_UNIT ={'GiB':1<<30,'MiB':1<<20,'KiB':1<<10,'B':1,'GB':10**9,'MB':10**6,'KB':10**3}
_ARIA = re.compile(r'\[#[0-9a-f]+\s+[\d.]+\w+/[\d.]+\w+\((\d+)%\)[^\]]*DL:(\S+)(?:[^\]]*ETA:(\S+))?')
_DEST = re.compile(r'(?i)destination:\s*(.+)')
_BOT  = ['sign in to confirm','confirm you are not a bot','too many requests','429','403 forbidden',
         'needs to be reloaded','po token','temporarily unavailable','try again later']
_SHOW = ['[download]','[ffmpeg]','[merger]','destination:','error','warning','has already','deleting']

def _parse_pct(line):
    lo=line.lower()
    # Native yt-dlp format
    if '[download]' in lo:
        m=_PCT.search(line)
        if m:
            pct=float(m.group(1))
            sp=_SPDP.search(line); et=_ETAP.search(line); tot=_TOTP.search(line)
            total_b=int(float(tot.group(1))*_UNIT.get(tot.group(2),1)) if tot else 0
            return pct, (f'{sp.group(1)}{sp.group(2)}/s' if sp else ''), (f'ETA:{et.group(1)}' if et else ''), total_b
    # aria2c format
    m=_ARIA.search(line)
    if m:
        return float(m.group(1)),(f'{m.group(2)}/s' if m.group(2) else ''),\
               (f'ETA:{m.group(3)}' if m.group(3) else ''),0
    return None

def _is_bot(l): return any(p in l.lower() for p in _BOT)
def _should_show(l): return any(k in l.lower() for k in _SHOW)
def _clean(l): return ANSI.sub('',l).rstrip()[:500]

# ── ffmpeg recode ──────────────────────────────────────────────────
def ff_recode(src, dst, fmt, h=None, w=None, tag='', sub_file=None):
    codec=_FF_CODEC.get(fmt,['-c:v','libx264','-preset','fast','-crf','22','-c:a','aac','-b:a','192k','-pix_fmt','yuv420p'])
    cmd=[FFMPEG,'-y','-i',src]+codec+['-threads',str(_ff_thr)]
    vf=[]
    sub_filter=None
    temp_sub_file_path=None
    dirn=os.path.dirname(src)
    uid_str=os.path.basename(src).split('.')[-2] if '.' in os.path.basename(src) else 'temp'
    if sub_file and os.path.exists(sub_file):
        try:
            temp_sub_file_path=os.path.join(dirn,f'temp_{uid_str}.srt')
            shutil.copy2(sub_file,temp_sub_file_path)
            sub_filter=f"subtitles='{temp_sub_file_path}'"
            vf.append(sub_filter)
        except Exception as e:
            _p(f'  {tag} ⚠️  failed to copy subtitle for burning: {e}')
    if h and w:
        rw=int(w) if int(w)%2==0 else int(w)-1
        rh=int(h) if int(h)%2==0 else int(h)-1
        vf.append(f'scale={rw}:{rh}')
    elif h:
        rh=int(h) if int(h)%2==0 else int(h)-1
        vf.append(f'scale=-2:{rh}')
    if vf: cmd+=['-vf',','.join(vf)]
    cmd.append(dst)
    _p(f'  {tag} 🔧 ffmpeg (superfast) → {os.path.basename(dst)}' + (' (הטמעת כתוביות בוידאו)' if sub_filter else ''))
    with _ff_sem:
        try:
            r=subprocess.run(cmd,capture_output=True,text=True,timeout=TIMEOUT,encoding='utf-8',errors='replace',env=_utfenv(),cwd=dirn)
            if temp_sub_file_path and os.path.exists(temp_sub_file_path):
                try: os.remove(temp_sub_file_path)
                except: pass
            if r.returncode==0:
                _p(f'  {tag} ✅ המרה והטמעת כתוביות הצליחה')
                if sub_file and os.path.exists(sub_file):
                    try: os.remove(sub_file)
                    except: pass
                return True
            _p(f'  {tag} ⚠️  ffmpeg הטמעת כתוביות rc={r.returncode}, מנסה ללא פילטר כתוביות')
            if sub_filter:
                vf_nosub = [x for x in vf if x != sub_filter]
                cmd_nosub=[FFMPEG,'-y','-i',src]+codec+['-threads',str(_ff_thr)]
                if vf_nosub: cmd_nosub+=['-vf',','.join(vf_nosub)]
                cmd_nosub.append(dst)
                r2=subprocess.run(cmd_nosub,capture_output=True,text=True,timeout=TIMEOUT,encoding='utf-8',errors='replace',env=_utfenv())
                if r2.returncode==0:
                    _p(f'  {tag} ✅ המרה ללא כתוביות הצליחה')
                    return True
            _p(f'  {tag} ❌ ffmpeg rc={r.returncode}')
            for l in (r.stderr or '').splitlines()[-5:]:
                if l.strip(): _p(f'       {l}')
            return False
        except Exception as e: _p(f'  {tag} 💥 {e}'); return False

# ── Build yt-dlp command ───────────────────────────────────────────
def build_cmd(url, fmt, h=None, w=None, attempt=0, uid='x',
              embed_thumb=True, th_w=None, th_h=None, th_fmt='jpg',
              speed='medium', dl_dir=None, subtitle_lang=None,
              subtitle_format=None,
              folder_ch=False, folder_pl=False, **kw):
    if dl_dir is None: dl_dir=DL_DIR
    url=url.replace('music.youtube.com','www.youtube.com')
    fmt=fmt.lower()
    # Folder layout: prefer explicit dl_dir (already includes channel/playlist from /download)
    # Fallback templates only when flags set and path not pre-baked
    out_dir=dl_dir
    tmpl=os.path.join(out_dir,f'%(title)s.{uid}.%(ext)s')
    if folder_ch and not kw.get('path_baked'):
        tmpl=os.path.join(out_dir,'%(channel)s',f'%(title)s.{uid}.%(ext)s')
    sp=_SPD.get(speed,_SPD['medium'])
    slp=0
    # android/ios clients are dead on current YouTube — 'default' lets yt-dlp pick
    # (currently visionos, the client that works without PO token). Retries widen
    # the set — with real browser cookies the web-based clients may still succeed.
    _CLIENT_SETS=['default','visionos,tv,mweb,web','all']
    clients=_CLIENT_SETS[min(attempt,len(_CLIENT_SETS)-1)]
    base=[
        YT_DLP,'--no-update','--no-warnings','-o',tmpl,
        '--no-playlist','--no-mtime','--windows-filenames','--encoding','utf-8','--newline',
        '--retries','10','--fragment-retries','10','--file-access-retries','5',
        '--skip-unavailable-fragments','--ignore-errors','--no-abort-on-error','--no-part',
        '--ffmpeg-location',_BD,
        '--extractor-args',f'youtube:player_client={clients}',
        '--user-agent',_UAS[attempt%len(_UAS)],
        '--referer','https://www.youtube.com/',
        '--add-header','Accept-Language:he-IL,he;q=0.9,en-US;q=0.8',
        '--add-header','DNT:1',
        '--no-check-certificate','--force-ipv4','--geo-bypass',
    ]+COOKIE_ARGS

    if fmt=='thumbnail':
        # No -f: skip-download + write thumbnail only
        base+=['--write-thumbnail','--skip-download','--convert-thumbnails','jpg']

    elif fmt in AUDIO_FMTS:
        # Broad audio selector — avoid "format not available"
        audio_f='bestaudio/best' if attempt==0 else 'bestaudio/best/b'
        if fmt in _FF_AUDIO:
            base+=['-f',audio_f,'-x','--audio-format','wav','--audio-quality','0',
                   '--no-embed-thumbnail','--embed-metadata',
                   '--concurrent-fragments',str(min(4,_cores))]
        else:
            aq=(kw.get('audio_quality') or '0')
            base+=['-f',audio_f,'-x','--audio-format',fmt,'--audio-quality',str(aq),
                   '--embed-metadata','--concurrent-fragments',str(min(4,_cores))]
            if fmt in _THUMB_OK and embed_thumb:
                thumb_fmt = th_fmt or kw.get('thumb_format', 'jpg')
                base+=['--embed-thumbnail','--convert-thumbnails',thumb_fmt,
                       '--ppa','EmbedThumbnail+ffmpeg_o:-c:v mjpeg -id3v2_version 3 -metadata encoding=utf-16']
                if th_w and th_h:
                    tw=int(th_w) if int(th_w)%2==0 else int(th_w)-1
                    th=int(th_h) if int(th_h)%2==0 else int(th_h)-1
                    # Scale cover BEFORE embed
                    base+=['--ppa',f'ThumbnailsConvertor+ffmpeg_o:-vf scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2']
            else:
                base+=['--no-embed-thumbnail']
                # For MP3 without thumbnail, still set ID3v2.3 and UTF-16 for Hebrew compatibility
                if fmt == 'mp3':
                    base+=['--ppa','Merger+ffmpeg_o:-id3v2_version 3 -metadata encoding=utf-16']

    else:
        # VIDEO
        needs_recode=fmt in _NEEDS_RECODE
        has_subs=bool(subtitle_lang)
        # Subs → MKV (reliable embed). Recode formats → MKV intermediate.
        merge_fmt='mkv' if (needs_recode or has_subs) else ('mp4' if fmt=='mp4' else fmt)
        # For recode: download best then scale in ff_recode. Else apply height filter with fallbacks.
        if needs_recode or attempt>0:
            fmt_sel=_vsel(h=None,w=None) if needs_recode else _vsel(h=h,w=w)
            if attempt>=1: fmt_sel='bestvideo+bestaudio/best/b'
        else:
            fmt_sel=_vsel(h=None if needs_recode else h, w=None if needs_recode else w)

        if ARIA2C and os.path.exists(ARIA2C) and speed!='slow':
            base+=['--downloader',ARIA2C,'--downloader-args',
                   f'aria2c:-x {sp["ax"]} -s {sp["as_"]} -k 1M '
                   f'--max-connection-per-server={sp["ax"]} --split={sp["as_"]} '
                   f'--allow-overwrite=true --file-allocation=none']
        else:
            base+=['--concurrent-fragments',str(sp['fr']),'--buffer-size','16384K']

        base+=['-f',fmt_sel,'--merge-output-format',merge_fmt]

        ff_base=f'-threads {_ff_thr}'
        if merge_fmt=='mp4':
            scale=''
            if not needs_recode and not has_subs:
                if h and w:
                    rw=int(w) if int(w)%2==0 else int(w)-1
                    rh=int(h) if int(h)%2==0 else int(h)-1
                    scale=f' -vf scale={rw}:{rh}'
                elif h:
                    rh=int(h) if int(h)%2==0 else int(h)-1
                    scale=f' -vf scale=-2:{rh}'
            if scale:
                base+=['--ppa',f'Merger+ffmpeg_o:{ff_base}{scale} -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k -movflags +faststart -pix_fmt yuv420p']
            else:
                base+=['--ppa',f'Merger+ffmpeg_o:{ff_base} -c:v copy -c:a aac -b:a 192k -movflags +faststart']
        elif merge_fmt=='mkv' and not has_subs:
            base+=['--ppa',f'ffmpeg:{ff_base}']

        base+=['--embed-metadata']

        if has_subs:
            # Map short codes → yt-dlp lang patterns (he also as iw)
            lang=subtitle_lang
            sub_fmt=subtitle_format or 'srt'
            if lang=='auto':
                base+=['--write-subs','--write-auto-subs','--sub-langs','all',
                       '--sub-format',f'{sub_fmt}/vtt/best','--convert-subs',sub_fmt]
            else:
                lang_map={'he':'he*,iw*,he-IL','iw':'he*,iw*','en':'en*,en-US','zh-Hans':'zh*,zh-Hans*'}
                langs=lang_map.get(lang,f'{lang}*')
                base+=['--write-subs','--write-auto-subs','--sub-langs',langs,
                       '--sub-format',f'{sub_fmt}/vtt/best','--convert-subs',sub_fmt]

    base.append(url)
    return base

# ── Worker ─────────────────────────────────────────────────────────
def worker():
    while True:
        task=task_queue.get()
        if task is None: task_queue.task_done(); break
        try: _do_dl(task)
        finally: task_queue.task_done()

def _safe_rename(src, dst):
    """Rename src→dst, appending (N) if dst already exists."""
    if not os.path.exists(dst):
        os.rename(src, dst); return dst
    # Try numbered suffixes
    base,ext=os.path.splitext(dst)
    for i in range(2,100):
        candidate=f'{base} ({i}){ext}'
        if not os.path.exists(candidate):
            os.rename(src, candidate); return candidate
    return src

def _uid_glob(dldir, uid, ext=None):
    """Find files for uid under dldir (including channel subfolders)."""
    uid_str = str(uid or '')
    pat=os.path.join(dldir,'**',f'*.{uid_str}.{ext}' if ext else f'*.{uid_str}.*')
    return [f for f in glob.glob(pat,recursive=True) if not f.endswith('.part')]


def _scale_image(src, dst, tw, th, tag=''):
    tw=int(tw) if int(tw)%2==0 else int(tw)-1
    th=int(th) if int(th)%2==0 else int(th)-1
    cmd=[FFMPEG,'-y','-i',src,'-vf',f'scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2',
         '-q:v','2',dst]
    with _ff_sem:
        try:
            r=subprocess.run(cmd,capture_output=True,text=True,timeout=120,encoding='utf-8',errors='replace',env=_utfenv())
            if r.returncode==0: return True
            _p(f'  {tag} ❌ thumb scale rc={r.returncode}')
            return False
        except Exception as e:
            _p(f'  {tag} 💥 thumb scale {e}'); return False


def _do_dl(task):
    url   = task['url']
    fmt   = task['format']
    h     = task.get('height')
    w     = task.get('width')
    uid   = task['uid']
    title = task.get('title','') or ''
    speed = task.get('speed','medium')
    dldir = task.get('dl_dir',DL_DIR)
    tag   = f'[{uid}]'
    t0    = time.time(); nb=0; ok=False; errors=[]
    os.makedirs(dldir, exist_ok=True)

    # Seed title/thumb if missing
    if not title:
        title=_seed_title(url, task.get('title','')); task['title']=title
    if not task.get('thumb'):
        task['thumb']=_yt_thumb(url)

    # Check if file already exists (by uid marker)
    existing_files = _uid_glob(dldir, uid)
    if existing_files:
        _p(f'\n{tag} File already exists: {existing_files[0]}')
        with active_lock:
            queued_map.pop(uid, None)
            active_map.pop(uid, None)
        with hist_lock:
            history.append({**task, 'title':title, 'thumb':task.get('thumb',''),
                            'status': '✅', 'elapsed': 0, 'bytes': 0,
                            'errors': ['File already exists']})
        with slk: stats['total']+=1; stats['success']+=1
        return

    with slk: stats['active']+=1
    with active_lock:
        prev=queued_map.pop(uid,{})
        active_map[uid]={'uid':uid,'url':url,'title':title or prev.get('title',''),'format':fmt,'pct':0.0,
                         'status':'downloading','height':h,'width':w,
                         'thumb':task.get('thumb') or prev.get('thumb') or _yt_thumb(url),
                         'source':task.get('source','youtube'),
                         'bytes_done':0,'total_bytes':0,'speed_str':''}

    needs_recode = fmt in _NEEDS_RECODE
    needs_ff_aud = fmt in _FF_AUDIO
    disp=f'{(title or _seed_title(url))[:60]} [{fmt.upper()}]'
    _p(f'\n{"="*60}\n🔄 {tag} {disp}\n{"="*60}')

    for attempt in range(RETRIES):
        if attempt>0:
            _p(f'  {tag} 🔁 ניסיון {attempt+1}'); time.sleep(0)
            for f2 in _uid_glob(dldir, uid):
                try: os.remove(f2)
                except: pass

        proc=None; dl_path=None; auth_err=False; fmt_err=False; buf=[]
        try:
            cmd=build_cmd(url,fmt,h=h,w=w,attempt=attempt,uid=uid,
                         embed_thumb=task.get('embed_thumbnail',True),
                         th_w=task.get('thumb_width'),th_h=task.get('thumb_height'),
                         th_fmt=task.get('thumb_format','jpg'),
                         speed=speed,dl_dir=dldir,subtitle_lang=task.get('subtitle_lang',''),
                         subtitle_format=task.get('subtitle_format',''),
                         folder_ch=task.get('folder_channel',False) and not task.get('path_baked'),
                         folder_pl=False,
                         path_baked=task.get('path_baked',False),
                         audio_quality=task.get('audio_quality') or '0')
            _lg.info(f'{tag} CMD: {" ".join(cmd)}')

            proc=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                                  universal_newlines=True,encoding='utf-8',errors='replace',env=_utfenv())
            with procs_lock: active_procs[uid]=proc
            last_pct=-1.0

            for raw in proc.stdout:
                line=_clean(raw)
                if not line: continue
                buf.append(line); buf=buf[-400:]

                # Track destination file
                dm=_DEST.search(line)
                if dm:
                    p2=dm.group(1).strip().strip('"').rstrip('.')
                    if os.path.exists(p2): dl_path=p2

                if _is_bot(line): auth_err=True
                if 'requested format is not available' in line.lower(): fmt_err=True
                if '429' in line or 'too many requests' in line.lower():
                    _p(f'  {tag} ⚠️  Rate limited (429), retrying...')
                    auth_err=True

                res=_parse_pct(line)
                if res:
                    pct,spd_str,eta_str,total_b=res
                    done_b=int(total_b*pct/100) if total_b else 0
                    with active_lock:
                        if uid in active_map:
                            m=active_map[uid]
                            m['pct']=pct; m['speed_str']=spd_str
                            if total_b: m['total_bytes']=total_b
                            m['bytes_done']=done_b
                            if m.get('status')=='converting' and pct<95:
                                m['status']='downloading'
                    if pct-last_pct>=5:
                        last_pct=pct
                        bar='█'*int(30*pct/100)+'░'*(30-int(30*pct/100))
                        _p(f'\r  {tag} [{bar}] {pct:5.1f}% {spd_str} {eta_str}',end='')
                    continue

                lo=line.lower()
                if '[extractaudio]' in lo or 'converting audio' in lo:
                    with active_lock:
                        if uid in active_map:
                            active_map[uid]['status']='converting'; active_map[uid]['pct']=max(active_map[uid].get('pct',0),92.0)
                elif '[ffmpeg] destination:' in lo or '[ffmpeg] merging' in lo:
                    with active_lock:
                        if uid in active_map:
                            active_map[uid]['status']='merging'; active_map[uid]['pct']=max(active_map[uid].get('pct',0),96.0)
                elif 'embedthumbnail' in lo or 'embedding thumbnail' in lo:
                    with active_lock:
                        if uid in active_map:
                            active_map[uid]['status']='embedding'; active_map[uid]['pct']=max(active_map[uid].get('pct',0),90.0)

                if 'destination:' in lo and (not title or title==_yt_id(url) or 'youtube.com' in title or 'youtu.be' in title or title.startswith('http')):
                    dm=_DEST.search(line)
                    if dm:
                        bn=os.path.basename(dm.group(1).strip().strip('"'))
                        clean=re.sub(r'\.'+re.escape(str(uid or ''))+r'(\.[^.]+)?$','',bn)
                        clean=re.sub(r'\.[^.]+$','',clean).strip()
                        if clean and len(clean)>2:
                            title=clean; task['title']=clean; disp=f'{clean[:60]} [{fmt.upper()}]'
                            with active_lock:
                                if uid in active_map: active_map[uid]['title']=clean

                if _should_show(line): _p(f'\n  {tag} {line}')
                if 'error' in line.lower(): errors.append(line[:120])

            try: proc.wait(timeout=TIMEOUT)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait(); errors.append('TIMEOUT'); continue
            with procs_lock: active_procs.pop(uid,None)
            rc=proc.returncode; _p(f'\n  {tag} ← rc={rc}')
            if rc!=0:
                if (auth_err or fmt_err) and attempt<RETRIES-1: continue
                break

            # ── Post-process ─────────────────────────────────────
            if fmt=='thumbnail':
                thumbs=_uid_glob(dldir, uid)
                if not thumbs:
                    # yt-dlp sometimes writes without uid in weird cases — search recent jpg/webp/png
                    thumbs=[f for f in glob.glob(os.path.join(dldir,'**','*.jpg'),recursive=True)+
                                   glob.glob(os.path.join(dldir,'**','*.webp'),recursive=True)+
                                   glob.glob(os.path.join(dldir,'**','*.png'),recursive=True)
                            if uid in os.path.basename(f)]
                th_w=task.get('thumb_width'); th_h=task.get('thumb_height')
                for f2 in thumbs:
                    bname=os.path.basename(f2)
                    clean_bname=re.sub(r'\.'+re.escape(str(uid or ''))+r'(?=\.\w+$)','',bname)
                    if clean_bname==bname: clean_bname=bname.replace(f'.{uid}','',1)
                    # Force .jpg extension
                    clean_bname=re.sub(r'\.(webp|png)$','.jpg',clean_bname,flags=re.I)
                    clean=os.path.join(os.path.dirname(f2),clean_bname)
                    if th_w and th_h:
                        tmp=clean+'.tmp.jpg'
                        if _scale_image(f2,tmp,th_w,th_h,tag=tag):
                            try: os.remove(f2)
                            except: pass
                            try: _safe_rename(tmp,clean)
                            except: 
                                try: os.rename(tmp,clean)
                                except: pass
                        else:
                            try: _safe_rename(f2,clean)
                            except: pass
                    else:
                        try: _safe_rename(f2,clean)
                        except: pass
                ok=bool(thumbs) or bool(_uid_glob(dldir, uid))
                if not ok:
                    # Any jpg written in last minute in dldir with title hint
                    ok=len(thumbs)>0
                if ok: break
                errors.append('thumbnail not found')
                if attempt<RETRIES-1: continue; break

            elif needs_recode:
                with active_lock:
                    if uid in active_map:
                        active_map[uid]['status']='converting'; active_map[uid]['pct']=95.0
                if not dl_path:
                    for ext2 in ['mkv','mp4','webm']:
                        found=_uid_glob(dldir,uid,ext2)
                        if found: dl_path=found[0]; break
                if not dl_path:
                    all_f=_uid_glob(dldir,uid)
                    if all_f: dl_path=max(all_f,key=os.path.getmtime)
                if dl_path and os.path.exists(dl_path):
                    bname=os.path.basename(dl_path)
                    clean_bname=re.sub(r'\.' + re.escape(str(uid or '')) + r'(?=\.\w+$)', '', bname)
                    clean_bname=re.sub(r'\.\w+$', f'.{fmt}', clean_bname)
                    dst=os.path.join(os.path.dirname(dl_path),clean_bname)
                    sub_file=None
                    if task.get('has_subs'):
                        for ext in ['srt','vtt','ass','ssa']:
                            sub_candidates=_uid_glob(dldir,uid,ext)
                            if sub_candidates:
                                sub_file=sub_candidates[0]
                                break
                    if ff_recode(dl_path,dst,fmt,h=h,w=w,tag=tag,sub_file=sub_file):
                        try: os.remove(dl_path)
                        except: pass
                        ok=True; break
                    errors.append('recode failed')
                    if attempt<RETRIES-1: continue; break
                else:
                    errors.append('source not found for recode')
                    if attempt<RETRIES-1: continue; break

            elif needs_ff_aud:
                wav_files=_uid_glob(dldir,uid,'wav')
                if wav_files:
                    src=wav_files[0]
                    bname=os.path.basename(src)
                    clean_bname=re.sub(r'\.' + re.escape(str(uid or '')) + r'(?=\.\w+$)', '', bname)
                    clean_bname=re.sub(r'\.wav$', f'.{fmt}', clean_bname)
                    dst=os.path.join(os.path.dirname(src),clean_bname)
                    ff_cmd=[FFMPEG,'-y','-i',src]+_FF_AUDIO[fmt]+['-threads',str(_ff_thr),dst]
                    with _ff_sem:
                        r2=subprocess.run(ff_cmd,capture_output=True,text=True,timeout=TIMEOUT,encoding='utf-8',errors='replace',env=_utfenv())
                    if r2.returncode==0:
                        try: os.remove(src)
                        except: pass
                        # Process MP3 for legacy Nokia devices if it's an MP3 with thumbnail
                        if task.get('embed_thumbnail',True) and dst.lower().endswith('.mp3'):
                            # Find thumbnail image
                            thumb_files=[f for f in glob.glob(os.path.join(os.path.dirname(dst),'*.jpg'),recursive=False)+
                                       glob.glob(os.path.join(os.path.dirname(dst),'*.png'),recursive=False)+
                                       glob.glob(os.path.join(os.path.dirname(dst),'*.webp'),recursive=False)
                                       if uid in os.path.basename(f)]
                            if thumb_files:
                                try:
                                    with active_lock:
                                        if uid in active_map:
                                            active_map[uid]['status']='nokia_compat'; active_map[uid]['pct']=98.0
                                    process_audio_for_legacy_nokia(dst, thumb_files[0], title or 'Unknown', task.get('artist','Unknown'))
                                except Exception as e:
                                    _p(f'  {tag} ⚠️  Nokia compat failed: {e}')
                        ok=True; break
                    errors.append(f'ffmpeg {fmt} failed')
                    if attempt<RETRIES-1: continue; break
                else:
                    errors.append('wav not found'); break

            else:
                renamed=0
                for f2 in _uid_glob(dldir,uid):
                    bname=os.path.basename(f2)
                    dirn=os.path.dirname(f2)
                    clean_bname=re.sub(r'\.' + re.escape(str(uid or '')) + r'(?=\.\w+$)', '', bname)
                    if clean_bname==bname:
                        clean_bname=bname.replace(f'.{uid}','',1)
                    clean=os.path.join(dirn,clean_bname)
                    try: _safe_rename(f2,clean); renamed+=1
                    except Exception as e: _p(f'  {tag} ⚠️  rename err: {e}')
                    # Process audio for legacy Nokia devices if it has thumbnail
                    if task.get('embed_thumbnail',True) and clean.lower().endswith('.mp3'):
                        # Find thumbnail image
                        thumb_files=[f for f in glob.glob(os.path.join(dirn,'*.jpg'),recursive=False)+
                                   glob.glob(os.path.join(dirn,'*.png'),recursive=False)+
                                   glob.glob(os.path.join(dirn,'*.webp'),recursive=False)
                                   if uid in os.path.basename(f)]
                        if thumb_files:
                            try:
                                with active_lock:
                                    if uid in active_map:
                                        active_map[uid]['status']='nokia_compat'; active_map[uid]['pct']=98.0
                                process_audio_for_legacy_nokia(clean, thumb_files[0], title or 'Unknown', task.get('artist','Unknown'))
                            except Exception as e:
                                _p(f'  {tag} ⚠️  Nokia compat failed: {e}')
                if renamed>0: ok=True; break
                errors.append('no files found to rename')
                if attempt<RETRIES-1: continue; break

        except Exception as e:
            _p(f'\n  {tag} 💥 {e}'); errors.append(str(e)[:100])
            if proc:
                try: proc.kill()
                except: pass
            with procs_lock: active_procs.pop(uid,None)
            if attempt<RETRIES-1: continue

    elapsed=round(time.time()-t0,1)
    with active_lock: active_map.pop(uid,None)
    with procs_lock:  active_procs.pop(uid,None)
    _p(f'\n{"✅" if ok else "❌"} {tag} {disp}  {elapsed}s')
    _p('─'*60)
    with slk:
        stats['total']+=1; stats['active']=max(0,stats['active']-1)
        if ok: stats['success']+=1
        else:  stats['failed']+=1
    with hist_lock:
        history.append({**task,'status':'✅' if ok else '❌',
                        'elapsed':elapsed,'bytes':nb,'errors':errors[-2:]})

_p(f'🚀 מפעיל {MAX_W} workers...')
for i in range(MAX_W):
    threading.Thread(target=worker,daemon=True,name=f'DL-{i+1}').start()
_p('✅ מוכן\n')

# ── Playlist expand ────────────────────────────────────────────────
def expand_playlist(url, fmt, content_type='all'):
    url=url.replace('music.youtube.com','www.youtube.com')
    try:
        from urllib.parse import urlparse,parse_qs,urlencode,urlunparse
        p=urlparse(url); qs=parse_qs(p.query,keep_blank_values=False)
        yn=qs.pop('yn_content',None)
        if yn and content_type=='all':
            content_type=(yn[0] or 'all').strip().lower()
        url=urlunparse((p.scheme,p.netloc,p.path,'',urlencode({k:v[0] for k,v in qs.items()}),''))
    except: pass
    cmd=[YT_DLP,'--flat-playlist','--dump-json','--no-warnings','--ignore-errors','--no-check-certificate',
         '--extractor-args','youtube:player_client=mweb,web']+COOKIE_ARGS+[url]
    try:
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=120,encoding='utf-8',errors='replace',env=_utfenv())
        items=[]; pl_title=''; channel=''
        for line in r.stdout.splitlines():
            if not line.strip(): continue
            try:
                d=json.loads(line); vid=d.get('id','')
                if not vid: continue
                if not pl_title:
                    pl_title=(d.get('playlist_title') or d.get('playlist') or '').strip()
                if not channel:
                    channel=(d.get('channel') or d.get('uploader') or d.get('playlist_uploader') or '').strip()
                v=vid if vid.startswith('http') else f'https://www.youtube.com/watch?v={vid}'
                dur=float(d.get('duration') or 0)
                # Proper short detection using yt-dlp metadata
                is_short = False
                # Check multiple metadata fields for short detection
                webpage_url = d.get('webpage_url', '')
                if webpage_url and '/shorts/' in webpage_url:
                    is_short = True
                # Also check if the video ID appears in a shorts URL format
                elif d.get('extractor_key') == 'Youtube' and dur > 0 and dur <= 60:
                    is_short = True
                # Log for debugging
                if content_type in ('shorts', 'videos'):
                    _p(f'  📹 {vid}: dur={dur}s, is_short={is_short}, webpage_url={webpage_url[:50]}')
                if content_type=='shorts' and not is_short: continue
                if content_type=='videos' and is_short: continue
                th=d.get('thumbnail','') or _yt_thumb(v, vid if not vid.startswith('http') else _yt_id(v))
                items.append({'url':v,'format':fmt,'title':d.get('title',vid),'thumb':th,
                              'channel':channel,'playlist_title':pl_title})
            except: continue
        return items, pl_title, channel
    except: return [], '', ''

def _site(url):
    for k,d in [('youtube','youtube.com'),('youtube','youtu.be'),('soundcloud','soundcloud.com'),
                ('vimeo','vimeo.com'),('tiktok','tiktok.com'),('twitter','x.com'),
                ('instagram','instagram.com'),('twitch','twitch.tv')]:
        if d in url: return k
    try:
        from urllib.parse import urlparse
        h2=urlparse(url).netloc.replace('www.',''); return h2.split('.')[0] if h2 else 'web'
    except: return 'web'

def _is_pl(url):
    return (bool(re.match(r'https?://',url)) and
            ('youtube.com' in url or 'youtu.be' in url) and
            (re.search(r'(/channel/|/@|/c/|/user/|/playlist\?)',url) or
             ('list=' in url and 'v=' not in url)))

# ── Routes ─────────────────────────────────────────────────────────
@app.route('/',methods=['GET'])
def home():
    return jsonify({'version':'v27','ok':True,'workers':MAX_W,'queue':task_queue.qsize(),
                    'active':stats['active'],'aria2c':bool(ARIA2C and os.path.exists(ARIA2C))})

@app.route('/ping',methods=['GET'])
def ping(): return jsonify({'ok':True}),200

@app.route('/status',methods=['GET'])
def status():
    with active_lock: am=dict(active_map); qm=dict(queued_map)
    return jsonify({'queue':task_queue.qsize(),'active':stats['active'],
                    'stats':dict(stats),'active_map':{**qm,**am},'cpu':psutil.cpu_percent()})

@app.route('/queue',methods=['GET'])
def get_queue():
    with active_lock: am=dict(active_map); qm=dict(queued_map)
    return jsonify({'queue':{**qm,**am}})

@app.route('/download',methods=['POST'])
def download():
    try:
        d=request.get_json(force=True) or {}
        url=(d.get('url') or '').strip()
        if not url: return jsonify({'error':'missing url'}),400
        if not re.match(r'https?://',url): return jsonify({'error':'invalid url'}),400
        url=url.replace('music.youtube.com','www.youtube.com')
        fmt=(d.get('format') or 'mp4').lower()
        if fmt in ('mpeg','m2ts'): fmt={'mpeg':'mpg','m2ts':'ts'}[fmt]
        if fmt not in VALID_FMTS: fmt='mp4'
        h=d.get('height'); w=d.get('width')
        try: h=int(h) if h else None
        except: h=None
        try: w=int(w) if w else None
        except: w=None
        # quality string → height
        qmap={'2160p':2160,'1080p':1080,'720p':720,'480p':480,'360p':360,'240p':240}
        quality=(d.get('quality') or '').lower().strip()
        if quality and not h:
            if quality=='best':
                # Don't specify height - let yt-dlp choose best quality
                h=None
            else:
                h=qmap.get(quality)
        speed=d.get('speed') or GLOBAL_SPEED
        if speed not in _SPD: speed='medium'
        sub_lang=(d.get('subtitle_lang') or '').strip()
        embed_thumb=d.get('embed_thumbnail',True)
        th_w=d.get('thumb_width'); th_h=d.get('thumb_height'); th_fmt=d.get('thumb_format','jpg')
        try: th_w=int(th_w) if th_w else None
        except: th_w=None
        try: th_h=int(th_h) if th_h else None
        except: th_h=None
        folder_ch=bool(d.get('folder_channel',False))
        folder_pl=bool(d.get('folder_playlist',False))
        content_type=(d.get('content_type') or 'all').strip().lower()
        # Also accept yn_content from URL (content.js channel picker)
        try:
            from urllib.parse import urlparse,parse_qs
            yn=parse_qs(urlparse(url).query).get('yn_content',[''])[0]
            if yn: content_type=yn.strip().lower()
        except: pass
        if content_type not in ('all','videos','shorts'): content_type='all'
        client_title=(d.get('title') or '').strip()
        client_thumb=(d.get('thumb') or d.get('thumbnail') or '').strip()
        base_path=(d.get('base_path') or '').strip()
        audio_quality=(d.get('audio_quality') or '').strip() or '0'
        dl_dir=_resolve_dl_dir(base_path)
        os.makedirs(dl_dir,exist_ok=True)
        if base_path: _p(f'📁 הורדות → {dl_dir}')

        # Don't apply video height to thumbnail-only downloads
        if fmt=='thumbnail':
            h=None; w=None

        base_task=dict(format=fmt,height=h,width=w,speed=speed,subtitle_lang=sub_lang,
                       embed_thumbnail=embed_thumb,thumb_width=th_w,thumb_height=th_h,thumb_format=th_fmt,
                       dl_dir=dl_dir,folder_channel=folder_ch,folder_playlist=folder_pl,
                       path_baked=False,audio_quality=audio_quality,
                       source=_site(url),added=time.strftime('%H:%M:%S'),content_type=content_type)

        seed_title=_seed_title(url, client_title)
        seed_thumb=client_thumb or _yt_thumb(url)

        # Support multiple formats in a single request
        formats = d.get('formats')
        if formats and isinstance(formats, list):
            results = []
            for f in formats:
                fmt_single = f.get('format', fmt)
                h_single = f.get('height', h)
                w_single = f.get('width', w)
                if _already_queued(url, fmt_single, h_single, w_single):
                    results.append({'status':'duplicate','format':fmt_single,'msg':'כבר בתור'})
                    continue
                uid = make_uid(url, fmt_single, h_single, w_single)
                task = {**base_task, 'format': fmt_single, 'height': h_single, 'width': w_single, 'url': url, 'uid': uid, 'title': seed_title, 'thumb': seed_thumb}
                task_queue.put(task)
                with active_lock:
                    queued_map[uid] = {'uid': uid, 'url': url, 'title': seed_title, 'format': fmt_single,
                                     'height': h_single, 'width': w_single, 'pct': 0.0, 'status': 'queued',
                                     'source': _site(url), 'thumb': seed_thumb}
                results.append({'status':'queued','uid':uid,'format':fmt_single,'title':seed_title,
                              'thumb':seed_thumb,'queue':task_queue.qsize()})
            _p(f'➕ {len(results)} פורמטים נוספו לתור')
            return jsonify({'results': results}), 202

        if _is_pl(url) and fmt!='thumbnail':
            # Extract channel name from the main URL (the channel being browsed)
            main_channel = ''
            if folder_ch:
                try:
                    from urllib.parse import urlparse
                    parsed = urlparse(url)
                    if '/@' in parsed.path:
                        main_channel = parsed.path.split('/@')[1].split('/')[0]
                    elif '/channel/' in parsed.path:
                        main_channel = parsed.path.split('/channel/')[1].split('/')[0]
                    elif '/c/' in parsed.path:
                        main_channel = parsed.path.split('/c/')[1].split('/')[0]
                    elif '/user/' in parsed.path:
                        main_channel = parsed.path.split('/user/')[1].split('/')[0]
                except: pass
                _p(f'📂 Main channel folder: {main_channel or "unknown"}')
            
            def _expand():
                items, pl_title, channel = expand_playlist(url,fmt,content_type=content_type)
                if not items: _p(f'⚠️  אין פריטים ({content_type}): {url[:60]}'); return
                # Build subfolder: playlist and/or channel
                # Use main_channel (from URL) instead of individual video uploader for folder_ch
                if folder_pl and folder_ch and pl_title and main_channel:
                    sub=os.path.join(dl_dir,_safe_folder(main_channel),_safe_folder(pl_title))
                elif folder_pl and pl_title:
                    sub=os.path.join(dl_dir,_safe_folder(pl_title))
                elif folder_ch and main_channel:
                    sub=os.path.join(dl_dir,_safe_folder(main_channel))
                else:
                    sub=dl_dir
                os.makedirs(sub,exist_ok=True)
                added=0
                for it in items:
                    vu=it['url']
                    if _already_queued(vu,fmt,h,w): continue
                    uid=make_uid(vu,fmt,h,w)
                    th=it.get('thumb') or _yt_thumb(vu)
                    t={**base_task,'url':vu,'uid':uid,'title':it.get('title',''),'thumb':th,
                       'dl_dir':sub,'path_baked':True,'folder_channel':False,'folder_playlist':False}
                    task_queue.put(t)
                    with active_lock:
                        queued_map[uid]={'uid':uid,'url':vu,'title':it.get('title',''),'format':fmt,
                                         'height':h,'width':w,'pct':0.0,'status':'queued',
                                         'source':'youtube','thumb':th}
                    added+=1
                _p(f'➕ {added} פריטים ({content_type}) → {sub} | q={task_queue.qsize()}')
            threading.Thread(target=_expand,daemon=True).start()
            return jsonify({'status':'expanding','format':fmt}),202

        if _already_queued(url,fmt,h,w):
            return jsonify({'status':'duplicate','format':fmt,'msg':'כבר בתור'}),200

        # Single YT video + folder_channel → use %(channel)s template (path_baked=False, folder_ch=True)
        uid=make_uid(url,fmt,h,w)
        task={**base_task,'url':url,'uid':uid,'title':seed_title,'thumb':seed_thumb}
        task_queue.put(task)
        with active_lock:
            queued_map[uid]={'uid':uid,'url':url,'title':seed_title,'format':fmt,
                             'height':h,'width':w,'pct':0.0,'status':'queued',
                             'source':_site(url),'thumb':seed_thumb}

        def _meta(task=task,uid=uid,url=url):
            try:
                r=subprocess.run([YT_DLP,'--no-update','--dump-json','--no-playlist','--quiet','--no-warnings',
                                  '--skip-download','--extractor-args','youtube:player_client=default']+COOKIE_ARGS+[url],
                                 capture_output=True,text=True,timeout=30,encoding='utf-8',errors='replace',env=_utfenv())
                for line in r.stdout.strip().splitlines():
                    if not line: continue
                    try:
                        info=json.loads(line)
                        t2=info.get('title','') or ''
                        th=info.get('thumbnail','') or ''
                        if not th:
                            thumbs=info.get('thumbnails') or []
                            if thumbs: th=(thumbs[-1].get('url') or '')
                        if not th: th=_yt_thumb(url)
                        if t2: task['title']=t2
                        if th: task['thumb']=th
                        with active_lock:
                            for mp in (active_map,queued_map):
                                if uid in mp:
                                    if t2: mp[uid]['title']=t2
                                    if th: mp[uid]['thumb']=th
                        break
                    except: continue
            except: pass
        threading.Thread(target=_meta,daemon=True).start()
        _p(f'➕ [{fmt.upper()}]{" "+str(h)+"p" if h else ""} {seed_title[:40] or url[:50]}')
        return jsonify({'status':'queued','uid':uid,'format':fmt,'title':seed_title,
                        'thumb':seed_thumb,'queue':task_queue.qsize()}),202
    except Exception as e:
        _p(f'❌ /download {e}'); return jsonify({'error':str(e)}),500

@app.route('/cancel',methods=['POST'])
def cancel():
    try:
        d=request.get_json(force=True) or {}; uid=(d.get('uid') or '').strip()
        if not uid: return jsonify({'error':'missing uid'}),400
        killed=False
        with procs_lock:
            proc=active_procs.pop(uid,None)
            if proc:
                try: proc.kill(); killed=True
                except: pass
        with active_lock:
            queued_map.pop(uid,None)
            if uid in active_map: active_map.pop(uid,None); killed=True
        tmp=[]
        while True:
            try:
                t=task_queue.get_nowait()
                if t and t.get('uid')==uid: task_queue.task_done()
                else: tmp.append(t)
            except Q.Empty: break
        for t in tmp: task_queue.put(t)
        
        # Delete partial files for this uid
        dldir = d.get('dl_dir', DL_DIR)
        partial_files = _uid_glob(dldir, uid)
        for f in partial_files:
            try:
                if os.path.exists(f):
                    os.remove(f)
                    _p(f'  [{uid}] Deleted partial file: {os.path.basename(f)}')
            except Exception as e:
                _p(f'  [{uid}] Failed to delete partial file: {e}')
        
        return jsonify({'ok':True,'uid':uid,'killed':killed})
    except Exception as e: return jsonify({'error':str(e)}),500

@app.route('/kill_all',methods=['POST'])
def kill_all():
    n=0
    while not task_queue.empty():
        try: task_queue.get_nowait(); task_queue.task_done(); n+=1
        except: break
    with procs_lock:
        for proc in list(active_procs.values()):
            try: proc.kill()
            except: pass
        active_procs.clear()
    with active_lock: queued_map.clear()
    return jsonify({'ok':True,'cleared':n})

@app.route('/delete_queue',methods=['POST'])
def delete_queue():
    try:
        d=request.get_json(force=True) or {}
        uids=d.get('uids') or []
        if not isinstance(uids,list): uids=[uids]
        deleted=0
        with active_lock:
            for uid in uids:
                if uid in queued_map:
                    del queued_map[uid]
                    deleted+=1
                if uid in active_map:
                    del active_map[uid]
                    deleted+=1
        return jsonify({'ok':True,'deleted':deleted})
    except Exception as e: return jsonify({'error':str(e)}),500

@app.route('/list_playlist',methods=['POST'])
def list_playlist():
    try:
        d=request.get_json(force=True) or {}; url=(d.get('url') or '').strip()
        if not url: return jsonify({'error':'no url'}),400
        url=url.replace('music.youtube.com','www.youtube.com')
        content_type=(d.get('content_type') or 'all').strip().lower()
        if content_type not in ('all','videos','shorts'): content_type='all'
        cmd=[YT_DLP,'--no-update','--flat-playlist','--dump-json','--no-warnings','--ignore-errors','--no-check-certificate']+COOKIE_ARGS+[url]
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=60,encoding='utf-8',errors='replace',env=_utfenv())
        items=[]
        for line in r.stdout.splitlines():
            if not line.strip(): continue
            try:
                e=json.loads(line); vid=e.get('id','')
                if not vid: continue
                v=vid if vid.startswith('http') else f'https://www.youtube.com/watch?v={vid}'
                dur=float(e.get('duration') or 0)
                # Same short detection as expand_playlist — shorts often have dur=0 in flat lists
                wu=e.get('webpage_url','') or ''
                is_short='/shorts/' in wu or (e.get('extractor_key')=='Youtube' and 0<dur<=60)
                if content_type=='shorts' and not is_short: continue
                if content_type=='videos' and is_short: continue
                ds=''
                if dur:
                    mm,ss=divmod(int(dur),60); hh,mm=divmod(mm,60)
                    ds=f'{hh}:{mm:02d}:{ss:02d}' if hh else f'{mm}:{ss:02d}'
                th=e.get('thumbnail','') or _yt_thumb(v, vid if not str(vid).startswith('http') else '')
                items.append({'id':vid,'url':v,'title':e.get('title',vid),'duration':ds,'thumbnail':th})
            except: continue
        return jsonify({'count':len(items),'items':items})
    except Exception as e: return jsonify({'error':str(e)}),500

@app.route('/channel_info',methods=['POST'])
def channel_info():
    try:
        d=request.get_json(force=True) or {}; url=(d.get('url') or '').strip()
        if not url: return jsonify({'error':'no url'}),400
        url=url.replace('music.youtube.com','www.youtube.com')
        cmd=[YT_DLP,'--no-update','--flat-playlist','--dump-json','--no-warnings','--ignore-errors','--playlist-end','1']+COOKIE_ARGS+[url]
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=20,encoding='utf-8',errors='replace',env=_utfenv())
        name=''; thumb=''
        for line in r.stdout.splitlines():
            if not line.strip(): continue
            try:
                e=json.loads(line)
                name=(e.get('channel') or e.get('uploader') or e.get('playlist_uploader') or e.get('title',''))
                thumbs=e.get('thumbnails') or []
                for t2 in reversed(thumbs):
                    u2=t2.get('url','')
                    if 'yt3.ggpht.com' in u2 or 'ytimg.com' in u2: thumb=u2; break
                if not thumb and thumbs: thumb=thumbs[-1].get('url','')
                if not thumb: thumb=e.get('thumbnail','')
                if name: break
            except: continue
        if not name:
            try:
                from urllib.parse import urlparse
                parts=urlparse(url).path.strip('/').split('/')
                name=next((p.lstrip('@') for p in parts if p),url[:30])
            except: name=url[:30]
        return jsonify({'name':name,'thumb':thumb})
    except Exception as e: return jsonify({'error':str(e)}),500

@app.route('/watch_check',methods=['POST'])
def watch_check():
    try:
        d=request.get_json(force=True) or {}
        url=(d.get('url') or '').strip(); fmt=(d.get('format') or 'mp4').lower()
        since=int(d.get('since',0)); speed=d.get('speed') or GLOBAL_SPEED
        base_path=(d.get('base_path') or '').strip()
        if not url: return jsonify({'error':'no url'}),400
        # First check (since=0): only mark baseline — do NOT flood the queue
        if since<=0:
            return jsonify({'queued':0,'baseline':True})
        dl_dir=_resolve_dl_dir(base_path)
        cmd=[YT_DLP,'--no-update','--dump-json','--no-warnings','--ignore-errors','--playlist-end','5']+COOKIE_ARGS+[url]
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=60,encoding='utf-8',errors='replace',env=_utfenv())
        queued=0
        for line in r.stdout.splitlines():
            if not line.strip(): continue
            try:
                e=json.loads(line); vid=e.get('id','')
                if not vid: continue
                ud=e.get('upload_date','')
                if ud:
                    try:
                        import datetime
                        ts=datetime.datetime.strptime(ud,'%Y%m%d').timestamp()*1000
                        if ts<=since: continue
                    except: pass
                v=vid if vid.startswith('http') else f'https://www.youtube.com/watch?v={vid}'
                if _already_queued(v,fmt): continue
                th=e.get('thumbnail','') or _yt_thumb(v, vid if not str(vid).startswith('http') else '')
                u2=make_uid(v,fmt)
                task_queue.put({'url':v,'format':fmt,'uid':u2,'title':e.get('title',vid),
                                'speed':speed,'dl_dir':dl_dir,'source':'youtube','thumb':th})
                with active_lock:
                    queued_map[u2]={'uid':u2,'url':v,'title':e.get('title',vid),'format':fmt,
                                    'pct':0.0,'status':'queued','source':'youtube','thumb':th}
                queued+=1
            except: continue
        return jsonify({'queued':queued})
    except Exception as e: return jsonify({'error':str(e)}),500

@app.route('/set_speed',methods=['POST'])
def set_speed():
    global GLOBAL_SPEED
    try:
        d=request.get_json(force=True) or {}; s=d.get('speed','medium')
        if s not in _SPD: return jsonify({'error':'invalid'}),400
        GLOBAL_SPEED=s
        try: open(_SPD_FILE,'w').write(s)
        except: pass
        return jsonify({'ok':True,'speed':s})
    except Exception as e: return jsonify({'error':str(e)}),500

@app.route('/get_speed',methods=['GET'])
def get_speed(): return jsonify({'speed':GLOBAL_SPEED})

@app.route('/update_cookies',methods=['POST'])
def update_cookies():
    try:
        d=request.get_json(force=True) or {}; txt=d.get('cookies_txt','')
        cf=os.path.join(BASE_DIR,'cookies.txt')
        if txt is None:
            txt=''
        global COOKIE_ARGS
        if not str(txt).strip():
            with open(cf,'w',encoding='utf-8') as f: f.write('')
            COOKIE_ARGS=[]
            _p('🍪 cookies הוסרו')
            return jsonify({'ok':True,'cleared':True}),200
        ok, msg = _validate_cookies_text(txt)
        if not ok:
            try:
                os.remove(cf)
            except FileNotFoundError:
                pass
            COOKIE_ARGS=[]
            _p(f'🍪 cookies לא תקינים: {msg}')
            return jsonify({'ok':False,'error':msg}),400
        with open(cf,'w',encoding='utf-8') as f: f.write(txt)
        COOKIE_ARGS=['--cookies',cf]
        _p(f'🍪 cookies עודכנו ({len(txt.splitlines())} שורות)')
        return jsonify({'ok':True}),200
    except Exception as e: return jsonify({'ok':False,'error':str(e)}),500

@app.route('/history',methods=['GET'])
def get_history():
    lim=min(int(request.args.get('limit',50)),500)
    with hist_lock: return jsonify({'count':len(history),'items':history[-lim:]})

@app.route('/clear_history',methods=['POST'])
def clear_history():
    with hist_lock: history.clear()
    return jsonify({'ok':True})

@app.route('/shutdown',methods=['POST'])
def shutdown():
    import threading as _t, os as _o
    _t.Thread(target=lambda:(_t.Event().wait(0.4),_o._exit(0)),daemon=True).start()
    return 'ok',200

if __name__=='__main__':
    os.makedirs(DL_DIR,exist_ok=True)
    import logging as _lg2; _lg2.getLogger('werkzeug').setLevel(_lg2.ERROR)
    app.run(host='127.0.0.1',port=5000,debug=False,threaded=True)