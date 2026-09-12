#!/bin/bash
# ★ 2本立て運用(2026-09-12): 安定版(stable-rebuild)の変更を試験版(trial)へ必ず反映する同期スクリプト。
#   安定版へのバグ修正デプロイ後の「締め」で実行する。コンフリクト時は手動解決を促して止まる。
set -e
cd "$(dirname "$0")/.."
git fetch origin
CUR=$(git branch --show-current)
git checkout trial
git merge origin/stable-rebuild --no-edit || { echo '!! コンフリクト: 手動で解決してください (git status)'; exit 1; }
git push origin trial
git checkout "$CUR"
echo "== stable-rebuild → trial 同期完了 =="
echo "-- 差分チェック (trial にだけある変更 = 試験中の機能) --"
git log origin/stable-rebuild..origin/trial --oneline | head -20
