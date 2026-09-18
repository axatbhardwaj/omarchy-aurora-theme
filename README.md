# Omarchy Elysian Theme

A dual-tone glass theme: aurora green leads (accent, focus, selection, borders, text tint), twilight violet supports (inactive frames, placeholders, quiet chrome), on an indigo-black base. The shell reads as dark glass catching green and violet light — never green-only, never violet-only.

Palette lives in `colors.toml`; every other file derives from it. Lead `#62e2a4`, text `#dcefe3`, support `#9d8cff`, base `#0b0c14`. The active border is a 35° sweep `green → pale green → violet`; the inactive border is violet at 60%.

![Screenshot](screenshot.png)

Wallpapers: "Aurora Lake" (default) is an AI-generated illustration commissioned for this theme, upscaled to 3840×2160 with Real-ESRGAN; "Creature of Fantasyland" and "Verdant Mountain" by bisbiswas; ["The Aurora Stones"](https://www.deviantart.com/hyokka/art/The-Aurora-Stones-783847442) by hyokka, © 2019 - 2026 hyokka.

## Installation

Install this theme by running:

```bash
omarchy-theme-install https://github.com/axatbhardwaj/omarchy-elysian-theme
```

## Shell surfaces

`shell.toml` styles Omarchy 4's bar, launcher, menus, notifications, polkit, and lock screen: dark glass at 0.80–0.96 alpha, gradient borders at ~0.75 alpha, green for selection, countdowns and text, violet for placeholders and quiet control chrome. Windows are rounded at 14 with 11/22 gaps, a soft shadow, and buoyant, non-elastic animations.

On a Lua-configured Hyprland (Omarchy 4 default) the theme's `hyprland.conf` is never sourced and git-installed themes cannot ship Lua, so rounding, gaps, shadow, and animations only reach the compositor through a user-owned `~/.config/omarchy/themed/hyprland.lua.tpl`; `hyprland.conf` records the same values for `.conf`-based setups.

## Balanced Glass

Balanced Glass uses xray to frost the wallpaper beneath windows. Normal windows, browsers, and Nautilus sit at 0.90. Dimming is off entirely, with no active/inactive opacity gap; the green-led gradient border is the focus cue.

The fully opaque protected surfaces are:

- Steam; Zoom; VLC; mpv; Kdenlive; OBS Studio; Pinta; imv; and Nautilus Previewer.
- RetroArch and qemu.
- GeForce NOW and Moonlight, pinned explicitly by this theme because their upstream app rules do not remove `default-opacity`.
- YouTube and Zoom web apps, picture-in-picture, and the webcam overlay.
- Credential windows: 1Password, Bitwarden desktop and browser extension, KeePassXC, and Proton Pass.

Alacritty and kitty are pinned opaque at the compositor so terminal glyphs stay crisp. Omarchy 4 generates their palettes, along with Neovim's Aether palette, from `colors.toml`. Git-installed themes cannot ship terminal configuration or Lua, so background-only terminal transparency belongs in a user-owned template under `~/.config/omarchy/themed/`; this repository intentionally does not bypass that boundary. Zed is compositor-pinned opaque so that user-owned background transparency composes cleanly rather than stacking with compositor opacity. Ghostty and Foot are compositor-pinned and intentionally remain opaque.

The shipped CSS/INI/CSS keeps Waybar, Mako, and Walker translucent: Waybar and Mako use 0.55 alpha; Walker’s main panel composes to about 0.55, while its search row and keybind strip use raw `@base` and composite nearer 0.81. `chromium.theme` uses the base `11,12,20` (`#0b0c14`), which is already lifted enough for tab-strip legibility.

## Theme Locations

After installation, certain theme files need to be manually moved to their respective locations:

### Vencord Theme
Move the Vencord theme file to:
```
~/.config/Vencord/themes/
```

Or if using Vesktop:
```
~/.config/vesktop/themes/
```

### GTK Theme
Move the GTK theme file to:
```
~/.config/gtk-4.0/gtk.css
```

For GTK 3:
```
~/.config/gtk-3.0/gtk.css
```

### Who
Made by [Bjarne Oeverli](https://x.com/iamdothash) using [Aether](https://github.com/bjarneo/Aether).
