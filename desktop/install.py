#!/usr/bin/env python3
"""Install reviewed Aurora desktop includes as the desktop user (Python 3.11+)."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib

source = Path(__file__).resolve().parent
config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
root = config / "aurora-desktop"
changes = {}


def read(path):
    if path.is_symlink():
        sys.exit(f"Preserved symlink {path}. Merge the include in its owner and rerun.")
    return path.read_bytes() if path.exists() else b""


def own(path, data):
    previous = read(path)
    if path.exists() and previous != data:
        sys.exit(f"Preserved existing {path}. Compare it with the reviewed desktop package.")
    if not path.exists():
        changes[path] = data


def include(path, line, first=False):
    old = read(path)
    line = line.encode()
    if line in old.splitlines():
        return
    if not old or first:
        changes[path] = line + b"\n" + old
    else:
        changes[path] = old + (b"" if old.endswith(b"\n") else b"\n") + line + b"\n"


def add_alacritty(path, fragment):
    old = read(path)
    data = tomllib.loads(old.decode())
    imports = data.get("general", {}).get("import", [])
    if fragment in imports:
        return
    # Keep comments, tables, keybinds and ordering. Transform only Omarchy's
    # known single-line import; give customized layouts a concrete manual edit.
    match = re.search(rb'(?m)^general\.import\s*=\s*\[([^\]\n]*)\]', old)
    if not match or data.get("window", {}).get("opacity") is not None:
        print(f"{path}: add {fragment!r} last in general.import. A main window.opacity overrides imports.", file=sys.stderr)
        return
    existing = match[1].rstrip()
    separator = b" " if not existing or existing.endswith(b",") else b", "
    edit = old[:match.start(1)] + existing + separator + json.dumps(fragment).encode() + old[match.end(1):]
    if tomllib.loads(edit.decode())["general"]["import"] != [*imports, fragment]:
        sys.exit(f"Could not preserve imports in {path}")
    changes[path] = edit


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    original = read(path)
    if path.exists() and original != data:
        # Keep the first, exact pre-integration file until the user removes it.
        backup = path.with_name(path.name + ".before-aurora-desktop")
        if not backup.exists():
            with backup.open("xb") as file:
                os.fchmod(file.fileno(), path.stat().st_mode & 0o777)
                file.write(original)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
        try:
            os.fchmod(file.fileno(), path.stat().st_mode & 0o777 if path.exists() else 0o600)
            file.write(data)
            file.flush()
            os.replace(file.name, path)
        finally:
            Path(file.name).unlink(missing_ok=True)


def install():
    lake = source / "lake"
    gtk = shutil.which("gtk4-launch")
    version = subprocess.check_output([gtk, "--version"], text=True).strip() if gtk else "0"
    for file in sorted(lake.iterdir()):
        data = file.read_bytes()
        if file.name == "files.css" and tuple(map(int, version.split(".")[:2])) >= (4, 24):
            data += b"\nwindow.nautilus-window, window.ghostty { backdrop-filter: blur(24px); }\n"
        own(root / "lake" / file.name, data)
        own(root / "off" / file.name, b"")
    own(root / "late.lua", (source / "late.lua").read_bytes())
    hook = config / "omarchy/hooks/theme-set.d/90-aurora-desktop"
    own(hook, (source / "theme-set").read_bytes())
    # 3.x only invokes hooks/<name>. Probe the installed dispatcher under a
    # temporary HOME so newer versions never run the same hook twice.
    dispatcher = shutil.which("omarchy-hook")
    if dispatcher:
        with tempfile.TemporaryDirectory() as scratch:
            probe = Path(scratch) / ".config/omarchy/hooks/aurora-probe.d/one"
            probe.parent.mkdir(parents=True)
            probe.write_text("echo aurora-hook-ok\n")
            output = subprocess.check_output([dispatcher, "aurora-probe"], text=True,
                                             env={**os.environ, "HOME": scratch, "XDG_CONFIG_HOME": str(Path(scratch) / ".config")})
        if "aurora-hook-ok" not in output.splitlines():
            include(hook.parent.parent / "theme-set", 'bash "$HOME/.config/omarchy/hooks/theme-set.d/90-aurora-desktop" "$@"')
    if (root / "active").exists() and not (root / "active").is_symlink():
        sys.exit(f"Preserved existing {root / 'active'}; expected a profile symlink.")

    gtk = config / "gtk-4.0/gtk.css"
    include(gtk, '@import url("../aurora-desktop/active/files.css");', first=True)
    lua = config / "hypr/hyprland.lua"
    if lua.exists():
        include(lua, 'dofile((os.getenv("XDG_CONFIG_HOME") or os.getenv("HOME") .. "/.config") .. "/aurora-desktop/late.lua")')

    # These files already import the Omarchy palette. Keep it for ANSI colors,
    # font, and selection. Aurora adds only bottom-layer color and opacity.
    for app, filename, fragment, directive in [
        ("ghostty", "config.ghostty", "ghostty.conf", 'config-file = "{path}"'),
        ("kitty", "kitty.conf", "kitty.conf", 'include {path}'),
        ("alacritty", "alacritty.toml", "alacritty.toml", None),
        ("foot", "foot.ini", "foot.ini", None),
    ]:
        path = config / app / filename
        if app == "ghostty" and not path.exists():
            path = config / app / "config"
        if not path.exists():
            continue
        target = str(root / "active" / fragment)
        if app == "alacritty":
            add_alacritty(path, target)
        elif app == "foot":
            # foot parses include directives in [main], in encounter order.
            line = f"include={target}".encode()
            old = read(path)
            if line not in old.splitlines():
                changes[path] = old + b"\n[main]\n" + line + b"\n"
        else:
            include(path, directive.format(path=target))

    for path, data in changes.items():
        write(path, data)
    subprocess.run(["bash", hook], check=True)


if __name__ == "__main__":
    root.mkdir(parents=True, exist_ok=True)
    with (root / ".install.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        install()
