# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['yonitube_gui.py'],
    pathex=[],
    binaries=[],
    datas=[('icon.ico', '.'), ('server.py', '.'), ('cookies.txt', '.'), ('yn_speed.txt', '.')],
    hiddenimports=['flask', 'flask_cors', 'PIL', 'mutagen', 'psutil'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='YoniTubeServer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
