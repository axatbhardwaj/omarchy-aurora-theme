return {
    {
        "bjarneo/aether.nvim",
        name = "aether",
        priority = 1000,
        opts = {
            disable_italics = false,
            colors = {
                -- Monotone shades (base00-base07)
                base00 = "#010401", -- Default background
                base01 = "#518a51", -- Lighter background (status bars)
                base02 = "#010401", -- Selection background
                base03 = "#518a51", -- Comments, invisibles
                base04 = "#bff2ab", -- Dark foreground
                base05 = "#fdfffd", -- Default foreground
                base06 = "#fdfffd", -- Light foreground
                base07 = "#bff2ab", -- Light background

                -- Accent colors (base08-base0F)
                base08 = "#bf5a7c", -- Variables, errors, red
                base09 = "#dcb0be", -- Integers, constants, orange
                base0A = "#DFEC63", -- Classes, types, yellow
                base0B = "#70cf6c", -- Strings, green
                base0C = "#9ed8dd", -- Support, regex, cyan
                base0D = "#62e2a4", -- Functions, keywords, blue
                base0E = "#e0eb7a", -- Keywords, storage, magenta
                base0F = "#f6fdb7", -- Deprecated, brown/yellow
            },
        },
        config = function(_, opts)
            require("aether").setup(opts)
            vim.cmd.colorscheme("aether")

            -- Enable hot reload
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
