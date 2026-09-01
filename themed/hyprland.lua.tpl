local active_border_color = {{ hypr_gradient hyprland_active_border accent }}
local inactive_border_color = {{ hypr_gradient hyprland_inactive_border rgba(595959aa) }}

hl.config({
  general = {
    col = {
      active_border = active_border_color,
      inactive_border = inactive_border_color,
    },
  },

  group = {
    col = {
      border_active = active_border_color,
      border_inactive = inactive_border_color,
    },
  },

  decoration = {
    dim_inactive = false,
    blur = {
      enabled = true,
      size = 24,
      passes = 4,
      noise = 0.03,
      contrast = 1.45,
      brightness = 1.15,
      vibrancy = 0.03,
      vibrancy_darkness = 0.7,
      xray = true,
      ignore_opacity = true,
      special = true,
    },
  },
})

o.window({ tag = "default-opacity" }, { opacity = "0.80 override 0.80 override" })
o.window({ tag = "chromium-based-browser" }, { opacity = "0.90 override 0.90 override" })
o.window({ tag = "firefox-based-browser" }, { opacity = "0.90 override 0.90 override" })
o.window("chromium-[a-z0-9-]+", { opacity = "0.90 override 0.90 override" })
o.window("chrome-.*__-Default", { opacity = "0.90 override 0.90 override" })
o.window("brave-.*", { opacity = "0.90 override 0.90 override" })
o.window("^(org\\.gnome\\.Nautilus|nautilus)$", { opacity = "0.80 override 0.80 override" })
o.window({ tag = "terminal" }, { opacity = "1 override 1 override" })
o.window("dev\\.zed\\.Zed", { opacity = "1 override 1 override" })
o.window(
  "^(chrome-youtube\\.com__-Default|chrome-app\\.zoom\\.us__wc_home-Default|chrome-www\\.crunchyroll\\.com__-Default|brave-youtube\\.com__-Default|brave-www\\.crunchyroll\\.com__-Default|brave-www\\.jiohotstar\\.com__-Default|brave-reanime\\.to__home-Default)$",
  { opacity = "1 override 1 override" }
)
o.window({ tag = "pip" }, { opacity = "1 override 1 override" })
o.window({ title = "WebcamOverlay" }, { opacity = "1 override 1 override" })
o.window(
  "(1[pP]assword|Bitwarden|org\\.keepassxc\\.KeePassXC|Proton Pass|chrome-nngceckbapebfimnlniiiahkandclblb-Default)",
  { opacity = "1 override 1 override" }
)
o.window("^(GeForceNOW|com\\.moonlight_stream\\.Moonlight)$", { opacity = "1 override 1 override" })

hl.layer_rule({ match = { namespace = "waybar" }, blur = true, ignore_alpha = 0.5 })
hl.layer_rule({ match = { namespace = "omarchy-bar" }, blur = true, ignore_alpha = 0.5 })
hl.layer_rule({ match = { namespace = "walker" }, blur = true, ignore_alpha = 0.5 })
hl.layer_rule({ match = { namespace = "notifications" }, blur = true })
