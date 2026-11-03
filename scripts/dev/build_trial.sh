#!/bin/zsh
# 試験版を見本ビルド(:4175 の preview は dist を配る)
export PATH=$HOME/.local/node20/bin:$PATH
R="/Users/masabou/Library/CloudStorage/GoogleDrive-honbu@ones-style.co.jp/マイドライブ/Claude"; S=/private/tmp/claude-502/-Users-masabou/fa482dc7-6256-4b2b-92db-cbf4767db5bd/scratchpad; B=$S/buildenv2
EX=(--exclude node_modules --exclude 'dist*' --exclude .git --exclude scripts --exclude docs --exclude pw4175.config.js --exclude chk --exclude restore)
rsync -a "${EX[@]}" "$R/" "$B/" || exit 1
mkdir -p $B/chk; for f in "$@"; do cp "$R/scripts/$f" $B/chk/; done
cd $B && VITE_E2E_DEMO=1 ./node_modules/.bin/vite build 2>&1 | tail -3
