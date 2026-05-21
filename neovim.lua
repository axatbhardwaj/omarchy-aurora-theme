return {
  {
    "bjarneo/aether.nvim",
    branch = "v3",
    name = "aether",
    priority = 1000,
    opts = {
      colors = {
        bg         = "#010401",
        dark_bg    = "#000000",
        darker_bg  = "#000000",
        lighter_bg = "#071c07",

        fg         = "#fdfffd",
        dark_fg    = "#97ff97",
        light_fg   = "#ffffff",
        bright_fg  = "#ffffff",
        muted      = "#595c59",

        red        = "#bf5a7c",
        yellow     = "#dfec63",
        orange     = "#cfa370",
        green      = "#70cf6c",
        cyan       = "#9ed8dd",
        blue       = "#62e2a4",
        purple     = "#e0eb7a",
        brown      = "#6a3345",

        bright_red    = "#dcb0be",
        bright_yellow = "#f6fdb7",
        bright_green  = "#b4e8b2",
        bright_cyan   = "#e3f5f6",
        bright_blue   = "#b0f3d2",
        bright_purple = "#f8fdce",

        accent               = "#62e2a4",
        cursor               = "#fdfffd",
        foreground           = "#fdfffd",
        background           = "#010401",
        selection            = "#071c07",
        selection_foreground = "#fdfffd",
        selection_background = "#071c07",
      },
    },
    -- set up hot reload
    config = function(_, opts)
      require("aether").setup(opts)
      vim.cmd.colorscheme("aether")
      require("aether.hotreload").setup()
    end,
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "aether",
    },
  },
}
