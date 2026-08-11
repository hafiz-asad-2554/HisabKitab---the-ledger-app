#!/usr/bin/env bash
# --------------------------------------------------------------
# clean-archive.sh
#   • Deletes node_modules, .git, android/build, ios/build,
#     .expo, .next, and common caches.
#   • Removes .DS_Store, Thumbs.db, .gitignore.
#   • Packs remaining files into project.zip (no extra root dir).
# --------------------------------------------------------------

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

# 1️⃣ Folders to delete
folders=(
  node_modules
  .git
  android/build
  ios/build
  .expo
  .next
  Build
  bin
  obj
)

# 2️⃣ Files to delete (recursively)
junk_patterns=(
  ".DS_Store"
  "Thumbs.db"
  ".gitignore"
)

# ---- Delete folders ----
for d in "${folders[@]}"; do
  if [[ -e "$ROOT/$d" ]]; then
    echo "Removing folder: $ROOT/$d"
    rm -rf "$ROOT/$d"
  fi
done

# ---- Delete junk files ----
for pat in "${junk_patterns[@]}"; do
  find "$ROOT" -type f -name "$pat" -exec echo "Removing file: {}" \; -exec rm -f {} +
done

# ---- Create zip ----
ZIP_PATH="$ROOT/project.zip"
[[ -f "$ZIP_PATH" ]] && rm -f "$ZIP_PATH"

# Zip the CONTENTS of ROOT (.) without adding the ROOT folder itself.
# -r = recursive, -q = quiet
zip -r -q "$ZIP_PATH" . -x "project.zip"

echo -e "\n✅ Archive created: $ZIP_PATH"
