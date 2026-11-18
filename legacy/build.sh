#!/usr/bin/env sh
# Assemble the single-file app (index.html) from its parts.
set -e
cd "$(dirname "$0")"
{ cat head.html; echo '<script>'; sed '/^if (typeof module/d' parser.js; echo '</script>'; echo '<script>'; cat app.js; echo '</script></body></html>'; } > index.html
echo "Built index.html ($(wc -c < index.html) bytes)"
