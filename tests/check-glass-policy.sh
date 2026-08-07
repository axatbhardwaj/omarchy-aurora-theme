#!/usr/bin/env bash
set -euo pipefail

# This is a regression guard for plain-syntax drift, not a hyprlang parser; live
# hyprctl verification is authoritative. Runtime mutation via `hyprctl keyword`
# from outside this file remains undetectable. Policy detection covers a limited
# set of rule keywords. Accepted limits: variable indirection, colon-qualified
# block headers (`decoration:blur { }`), bare `tag <name>` without a +/- prefix,
# `opacityrule`, and future Hyprland syntax forms. extract_layer_rules parses
# only anonymous `layerrule =` forms, so a `layerrule { }` block could disable
# layer blur unnoticed and is outside this script's scope.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config="${1:-$repo_root/hyprland.conf}"
upstream_apps_dir="${OMARCHY_APPS_DIR:-${OMARCHY_PATH:-$HOME/.local/share/omarchy}/default/hypr/apps}"
upstream_themed_dir="${OMARCHY_THEMED_DIR:-${OMARCHY_PATH:-$HOME/.local/share/omarchy}/default/themed}"
failures=0

check() {
    local description="$1"
    shift

    if "$@"; then
        printf 'Checking %s... PASS\n' "$description"
    else
        printf 'Checking %s... FAIL\n' "$description"
        failures=$((failures + 1))
    fi
}

skip() {
    local description="$1"
    local reason="$2"

    printf 'Checking %s... SKIP (%s)\n' "$description" "$reason"
}

matches() {
    local content="$1"
    local pattern="$2"

    grep -Eq -- "$pattern" <<<"$content"
}

does_not_match() {
    ! matches "$1" "$2"
}

equals() {
    [[ "$1" == "$2" ]]
}

mako_has_translucent_background() {
    local file="$1"

    [[ -f "$file" ]] && grep -Eq -- '^[[:space:]]*background-color[[:space:]]*=[[:space:]]*#[[:xdigit:]]{6}([0-9A-Ea-e][[:xdigit:]]|[Ff][0-9A-Ea-e])[[:space:]]*$' "$file"
}

waybar_has_blur_compatible_background() {
    local file="$1"

    [[ -f "$file" ]] && awk '
        /^[[:space:]]*window#waybar[[:space:]]*\{[[:space:]]*$/ {
            in_waybar = 1
            next
        }
        in_waybar && /^[[:space:]]*\}[[:space:]]*$/ {
            in_waybar = 0
            next
        }
        in_waybar && /^[[:space:]]*background-color[[:space:]]*:[[:space:]]*rgba\([^)]*\)[[:space:]]*;?[[:space:]]*$/ {
            alpha = $0
            sub(/^.*,[[:space:]]*/, "", alpha)
            sub(/\)[[:space:]]*;?[[:space:]]*$/, "", alpha)
            if (alpha ~ /^([0-9]+([.][0-9]*)?|[.][0-9]+)$/ && alpha + 0 > 0.5 && alpha + 0 < 1.0) {
                found = 1
            }
        }
        END { exit(found ? 0 : 1) }
    ' "$file"
}

walker_has_blur_compatible_base() {
    local file="$1"

    [[ -f "$file" ]] && awk '
        /^[[:space:]]*@define-color[[:space:]]+base[[:space:]]+rgba\([^)]*\)[[:space:]]*;?[[:space:]]*$/ {
            alpha = $0
            sub(/^.*,[[:space:]]*/, "", alpha)
            sub(/\)[[:space:]]*;?[[:space:]]*$/, "", alpha)
            if (alpha ~ /^([0-9]+([.][0-9]*)?|[.][0-9]+)$/ && alpha + 0 > 0.5 && alpha + 0 < 1.0) {
                found = 1
            }
        }
        END { exit(found ? 0 : 1) }
    ' "$file"
}

alacritty_window_opacity_below_one() {
    local file="$1"

    [[ -f "$file" ]] && awk '
        /^[[:space:]]*\[window\][[:space:]]*$/ {
            in_window = 1
            next
        }
        /^[[:space:]]*\[[^]]+\][[:space:]]*$/ {
            in_window = 0
            next
        }
        in_window && /^[[:space:]]*opacity[[:space:]]*=/ {
            opacity = $0
            sub(/^[^=]*=[[:space:]]*/, "", opacity)
            sub(/[[:space:]]*(#.*)?$/, "", opacity)
            seen = 1
            valid = opacity ~ /^([0-9]+([.][0-9]*)?|[.][0-9]+)$/ && opacity + 0 < 1.0
        }
        END { exit(seen && valid ? 0 : 1) }
    ' "$file"
}

toml_value() {
    local file="$1"
    local section="$2"
    local key="$3"

    awk -v section="$section" -v key="$key" '
        BEGIN { in_section = section == "" }
        /^[[:space:]]*\[[^]]+\][[:space:]]*$/ {
            current = $0
            sub(/^[[:space:]]*\[/, "", current)
            sub(/\][[:space:]]*$/, "", current)
            in_section = current == section
            next
        }
        in_section {
            line = $0
            if (line ~ "^[[:space:]]*" key "[[:space:]]*=") {
                sub("^[[:space:]]*" key "[[:space:]]*=[[:space:]]*", "", line)
                sub(/[[:space:]]+$/, "", line)
                if (line ~ /^"/) {
                    sub(/^"/, "", line)
                    sub(/".*$/, "", line)
                } else {
                    sub(/[[:space:]]+#.*$/, "", line)
                }
                value = line
            }
        }
        END { print value }
    ' "$file"
}

kitty_value() {
    local file="$1"
    local key="$2"

    awk -v key="$key" '
        $1 == key {
            value = $2
        }
        END { print value }
    ' "$file"
}

toml_path_value() {
    local file="$1"
    local path="$2"

    toml_value "$file" "${path%.*}" "${path##*.}"
}

theme_file_has_complete_palette() {
    local theme_file="$1"
    local palette_file="$2"
    local value_reader="$3"
    local theme_key
    local palette_key
    local expected
    local actual

    [[ -f "$theme_file" && -f "$palette_file" ]] || return 1

    while read -r theme_key palette_key; do
        expected="$(toml_value "$palette_file" "" "$palette_key")"
        actual="$("$value_reader" "$theme_file" "$theme_key")"
        if [[ -z "$expected" || "$actual" != "$expected" ]]; then
            printf '%s key %s does not match %s key %s.\n' "$theme_file" "$theme_key" "$palette_file" "$palette_key"
            return 1
        fi
    done

    if grep -Eq -- '\{\{[^}]+\}\}' "$theme_file"; then
        printf '%s contains an unresolved template placeholder.\n' "$theme_file"
        return 1
    fi
}

kitty_template_colour_pairs() {
    printf '%s\n' \
        'foreground foreground' \
        'background background' \
        'selection_foreground selection_foreground' \
        'selection_background selection_background' \
        'cursor cursor' \
        'cursor_text_color background' \
        'active_border_color accent' \
        'active_tab_background accent' \
        'color0 color0' \
        'color1 color1' \
        'color2 color2' \
        'color3 color3' \
        'color4 color4' \
        'color5 color5' \
        'color6 color6' \
        'color7 color7' \
        'color8 color8' \
        'color9 color9' \
        'color10 color10' \
        'color11 color11' \
        'color12 color12' \
        'color13 color13' \
        'color14 color14' \
        'color15 color15'
}

alacritty_template_colour_pairs() {
    printf '%s\n' \
        'colors.primary.background background' \
        'colors.primary.foreground foreground' \
        'colors.cursor.text background' \
        'colors.cursor.cursor cursor' \
        'colors.vi_mode_cursor.text background' \
        'colors.vi_mode_cursor.cursor cursor' \
        'colors.search.matches.foreground background' \
        'colors.search.matches.background color3' \
        'colors.search.focused_match.foreground background' \
        'colors.search.focused_match.background color1' \
        'colors.footer_bar.foreground background' \
        'colors.footer_bar.background foreground' \
        'colors.selection.text selection_foreground' \
        'colors.selection.background selection_background' \
        'colors.normal.black color0' \
        'colors.normal.red color1' \
        'colors.normal.green color2' \
        'colors.normal.yellow color3' \
        'colors.normal.blue color4' \
        'colors.normal.magenta color5' \
        'colors.normal.cyan color6' \
        'colors.normal.white color7' \
        'colors.bright.black color8' \
        'colors.bright.red color9' \
        'colors.bright.green color10' \
        'colors.bright.yellow color11' \
        'colors.bright.blue color12' \
        'colors.bright.magenta color13' \
        'colors.bright.cyan color14' \
        'colors.bright.white color15'
}

kitty_has_complete_palette() {
    local kitty_file="$1"
    local palette_file="$2"

    theme_file_has_complete_palette "$kitty_file" "$palette_file" kitty_value < <(kitty_template_colour_pairs)
}

alacritty_has_complete_palette() {
    local alacritty_file="$1"
    local palette_file="$2"

    theme_file_has_complete_palette "$alacritty_file" "$palette_file" toml_path_value < <(alacritty_template_colour_pairs)
}

kitty_template_colour_pairs_from_file() {
    local template_file="$1"

    awk '
        /^[[:space:]]*#/ { next }
        /^[[:space:]]*[^[:space:]#]+[[:space:]]+\{\{[[:space:]]*[^}]+[[:space:]]*\}\}/ {
            key = $1
            placeholder = $0
            sub(/^.*\{\{[[:space:]]*/, "", placeholder)
            sub(/[[:space:]]*\}\}.*$/, "", placeholder)
            sub(/[[:space:]]+$/, "", placeholder)
            print key " " placeholder
        }
    ' "$template_file"
}

alacritty_template_colour_pairs_from_file() {
    local template_file="$1"

    awk '
        /^[[:space:]]*\[[^]]+\][[:space:]]*$/ {
            section = $0
            sub(/^[[:space:]]*\[/, "", section)
            sub(/\][[:space:]]*$/, "", section)
            next
        }
        /^[[:space:]]*[^[:space:]=]+[[:space:]]*=[[:space:]]*"?\{\{[[:space:]]*[^}]+[[:space:]]*\}\}"?/ {
            key = $0
            sub(/^[[:space:]]*/, "", key)
            sub(/[[:space:]]*=.*$/, "", key)
            placeholder = $0
            sub(/^.*\{\{[[:space:]]*/, "", placeholder)
            sub(/[[:space:]]*\}\}.*$/, "", placeholder)
            sub(/[[:space:]]+$/, "", placeholder)
            print section "." key " " placeholder
        }
    ' "$template_file"
}

template_colour_pairs_match_list() {
    local template_name="$1"
    local template_file="$2"
    local pair_parser="$3"
    local pair_list="$4"
    local upstream_pairs
    local listed_pairs
    local missing_from_list
    local missing_from_upstream
    local theme_key
    local placeholder
    local mismatch=0

    [[ -f "$template_file" ]] || return 1

    upstream_pairs="$("$pair_parser" "$template_file" | LC_ALL=C sort -u)"
    listed_pairs="$("$pair_list" | LC_ALL=C sort -u)"
    missing_from_list="$(LC_ALL=C comm -23 <(printf '%s\n' "$upstream_pairs") <(printf '%s\n' "$listed_pairs"))"
    missing_from_upstream="$(LC_ALL=C comm -13 <(printf '%s\n' "$upstream_pairs") <(printf '%s\n' "$listed_pairs"))"

    while read -r theme_key placeholder; do
        [[ -n "$theme_key" ]] || continue
        printf 'Upstream %s template pair %s -> %s is missing from the hardcoded list.\n' "$template_name" "$theme_key" "$placeholder"
        mismatch=1
    done <<<"$missing_from_list"

    while read -r theme_key placeholder; do
        [[ -n "$theme_key" ]] || continue
        printf 'Hardcoded %s pair %s -> %s is absent from the upstream template.\n' "$template_name" "$theme_key" "$placeholder"
        mismatch=1
    done <<<"$missing_from_upstream"

    ((mismatch == 0))
}

kitty_background_opacity_is() {
    local file="$1"
    local expected="$2"

    [[ -f "$file" ]] && [[ "$(kitty_value "$file" background_opacity)" == "$expected" ]]
}

alacritty_palette_slots_match_source() {
    local alacritty_file="$1"
    local palette_file="$2"

    [[ -f "$alacritty_file" && -f "$palette_file" ]] &&
        [[ "$(toml_value "$alacritty_file" colors.normal white)" == "$(toml_value "$palette_file" "" color7)" ]] &&
        [[ "$(toml_value "$alacritty_file" colors.bright black)" == "$(toml_value "$palette_file" "" color8)" ]]
}

file_contents_equal() {
    local file="$1"
    local expected="$2"

    [[ -f "$file" ]] && [[ "$(<"$file")" == "$expected" ]]
}

strip_comments() {
    awk '{
        sub(/[[:space:]]*#.*/, "")
        print
    }'
}

normalize_rule_lines() {
    awk '
        {
            sub(/\r$/, "")
            gsub(/[[:space:]]+/, " ")
            sub(/^ /, "")
            sub(/ $/, "")
            gsub(/[[:space:]]*=[[:space:]]*/, " = ")
            gsub(/[[:space:]]*,[[:space:]]*/, ", ")
            gsub(/[[:space:]]+/, " ")
            if (length > 0) {
                print
            }
        }
    '
}

extract_policy_rules() {
    awk '
        function clean(raw, line) {
            line = raw
            sub(/[[:space:]]*#.*/, "", line)
            return line
        }

        function anonymous_sets_policy(line, rhs) {
            rhs = line
            sub(/^[^=]*=/, "", rhs)
            return rhs ~ /(^|,)[[:space:]]*(opacity|no_dim|nodim|dim)([[:space:]=,]|$)/
        }

        function block_line_sets_policy(line) {
            return line ~ /(^|[,{;[:space:]])(opacity|no_dim|nodim|dim)[[:space:]]*([=]|[[:space:]])/
        }

        {
            line = clean($0)

            if (!in_block && line ~ /^[[:space:]]*windowrule[[:space:]]*\{/) {
                in_block = 1
                depth = 0
                block = ""
                block_sets_policy = 0
            }

            if (in_block) {
                if (length(line) > 0) {
                    block = block " " line
                }
                if (block_line_sets_policy(line)) {
                    block_sets_policy = 1
                }

                brace_line = line
                opens = gsub(/\{/, "{", brace_line)
                closes = gsub(/\}/, "}", brace_line)
                depth += opens - closes

                if (depth == 0) {
                    if (block_sets_policy) {
                        print block
                    }
                    in_block = 0
                }
                next
            }

            if (line ~ /^[[:space:]]*windowrule(v2)?[[:space:]]*=/ && anonymous_sets_policy(line)) {
                print line
            }
        }
    '
}

extract_layer_rules() {
    awk '
        {
            line = $0
            sub(/[[:space:]]*#.*/, "", line)
            if (line ~ /^[[:space:]]*layerrule[[:space:]]*=/) {
                print line
            }
        }
    '
}

count_blocks() {
    local block_name="$1"

    awk -v block_name="$block_name" '
        {
            line = $0
            sub(/[[:space:]]*#.*/, "", line)
            pattern = "(^|[[:space:]}])" block_name "[[:space:]]*\\{"
            while (match(line, pattern)) {
                count++
                line = substr(line, RSTART + RLENGTH)
            }
        }
        END { print count + 0 }
    ' <<<"$config_contents"
}

last_assignment_in_block() {
    local block_name="$1"
    local key_pattern="$2"

    awk -v block_name="$block_name" -v key_pattern="$key_pattern" '
        {
            line = $0
            sub(/[[:space:]]*#.*/, "", line)

            if (!in_block && line ~ "^[[:space:]]*" block_name "[[:space:]]*\\{") {
                in_block = 1
                depth = 0
            }

            if (in_block) {
                assignment = "^[[:space:]]*" key_pattern "[[:space:]]*="
                if (line ~ assignment) {
                    value = line
                    sub(assignment, "", value)
                    sub(/^[[:space:]]+/, "", value)
                    sub(/[[:space:]}].*$/, "", value)
                    last = value
                }

                brace_line = line
                opens = gsub(/\{/, "{", brace_line)
                closes = gsub(/\}/, "}", brace_line)
                depth += opens - closes
                if (depth == 0) {
                    in_block = 0
                }
            }
        }
        END { print last }
    ' <<<"$config_contents"
}

policy_rule_line_number() {
    local matcher="$1"

    awk -v matcher="$matcher" '
        {
            line = $0
            sub(/[[:space:]]*#.*/, "", line)
            if (line ~ /^[[:space:]]*windowrule[[:space:]]*=[[:space:]]*opacity[[:space:]]+/ &&
                line ~ matcher) {
                last = NR
            }
        }
        END { print last }
    ' <<<"$config_contents"
}

pins_follow_band_rules() {
    local band_line
    local pin_line

    for band_line in "${band_opacity_lines[@]}"; do
        [[ "$band_line" =~ ^[0-9]+$ ]] || return 1
    done

    for pin_line in "${pin_opacity_lines[@]}"; do
        [[ "$pin_line" =~ ^[0-9]+$ ]] || return 1
        for band_line in "${band_opacity_lines[@]}"; do
            ((pin_line > band_line)) || return 1
        done
    done
}

pin_line_follows_band_rules() {
    local pin_line="$1"
    local band_line

    [[ "$pin_line" =~ ^[0-9]+$ ]] || return 1
    for band_line in "${band_opacity_lines[@]}"; do
        [[ "$band_line" =~ ^[0-9]+$ ]] || return 1
        ((pin_line > band_line)) || return 1
    done
}

upstream_app_policies_available() {
    [[ -d "$upstream_apps_dir" ]] && compgen -G "$upstream_apps_dir/*.conf" >/dev/null
}

upstream_strips_default_opacity_for_class() {
    local protected_class="$1"
    local windowrule_pattern='^[[:space:]]*windowrule[[:space:]]*='
    local match_class_pattern='match:class[[:space:]]+([^,]+)'
    local policy_file
    local line
    local matcher

    for policy_file in "$upstream_apps_dir"/*.conf; do
        while IFS= read -r line; do
            line="${line%%#*}"
            [[ "$line" =~ $windowrule_pattern ]] || continue
            [[ "$line" == *"tag -default-opacity"* ]] || continue
            [[ "$line" =~ $match_class_pattern ]] || continue
            matcher="${BASH_REMATCH[1]}"
            matcher="${matcher#"${matcher%%[![:space:]]*}"}"
            matcher="${matcher%"${matcher##*[![:space:]]}"}"
            if [[ "$protected_class" =~ $matcher ]] && [[ "${BASH_REMATCH[0]}" == "$protected_class" ]]; then
                return 0
            fi
        done <"$policy_file"
    done

    return 1
}

exact_class_opacity_pin_line_number() {
    local protected_class="$1"
    local pin_pattern='^[[:space:]]*windowrule[[:space:]]*=[[:space:]]*opacity[[:space:]]+1([.]0)?[[:space:]]+1([.]0)?[[:space:]]*,[[:space:]]*match:class[[:space:]]+(.+)[[:space:]]*$'
    local line
    local line_number=0
    local matcher
    local candidate
    local candidates=()

    while IFS= read -r line; do
        line_number=$((line_number + 1))
        line="${line%%#*}"
        [[ "$line" =~ $pin_pattern ]] || continue
        matcher="${BASH_REMATCH[3]}"
        matcher="${matcher#"${matcher%%[![:space:]]*}"}"
        matcher="${matcher%"${matcher##*[![:space:]]}"}"
        [[ "${matcher:0:1}" == "^" && "${matcher: -1}" == '$' ]] || continue
        matcher="${matcher:1:${#matcher}-2}"
        if [[ "${matcher:0:1}" == "(" && "${matcher: -1}" == ")" ]]; then
            matcher="${matcher:1:${#matcher}-2}"
        fi
        IFS='|' read -r -a candidates <<<"$matcher"
        for candidate in "${candidates[@]}"; do
            candidate="${candidate//\\./.}"
            if [[ "$candidate" == "$protected_class" ]]; then
                printf '%s\n' "$line_number"
                return 0
            fi
        done
    done <<<"$config_contents"

    return 1
}

credential_classes_have_exact_opacity_pins() {
    local credential_class
    local pin_line
    local band_line
    local credential_classes=(
        "1[pP]assword"
        Bitwarden
        org.keepassxc.KeePassXC
        "Proton Pass"
        chrome-nngceckbapebfimnlniiiahkandclblb-Default
    )

    for band_line in "${band_opacity_lines[@]}"; do
        [[ "$band_line" =~ ^[0-9]+$ ]] || {
            printf 'A band opacity rule is missing from %s; credential pin ordering cannot be evaluated.\n' "$config"
            return 1
        }
    done

    for credential_class in "${credential_classes[@]}"; do
        pin_line="$(exact_class_opacity_pin_line_number "$credential_class" || true)"
        if [[ -n "$pin_line" ]] && pin_line_follows_band_rules "$pin_line"; then
            continue
        fi
        printf 'Credential class %s lacks a post-band exact-class opacity pin.\n' "$credential_class"
        return 1
    done
}

protected_set_has_opacity_guards() {
    local protected_class
    local pin_line
    local band_line
    local protected_classes=(
        steam
        zoom
        vlc
        mpv
        org.kde.kdenlive
        com.obsproject.Studio
        com.github.PintaProject.Pinta
        imv
        org.gnome.NautilusPreviewer
        com.libretro.RetroArch
        qemu
        GeForceNOW
        com.moonlight_stream.Moonlight
        chrome-www.crunchyroll.com__-Default
    )

    for band_line in "${band_opacity_lines[@]}"; do
        [[ "$band_line" =~ ^[0-9]+$ ]] || {
            printf 'A band opacity rule is missing from %s; protected-class pin ordering cannot be evaluated.\n' "$config"
            return 1
        }
    done

    for protected_class in "${protected_classes[@]}"; do
        if upstream_strips_default_opacity_for_class "$protected_class"; then
            continue
        fi
        pin_line="$(exact_class_opacity_pin_line_number "$protected_class" || true)"
        if [[ -n "$pin_line" ]] && pin_line_follows_band_rules "$pin_line"; then
            continue
        fi
        printf 'Protected class %s lacks upstream tag stripping or a post-band exact-class opacity pin.\n' "$protected_class"
        return 1
    done
}

has_blanket_opacity_selector() {
    awk '
        function clean(raw, line) {
            line = raw
            sub(/[[:space:]]*#.*/, "", line)
            return line
        }

        function anonymous_sets_opacity(line, rhs) {
            rhs = line
            sub(/^[^=]*=/, "", rhs)
            return rhs ~ /(^|,)[[:space:]]*opacity([[:space:]=,]|$)/
        }

        function block_line_sets_opacity(line) {
            return line ~ /(^|[,{;[:space:]])opacity[[:space:]]*([=]|[[:space:]])/
        }

        function is_blanket(raw, pattern, changed) {
            pattern = raw
            sub(/^[[:space:]]+/, "", pattern)
            sub(/[[:space:]]+$/, "", pattern)
            sub(/^"/, "", pattern)
            sub(/"$/, "", pattern)
            gsub(/[[:space:]]/, "", pattern)

            changed = 1
            while (changed) {
                changed = 0
                if (substr(pattern, 1, 1) == "^") {
                    pattern = substr(pattern, 2)
                    changed = 1
                }
                if (substr(pattern, length(pattern), 1) == "$") {
                    pattern = substr(pattern, 1, length(pattern) - 1)
                    changed = 1
                }
                if (substr(pattern, 1, 3) == "(?:" && substr(pattern, length(pattern), 1) == ")") {
                    pattern = substr(pattern, 4, length(pattern) - 4)
                    changed = 1
                } else if (substr(pattern, 1, 1) == "(" && substr(pattern, length(pattern), 1) == ")") {
                    pattern = substr(pattern, 2, length(pattern) - 2)
                    changed = 1
                }
            }

            return pattern == ".*" || pattern == ".+" ||
                pattern == ".*?" || pattern == ".+?" ||
                pattern == ".{0,}" || pattern == ".{1,}"
        }

        function segment_has_blanket_selector(segment, pattern) {
            if (segment ~ /^[[:space:]]*match:(class|title|initial_class|initial_title)[[:space:]]*(=|[[:space:]])/) {
                pattern = segment
                sub(/^[[:space:]]*match:(class|title|initial_class|initial_title)[[:space:]]*(=[[:space:]]*)?/, "", pattern)
                return is_blanket(pattern)
            }
            if (segment ~ /^[[:space:]]*(class|title|initialclass|initialtitle):/) {
                pattern = segment
                sub(/^[[:space:]]*(class|title|initialclass|initialtitle):[[:space:]]*/, "", pattern)
                return is_blanket(pattern)
            }
            return 0
        }

        function line_has_blanket_selector(line, segments, count, i) {
            count = split(line, segments, ",")
            for (i = 1; i <= count; i++) {
                if (segment_has_blanket_selector(segments[i])) {
                    return 1
                }
            }
            return 0
        }

        {
            line = clean($0)

            if (!in_block && line ~ /^[[:space:]]*windowrule[[:space:]]*\{/) {
                in_block = 1
                depth = 0
                block_sets_opacity = 0
                block_has_blanket = 0
            }

            if (in_block) {
                if (block_line_sets_opacity(line)) {
                    block_sets_opacity = 1
                }
                if (line_has_blanket_selector(line)) {
                    block_has_blanket = 1
                }

                brace_line = line
                opens = gsub(/\{/, "{", brace_line)
                closes = gsub(/\}/, "}", brace_line)
                depth += opens - closes
                if (depth == 0) {
                    if (block_sets_opacity && block_has_blanket) {
                        found = 1
                    }
                    in_block = 0
                }
                next
            }

            if (line ~ /^[[:space:]]*windowrule(v2)?[[:space:]]*=/ &&
                anonymous_sets_opacity(line) && line_has_blanket_selector(line)) {
                found = 1
            }
        }
        END { exit(found ? 0 : 1) }
    ' <<<"$config_contents"
}

has_default_opacity_readdition() {
    awk '
        {
            line = $0
            sub(/[[:space:]]*#.*/, "", line)
            if (line ~ /(^|[=,{;[:space:]])tag[[:space:]]*(=[[:space:]]*)?[+]default-opacity([[:space:],}]|$)/) {
                found = 1
            }
        }
        END { exit(found ? 0 : 1) }
    ' <<<"$config_contents"
}

no_blanket_opacity_selector() {
    ! has_blanket_opacity_selector
}

no_default_opacity_readdition() {
    ! has_default_opacity_readdition
}

if [[ -f "$config" ]]; then
    config_contents="$(<"$config")"
else
    config_contents=""
fi

config_without_comments="$(strip_comments <<<"$config_contents")"

expected_policy_rule_lines=(
    'windowrule = opacity 0.90 0.90, match:tag default-opacity'
    'windowrule = opacity 0.90 0.90, match:tag chromium-based-browser'
    'windowrule = opacity 0.90 0.90, match:tag firefox-based-browser'
    'windowrule = opacity 0.90 0.90, match:class (chromium-[a-z0-9-]+|chrome-.*__-Default)'
    'windowrule = opacity 0.90 0.90, match:class ^(org.gnome.Nautilus|nautilus)$'
    'windowrule = opacity 1 1, match:tag terminal'
    'windowrule = opacity 1 1, match:class ^dev\.zed\.Zed$'
    'windowrule = opacity 1 1, match:class ^(chrome-youtube\.com__-Default|chrome-app\.zoom\.us__wc_home-Default|chrome-www\.crunchyroll\.com__-Default)$'
    'windowrule = opacity 1 1, match:tag pip'
    'windowrule = opacity 1 1, match:title WebcamOverlay'
    'windowrule = opacity 1 1, match:class ^(1[pP]assword|Bitwarden|org.keepassxc.KeePassXC|Proton Pass|chrome-nngceckbapebfimnlniiiahkandclblb-Default)$'
    'windowrule = opacity 1 1, match:class ^(GeForceNOW|com.moonlight_stream.Moonlight)$'
)

expected_layer_rule_lines=(
    'layerrule = blur on, match:namespace waybar'
    'layerrule = blur on, match:namespace walker'
    'layerrule = blur on, match:namespace notifications'
    'layerrule = ignore_alpha 0.5, match:namespace waybar'
    'layerrule = ignore_alpha 0.5, match:namespace walker'
)

expected_policy_rules="$(printf '%s\n' "${expected_policy_rule_lines[@]}" | normalize_rule_lines | LC_ALL=C sort)"
actual_policy_rules="$(extract_policy_rules <<<"$config_contents" | normalize_rule_lines | LC_ALL=C sort)"
expected_layer_rules="$(printf '%s\n' "${expected_layer_rule_lines[@]}" | normalize_rule_lines | LC_ALL=C sort)"
actual_layer_rules="$(extract_layer_rules <<<"$config_contents" | normalize_rule_lines | LC_ALL=C sort)"

default_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+default-opacity([[:space:]]|,|$)')"
chromium_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+chromium-based-browser([[:space:]]|,|$)')"
firefox_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+firefox-based-browser([[:space:]]|,|$)')"
chromium_family_opacity_line="$(policy_rule_line_number 'match:class[[:space:]]+\\(chromium-\\[a-z0-9-\\]\\+\\|chrome-[.][*]__-Default\\)([[:space:]]|,|$)')"
nautilus_opacity_line="$(policy_rule_line_number 'match:class[[:space:]]+\\^\\(org[.]gnome[.]Nautilus\\|nautilus\\)[$]([[:space:]]|,|$)')"
terminal_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+terminal([[:space:]]|,|$)')"
zed_opacity_line="$(policy_rule_line_number 'match:class[[:space:]]+\\^dev')"
video_pwa_opacity_line="$(policy_rule_line_number 'match:class[[:space:]]+\\^\\(chrome-youtube\\\\[.]com__-Default\\|chrome-app\\\\[.]zoom\\\\[.]us__wc_home-Default\\|chrome-www\\\\[.]crunchyroll\\\\[.]com__-Default\\)[$]([[:space:]]|,|$)')"
pip_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+pip([[:space:]]|,|$)')"
webcam_opacity_line="$(policy_rule_line_number 'match:title[[:space:]]+WebcamOverlay([[:space:]]|,|$)')"
credential_opacity_line="$(policy_rule_line_number 'match:class[[:space:]]+\\^\\(1\\[pP\\]assword\\|Bitwarden\\|org[.]keepassxc[.]KeePassXC\\|Proton Pass\\|chrome-nngceckbapebfimnlniiiahkandclblb-Default\\)[$]([[:space:]]|,|$)')"
game_streaming_opacity_line="$(policy_rule_line_number 'match:class[[:space:]]+\\^\\(GeForceNOW\\|com[.]moonlight_stream[.]Moonlight\\)[$]([[:space:]]|,|$)')"

band_opacity_lines=(
    "$default_opacity_line"
    "$chromium_opacity_line"
    "$firefox_opacity_line"
    "$chromium_family_opacity_line"
    "$nautilus_opacity_line"
)
pin_opacity_lines=(
    "$terminal_opacity_line"
    "$zed_opacity_line"
    "$video_pwa_opacity_line"
    "$pip_opacity_line"
    "$webcam_opacity_line"
    "$credential_opacity_line"
    "$game_streaming_opacity_line"
)

check "hyprland.conf exists" test -f "$config"
check "chromium.theme exists" test -f "$repo_root/chromium.theme"
check "chromium.theme colour" file_contents_equal "$repo_root/chromium.theme" '20,26,23'
check "waybar.css window#waybar background alpha is between 0.5 and 1.0" waybar_has_blur_compatible_background "$repo_root/waybar.css"
check "mako.ini background-color is 8-digit hex with non-FF alpha" mako_has_translucent_background "$repo_root/mako.ini"
check "walker.css @define-color base alpha is between 0.5 and 1.0" walker_has_blur_compatible_base "$repo_root/walker.css"
check "alacritty.toml window opacity is below 1.0" alacritty_window_opacity_below_one "$repo_root/alacritty.toml"
check "alacritty color7/color8 slots match colors.toml" alacritty_palette_slots_match_source "$repo_root/alacritty.toml" "$repo_root/colors.toml"
check "alacritty.toml carries every template colour from colors.toml" alacritty_has_complete_palette "$repo_root/alacritty.toml" "$repo_root/colors.toml"
check "kitty.conf carries every template colour from colors.toml" kitty_has_complete_palette "$repo_root/kitty.conf" "$repo_root/colors.toml"
if [[ -f "$upstream_themed_dir/alacritty.toml.tpl" ]]; then
    check "alacritty upstream template colour pairs match the hardcoded list" template_colour_pairs_match_list alacritty "$upstream_themed_dir/alacritty.toml.tpl" alacritty_template_colour_pairs_from_file alacritty_template_colour_pairs
else
    skip "alacritty upstream template colour pairs match the hardcoded list" "upstream template unavailable at $upstream_themed_dir/alacritty.toml.tpl"
fi
if [[ -f "$upstream_themed_dir/kitty.conf.tpl" ]]; then
    check "kitty upstream template colour pairs match the hardcoded list" template_colour_pairs_match_list kitty "$upstream_themed_dir/kitty.conf.tpl" kitty_template_colour_pairs_from_file kitty_template_colour_pairs
else
    skip "kitty upstream template colour pairs match the hardcoded list" "upstream template unavailable at $upstream_themed_dir/kitty.conf.tpl"
fi
check "kitty.conf background opacity is 0.77" kitty_background_opacity_is "$repo_root/kitty.conf" 0.77
check "activeBorderColor definition" matches "$config_without_comments" '^[[:space:]]*\$activeBorderColor[[:space:]]*=[[:space:]]*rgb\([[:space:]]*62e2a4[[:space:]]*\)[[:space:]]*$'
check "general { col.active_border" equals "$(last_assignment_in_block general 'col[.]active_border')" '$activeBorderColor'
check "group { col.border_active" equals "$(last_assignment_in_block group 'col[.]border_active')" '$activeBorderColor'
check "exactly one decoration block" test "$(count_blocks decoration)" -eq 1
check "decoration { dim_inactive at last occurrence" equals "$(last_assignment_in_block decoration dim_inactive)" false
check "dim_strength is absent" does_not_match "$config_without_comments" '^[[:space:]]*dim_strength[[:space:]]*='
check "exactly one blur block" test "$(count_blocks blur)" -eq 1
check "blur { enabled at last occurrence" equals "$(last_assignment_in_block blur enabled)" true
check "blur { size at last occurrence" equals "$(last_assignment_in_block blur size)" 10
check "blur { passes at last occurrence" equals "$(last_assignment_in_block blur passes)" 3
check "blur { noise at last occurrence" equals "$(last_assignment_in_block blur noise)" 0.03
check "blur { contrast at last occurrence" equals "$(last_assignment_in_block blur contrast)" 1.45
check "blur { brightness at last occurrence" equals "$(last_assignment_in_block blur brightness)" 1.15
check "blur { vibrancy at last occurrence" equals "$(last_assignment_in_block blur vibrancy)" 0.03
check "blur { vibrancy_darkness at last occurrence" equals "$(last_assignment_in_block blur vibrancy_darkness)" 0.7
check "blur { special at last occurrence" equals "$(last_assignment_in_block blur special)" true
check "blur { xray at last occurrence" equals "$(last_assignment_in_block blur xray)" true
check "blur { ignore_opacity at last occurrence" equals "$(last_assignment_in_block blur ignore_opacity)" false
check "no active_opacity setting" does_not_match "$config_without_comments" '^[[:space:]]*active_opacity[[:space:]]*='
check "no inactive_opacity setting" does_not_match "$config_without_comments" '^[[:space:]]*inactive_opacity[[:space:]]*='
check "no fullscreen_opacity setting" does_not_match "$config_without_comments" '^[[:space:]]*fullscreen_opacity'
check "no rounding setting" does_not_match "$config_without_comments" '^[[:space:]]*rounding[[:space:]]*='
check "no flat decoration assignment" does_not_match "$config_without_comments" '^[[:space:]]*decoration:[A-Za-z_:]+[[:space:]]*='
check "no animations block" test "$(count_blocks animations)" -eq 0
check "no bare animation setting" does_not_match "$config_without_comments" '^[[:space:]]*animation[[:space:]]*='
check "no source directive" does_not_match "$config_without_comments" '^[[:space:]]*source[[:space:]]*='
check "no exec-family directive" does_not_match "$config_without_comments" '^[[:space:]]*(exec|execr|exec-once|execr-once|exec-shutdown)[[:space:]]*='
check "no rounding windowrule" does_not_match "$config_without_comments" '^[[:space:]]*windowrule(v2)?[[:space:]]*=[[:space:]]*rounding([[:space:]]|$)'
check "exact opacity windowrule allowlist" equals "$actual_policy_rules" "$expected_policy_rules"
check "exact layerrule allowlist" equals "$actual_layer_rules" "$expected_layer_rules"
check "all seven opacity pins follow all five band rules" pins_follow_band_rules
check "five credential classes have post-band exact-class opacity pins" credential_classes_have_exact_opacity_pins
if upstream_app_policies_available; then
    check "protected classes strip default-opacity upstream or have post-band exact-class pins" protected_set_has_opacity_guards
else
    skip "protected classes strip default-opacity upstream or have post-band exact-class pins" "upstream app policies unavailable at $upstream_apps_dir"
fi
check "no blanket opacity selector" no_blanket_opacity_selector
check "no default-opacity tag re-addition" no_default_opacity_readdition

if ((failures > 0)); then
    printf '%d check(s) failed\n' "$failures"
    exit 1
fi
