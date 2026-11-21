-- Loaded after personal looknfeel and Omarchy's glass toggles. Check the
-- current name synchronously: the theme-set hook runs after Hyprland reloads.
local f = io.open(os.getenv("HOME") .. "/.local/state/omarchy/current/theme.name")
if not f then return end
local name = f:read("*l")
f:close()
if name ~= "aurora" then return end

local focus, idle = "rgba(85d9acff)", "rgba(727773ff)"
hl.config({
  general = { border_size = 2, col = { active_border = focus, inactive_border = idle } },
  group = { col = { border_active = focus, border_inactive = idle } },
  decoration = {
    dim_inactive = false,
    blur = { enabled = true, size = 24, passes = 4, xray = true,
      special = true, ignore_opacity = true, noise = 0, vibrancy = 0,
      contrast = 1, brightness = 1 },
  },
})
o.window({ focus = false, float = false }, { border_size = 1 })
o.window("^(org\\.gnome\\.Nautilus|nautilus)$", { opacity = "1 override 1 override" })
o.window({ tag = "terminal" }, { opacity = "1 override 1 override" })
hl.layer_rule({ match = { namespace = "waybar" }, blur = true, ignore_alpha = 0.01 })
hl.layer_rule({ match = { namespace = "omarchy-bar" }, blur = true, blur_popups = true, ignore_alpha = 0.01 })
