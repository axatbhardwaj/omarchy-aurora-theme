# Omarchy Elysian Theme

A desktop theme that translates the mythical serenity of an Elysian forest where ancient, vibrant life glows in golden-green light into a high-contrast, productive workspace.

![Screenshot](screenshot.png)

Wallpapers: "Creature of Fantasyland" and "Verdant Mountain" by bisbiswas; ["The Aurora Stones"](https://www.deviantart.com/hyokka/art/The-Aurora-Stones-783847442) by hyokka, © 2019 - 2026 hyokka.

## Installation

Install this theme by running:

```bash
omarchy-theme-install https://github.com/axatbhardwaj/omarchy-elysian-theme
```

## Balanced Glass

Balanced Glass uses xray to frost the wallpaper beneath windows. Blur is size 24 with 4 passes — Dual Kawase needs the extra radius, not extra passes; 8 passes flatten the wallpaper into a solid color. Normal windows, browsers, and Nautilus sit at 0.80. Dimming is off entirely, with no active/inactive opacity gap; the green active border is the focus cue.

The fully opaque protected surfaces are:

- Steam; Zoom; VLC; mpv; Kdenlive; OBS Studio; Pinta; imv; and Nautilus Previewer.
- RetroArch and qemu.
- GeForce NOW and Moonlight, pinned explicitly by this theme because their upstream app rules do not remove `default-opacity`.
- YouTube and Zoom web apps, picture-in-picture, and the webcam overlay.
- Credential windows: 1Password, Bitwarden desktop and browser extension, KeePassXC, and Proton Pass.

Alacritty and kitty are pinned opaque at the compositor so terminal glyphs stay crisp. Omarchy 4 generates their palettes, along with Neovim's Aether palette, from `colors.toml`. Git-installed themes cannot ship terminal configuration or Lua, so background-only terminal transparency belongs in a user-owned template under `~/.config/omarchy/themed/`; this repository intentionally does not bypass that boundary. Copy `themed/hyprland.lua.tpl` there so Omarchy 4 actually loads Balanced Glass — cloned themes drop `hyprland.lua` and ignore `hyprland.conf`. Zed is compositor-pinned opaque so that user-owned background transparency composes cleanly rather than stacking with compositor opacity. Ghostty and Foot are compositor-pinned and intentionally remain opaque.

The shipped CSS/INI/CSS keeps Waybar, Mako, and Walker translucent: Waybar and Mako use 0.55 alpha; Walker’s main panel composes to about 0.55, while its search row and keybind strip use raw `@base` and composite nearer 0.81. `chromium.theme` intentionally stays at `20,26,23` (`#141a17`) instead of the palette’s near-black `#010401`: Chromium’s frame needs that lift for tab-strip legibility.

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
