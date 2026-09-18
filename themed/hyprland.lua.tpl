local active_border_color = {{ hypr_gradient hyprland_active_border accent }}
local inactive_border_color = {{ hypr_gradient hyprland_inactive_border rgba(595959aa) }}
local shadow_color = "rgba({{ darker_background_strip }}8c)"

hl.config({
  general = {
    col = {
      active_border = active_border_color,
      inactive_border = inactive_border_color,
    },
    border_size = 2,
    gaps_in = 8,
    gaps_out = 15,
  },

  group = {
    col = {
      border_active = active_border_color,
      border_inactive = inactive_border_color,
    },
  },

  decoration = {
    dim_inactive = false,
    rounding = 14,
    shadow = {
      enabled = true,
      range = 16,
      render_power = 3,
      color = shadow_color,
      color_inactive = shadow_color,
      offset = "2 2",
    },
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
  animations = {
    enabled = true,
  },
})

-- Soft drift through tinted glass: buoyant, never elastic.
hl.curve("auroraFloat", { type = "bezier", points = { { 0.22, 0.9 }, { 0.2, 1.0 } } })
hl.curve("auroraDrift", { type = "bezier", points = { { 0.3, 1.05 }, { 0.38, 1.0 } } })
hl.curve("glassFade", { type = "bezier", points = { { 0.18, 0.0 }, { 0.12, 1.0 } } })
hl.curve("workspaceGlide", { type = "bezier", points = { { 0.23, 0.84 }, { 0.34, 1.0 } } })

hl.animation({ leaf = "windows", enabled = true, speed = 5, bezier = "auroraFloat" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 5, bezier = "auroraDrift", style = "popin 10%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 4, bezier = "glassFade", style = "popin 82%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 5, bezier = "auroraFloat" })
hl.animation({ leaf = "border", enabled = true, speed = 6, bezier = "glassFade" })
hl.animation({ leaf = "fade", enabled = true, speed = 5, bezier = "glassFade" })
hl.animation({ leaf = "layers", enabled = true, speed = 5, bezier = "auroraDrift", style = "slidefade" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 5, bezier = "auroraDrift", style = "slidefade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, bezier = "glassFade", style = "fade" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 7, bezier = "workspaceGlide", style = "slide" })

o.window({ tag = "default-opacity" }, { opacity = "0.70 override 0.70 override" })
o.window({ tag = "chromium-based-browser" }, { opacity = "0.80 override 0.80 override" })
o.window({ tag = "firefox-based-browser" }, { opacity = "0.80 override 0.80 override" })
o.window("chromium-[a-z0-9-]+", { opacity = "0.80 override 0.80 override" })
o.window("chrome-.*__-Default", { opacity = "0.80 override 0.80 override" })
o.window("brave-.*", { opacity = "0.80 override 0.80 override" })
o.window("^(org\\.gnome\\.Nautilus|nautilus)$", { opacity = "0.70 override 0.70 override" })
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
