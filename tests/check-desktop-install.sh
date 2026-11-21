#!/usr/bin/env bash
# Run on an Omarchy 4 host; all files, hooks and Git clones use a scratch HOME.
set -euo pipefail
src=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/home/.config"
export XDG_STATE_HOME="$HOME/.local/state" XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache" XDG_RUNTIME_DIR="$tmp/run"
export OMARCHY_THEME_HEADLESS=1 GSETTINGS_BACKEND=memory
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS HYPRLAND_INSTANCE_SIGNATURE
mkdir -m 700 -p "$XDG_RUNTIME_DIR" "$HOME" "$tmp/omarchy-aurora-theme"
tar --exclude=.git -C "$src" -cf - . | tar -C "$tmp/omarchy-aurora-theme" -xf -
git -C "$tmp/omarchy-aurora-theme" init -q
git -C "$tmp/omarchy-aurora-theme" add .
git -C "$tmp/omarchy-aurora-theme" -c user.name=Test -c user.email=test@invalid commit -qm theme

mkdir -p "$XDG_CONFIG_HOME"/{ghostty,kitty,alacritty,gtk-4.0,hypr}
printf 'window-padding-x = 27\nbackground-opacity = 0.70\n' > "$XDG_CONFIG_HOME/ghostty/config"
printf 'font_size 14\n' > "$XDG_CONFIG_HOME/kitty/kitty.conf"
printf 'general.import = [ "~/.local/state/omarchy/current/theme/alacritty.toml" ]\n' > "$XDG_CONFIG_HOME/alacritty/alacritty.toml"
printf '/* my GTK rule */\n' > "$XDG_CONFIG_HOME/gtk-4.0/gtk.css"
printf '%s\n' '-- my monitor' > "$XDG_CONFIG_HOME/hypr/hyprland.lua"
cp "$XDG_CONFIG_HOME/ghostty/config" "$tmp/original"
omarchy-theme-install "$tmp/omarchy-aurora-theme"
installed="$XDG_CONFIG_HOME/omarchy/themes/aurora"
python3 "$installed/desktop/install.py"
root="$XDG_CONFIG_HOME/aurora-desktop"
test "$(readlink "$root/active")" = lake
cmp "$tmp/original" "$XDG_CONFIG_HOME/ghostty/config.before-aurora-desktop"
test "$(head -n 1 "$XDG_CONFIG_HOME/gtk-4.0/gtk.css")" = '@import url("../aurora-desktop/active/files.css");'
grep -q 'my GTK rule' "$XDG_CONFIG_HOME/gtk-4.0/gtk.css"
grep -q '0.4316' "$root/active/ghostty.conf"
if command -v ghostty >/dev/null; then
    ghostty +show-config > "$tmp/ghostty"
    grep -Fxq 'background-opacity = 0.4316' "$tmp/ghostty"
    grep -Fxq 'background = #0b0910' "$tmp/ghostty"
    grep -Fxq 'window-padding-x = 27' "$tmp/ghostty"
fi
cp "$XDG_CONFIG_HOME/ghostty/config" "$tmp/once"
python3 "$installed/desktop/install.py"
cmp "$tmp/once" "$XDG_CONFIG_HOME/ghostty/config"
# A newer selection wins even when an older completion hook arrives last.
printf 'other\n' > "$XDG_STATE_HOME/omarchy/current/theme.name"
omarchy-hook theme-set aurora
test "$(readlink "$root/active")" = off
test ! -s "$root/active/ghostty.conf"
if command -v ghostty >/dev/null; then
    ghostty +show-config > "$tmp/ghostty"
    grep -Fxq 'background-opacity = 0.7' "$tmp/ghostty"
fi
printf 'aurora\n' > "$XDG_STATE_HOME/omarchy/current/theme.name"
omarchy-hook theme-set other
test "$(readlink "$root/active")" = lake
printf 'local rule\n' > "$root/lake/kitty.conf"
if python3 "$installed/desktop/install.py"; then exit 1; fi
grep -Fxq 'local rule' "$root/lake/kitty.conf"
echo 'Desktop install, personal configuration, reruns, hook ordering and conflicts passed.'
