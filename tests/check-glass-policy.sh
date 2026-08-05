#!/usr/bin/env bash
set -euo pipefail

# This is a regression guard for plain-syntax drift, not a hyprlang parser; live
# hyprctl verification is authoritative. Runtime mutation via `hyprctl keyword`
# from outside this file remains undetectable. Policy detection covers a limited
# set of rule keywords. Accepted limits: variable indirection, colon-qualified
# block headers (`decoration:blur { }`), bare `tag <name>` without a +/- prefix,
# `opacityrule`, and future Hyprland syntax forms.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config="${1:-$repo_root/hyprland.conf}"
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

pins_follow_group_opacity_rules() {
    [[ "$default_opacity_line" =~ ^[0-9]+$ &&
       "$terminal_opacity_line" =~ ^[0-9]+$ &&
       "$chromium_opacity_line" =~ ^[0-9]+$ &&
       "$firefox_opacity_line" =~ ^[0-9]+$ &&
       "$pip_opacity_line" =~ ^[0-9]+$ &&
       "$webcam_opacity_line" =~ ^[0-9]+$ ]] &&
        ((pip_opacity_line > default_opacity_line &&
          pip_opacity_line > terminal_opacity_line &&
          pip_opacity_line > chromium_opacity_line &&
          pip_opacity_line > firefox_opacity_line &&
          webcam_opacity_line > default_opacity_line &&
          webcam_opacity_line > terminal_opacity_line &&
          webcam_opacity_line > chromium_opacity_line &&
          webcam_opacity_line > firefox_opacity_line))
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
    'windowrule = opacity 0.96 0.90, match:tag default-opacity'
    'windowrule = opacity 0.96 0.90, match:tag terminal'
    'windowrule = opacity 0.98 0.94, match:tag chromium-based-browser'
    'windowrule = opacity 0.98 0.94, match:tag firefox-based-browser'
    'windowrule = opacity 1 1, match:tag pip'
    'windowrule = opacity 1 1, match:title WebcamOverlay'
    'windowrule = no_dim on, match:tag pip'
    'windowrule = no_dim on, match:class steam.*'
    'windowrule = no_dim on, match:class ^(zoom|vlc|mpv|org.kde.kdenlive|com.obsproject.Studio|com.github.PintaProject.Pinta|imv|org.gnome.NautilusPreviewer)$'
    'windowrule = no_dim on, match:class (chrome-youtube.com__-Default|chrome-app.zoom.us__wc_home-Default)'
    'windowrule = no_dim on, match:class (com.libretro.RetroArch|qemu)'
    'windowrule = no_dim on, match:class (GeForceNOW|com.moonlight_stream.Moonlight)'
)

expected_policy_rules="$(printf '%s\n' "${expected_policy_rule_lines[@]}" | normalize_rule_lines | LC_ALL=C sort)"
actual_policy_rules="$(extract_policy_rules <<<"$config_contents" | normalize_rule_lines | LC_ALL=C sort)"

default_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+default-opacity([[:space:]]|,|$)')"
terminal_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+terminal([[:space:]]|,|$)')"
chromium_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+chromium-based-browser([[:space:]]|,|$)')"
firefox_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+firefox-based-browser([[:space:]]|,|$)')"
pip_opacity_line="$(policy_rule_line_number 'match:tag[[:space:]]+pip([[:space:]]|,|$)')"
webcam_opacity_line="$(policy_rule_line_number 'match:title[[:space:]]+WebcamOverlay([[:space:]]|,|$)')"

check "hyprland.conf exists" test -f "$config"
check "activeBorderColor definition" matches "$config_without_comments" '^[[:space:]]*\$activeBorderColor[[:space:]]*=[[:space:]]*rgb\([[:space:]]*62e2a4[[:space:]]*\)[[:space:]]*$'
check "general { col.active_border" equals "$(last_assignment_in_block general 'col[.]active_border')" '$activeBorderColor'
check "group { col.border_active" equals "$(last_assignment_in_block group 'col[.]border_active')" '$activeBorderColor'
check "exactly one decoration block" test "$(count_blocks decoration)" -eq 1
check "decoration { dim_inactive at last occurrence" equals "$(last_assignment_in_block decoration dim_inactive)" true
check "decoration { dim_strength at last occurrence" equals "$(last_assignment_in_block decoration dim_strength)" 0.15
check "exactly one blur block" test "$(count_blocks blur)" -eq 1
check "blur { enabled at last occurrence" equals "$(last_assignment_in_block blur enabled)" true
check "blur { size at last occurrence" equals "$(last_assignment_in_block blur size)" 8
check "blur { passes at last occurrence" equals "$(last_assignment_in_block blur passes)" 3
check "blur { noise at last occurrence" equals "$(last_assignment_in_block blur noise)" 0.03
check "blur { contrast at last occurrence" equals "$(last_assignment_in_block blur contrast)" 0.87
check "blur { brightness at last occurrence" equals "$(last_assignment_in_block blur brightness)" 0.55
check "blur { vibrancy at last occurrence" equals "$(last_assignment_in_block blur vibrancy)" 0.03
check "blur { vibrancy_darkness at last occurrence" equals "$(last_assignment_in_block blur vibrancy_darkness)" 0.7
check "blur { special at last occurrence" equals "$(last_assignment_in_block blur special)" true
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
check "exact opacity/no_dim/dim windowrule allowlist" equals "$actual_policy_rules" "$expected_policy_rules"
check "PiP and WebcamOverlay opacity pins follow all group opacity rules" pins_follow_group_opacity_rules
check "no blanket opacity selector" no_blanket_opacity_selector
check "no default-opacity tag re-addition" no_default_opacity_readdition

if ((failures > 0)); then
    printf '%d check(s) failed\n' "$failures"
    exit 1
fi
