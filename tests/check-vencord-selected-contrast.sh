#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
theme_uri="file://$repo_root/vencord/aurora.theme.css"
fixture="$(mktemp --suffix=.html)"
trap 'rm -f "$fixture"' EXIT

printf '%s\n' \
    '<!doctype html>' \
    '<html>' \
    '<head>' \
    "<link rel=\"stylesheet\" href=\"$theme_uri\">" \
    '<style>' \
    '  #navigation { background: #0a100d; }' \
    '  #selected { padding: 4px; }' \
    '</style>' \
    '</head>' \
    '<body>' \
    '  <nav id="navigation">' \
    '    <div id="selected" class="interactiveSelected_fixture">' \
    '      <span id="label">Friends</span>' \
    '    </div>' \
    '  </nav>' \
    '  <script>' \
    '    const selected = getComputedStyle(document.querySelector("#selected"));' \
    '    const label = getComputedStyle(document.querySelector("#label"));' \
    '    document.body.dataset.selectedColor = selected.color;' \
    '    document.body.dataset.selectedBackground = selected.backgroundColor;' \
    '    document.body.dataset.labelBackground = label.backgroundColor;' \
    '  </script>' \
    '</body>' \
    '</html>' >"$fixture"

rendered="$(chromium \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --disable-background-networking \
    --allow-file-access-from-files \
    --dump-dom \
    "file://$fixture" 2>/dev/null)"

expected='data-selected-color="rgb(10, 16, 13)" data-selected-background="rgb(98, 226, 164)" data-label-background="rgba(0, 0, 0, 0)"'
if grep -Fq "$expected" <<<"$rendered"; then
    printf 'Selected navigation pairs Aurora green with dark text without painting descendants... PASS\n'
    exit 0
fi

observed="$(grep -o 'data-selected-color="[^"]*" data-selected-background="[^"]*" data-label-background="[^"]*"' <<<"$rendered" || true)"
printf 'Selected navigation pairs Aurora green with dark text without painting descendants... FAIL\n' >&2
printf 'Observed: %s\nExpected: %s\n' "${observed:-no computed-style receipt}" "$expected" >&2
exit 1
