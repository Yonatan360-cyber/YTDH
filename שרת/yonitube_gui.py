"""
YoniTube Server GUI v9 — Minimal Server Control
• כפתור הפעלה/כיבוי שרת בלבד
• ממשק כהה ונקי
"""
import tkinter as tk
import threading, os, sys, time, json, importlib.util
import urllib.request as ur2

# ── Paths ─────────────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    _BD = sys._MEIPASS
    _ED = os.path.dirname(sys.executable)
else:
    _BD = os.path.dirname(os.path.abspath(__file__))
    _ED = _BD

ICON_PATH = os.path.join(_BD, 'icon.ico')
SRV_PORT  = 5000
SRV_URL   = f'http://127.0.0.1:{SRV_PORT}'

# ── Modern Dark Palette ───────────────────────────────────────────
C = {
    'bg':      '#0f0f13',
    'card':    '#181820',
    'fg':      '#f1f1f5',
    'fg_sub':  '#8e8e9e',
    'green':   '#22c55e',
    'green_h': '#16a34a',
    'red':     '#ef4444',
    'red_h':   '#dc2626',
    'amber':   '#f59e0b',
    'border':  '#2a2a38',
}

class App:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title('YoniTube Server')
        self.root.geometry('360x220')
        self.root.resizable(False, False)
        self.root.configure(bg=C['bg'])
        self.root.protocol('WM_DELETE_WINDOW', self._quit)

        try:
            if os.path.exists(ICON_PATH):
                self.root.iconbitmap(ICON_PATH)
        except Exception:
            pass

        self.running = True
        self.is_server_on = False

        self._build_ui()
        self._start_server()
        self._poll()

    def _build_ui(self):
        # Header Box
        header = tk.Frame(self.root, bg=C['card'], pady=14)
        header.pack(fill=tk.X)

        title_lbl = tk.Label(header, text='⚡ YoniTube Server', bg=C['card'], fg=C['fg'],
                             font=('Segoe UI', 15, 'bold'))
        title_lbl.pack()

        sub_lbl = tk.Label(header, text='http://127.0.0.1:5000', bg=C['card'], fg=C['fg_sub'],
                           font=('Segoe UI', 9))
        sub_lbl.pack(pady=(2, 0))

        # Main Body
        body = tk.Frame(self.root, bg=C['bg'], pady=16, padx=24)
        body.pack(fill=tk.BOTH, expand=True)

        self.status_lbl = tk.Label(body, text='● מפעיל שרת...', bg=C['bg'], fg=C['amber'],
                                   font=('Segoe UI', 12, 'bold'))
        self.status_lbl.pack(pady=(0, 14))

        # Single Toggle Button
        self.toggle_btn = tk.Button(
            body,
            text='מאתחל...',
            bg=C['border'],
            fg=C['fg'],
            font=('Segoe UI', 13, 'bold'),
            relief=tk.FLAT,
            cursor='hand2',
            pady=10,
            activebackground=C['border'],
            activeforeground=C['fg'],
            command=self._toggle_server,
            state=tk.DISABLED
        )
        self.toggle_btn.pack(fill=tk.X)

    def _toggle_server(self):
        if self.is_server_on:
            self._stop_server()
        else:
            self._start_server()

    def _start_server(self):
        self.toggle_btn.config(state=tk.DISABLED, text='מפעיל שרת...', bg=C['border'])
        self.status_lbl.config(text='● מפעיל שרת...', fg=C['amber'])
        threading.Thread(target=self._run_flask, daemon=True).start()

    def _stop_server(self):
        self.toggle_btn.config(state=tk.DISABLED, text='מכבה שרת...', bg=C['border'])
        self.status_lbl.config(text='● מכבה שרת...', fg=C['amber'])
        threading.Thread(target=self._send_shutdown, daemon=True).start()

    def _send_shutdown(self):
        try:
            req = ur2.Request(SRV_URL + '/shutdown', data=b'', method='POST')
            with ur2.urlopen(req, timeout=3) as r:
                pass
        except Exception:
            pass

    def _run_flask(self):
        import sys as _sys, io
        class _Sink(io.TextIOBase):
            def write(self, m): return len(m)
            def flush(self): pass
        _sys.stdout = _Sink()
        _sys.stderr = _Sink()

        try:
            sp   = os.path.join(_BD, 'server.py')
            spec = importlib.util.spec_from_file_location('_yn_gui_srv', sp)
            mod  = importlib.util.module_from_spec(spec)
            _sys.modules['_yn_gui_srv'] = mod
            spec.loader.exec_module(mod)
            import logging as _lg
            _lg.getLogger('werkzeug').setLevel(_lg.ERROR)
            mod.app.run(host='127.0.0.1', port=SRV_PORT, debug=False, threaded=True, use_reloader=False)
        except Exception:
            pass

    def _poll(self):
        if not self.running: return
        try:
            with ur2.urlopen(SRV_URL + '/ping', timeout=1.5) as r:
                if r.status == 200:
                    self.is_server_on = True
                    self.status_lbl.config(text='● השרת פעיל ומחובר', fg=C['green'])
                    self.toggle_btn.config(state=tk.NORMAL, text='🛑 כבה שרת', bg=C['red'], activebackground=C['red_h'])
        except Exception:
            self.is_server_on = False
            self.status_lbl.config(text='● השרת כבוי', fg=C['red'])
            self.toggle_btn.config(state=tk.NORMAL, text='▶ הפעל שרת', bg=C['green'], activebackground=C['green_h'])

        self.root.after(1500, self._poll)

    def _quit(self):
        self.running = False
        self._send_shutdown()
        self.root.destroy()

    def run(self):
        self.root.mainloop()

if __name__ == '__main__':
    App().run()
