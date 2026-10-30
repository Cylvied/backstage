#!/bin/sh
# 把「幕后」安装（或更新）到本机 TauriTavern 的扩展目录。
# 只复制运行需要的文件：manifest.json、index.js、style.css、src/。
# 用法：sh scripts/install.sh
# 装好后在 TauriTavern 里刷新页面（或重启应用）即可。

set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TARGET="$HOME/Library/Application Support/com.tauritavern.client/data/default-user/extensions/backstage"

if [ ! -d "$(dirname "$TARGET")" ]; then
    echo "找不到 TauriTavern 的扩展目录：$(dirname "$TARGET")"
    exit 1
fi

mkdir -p "$TARGET"
# 先清掉旧版本的代码文件，避免删除过的文件残留
rm -rf "$TARGET/src"
cp "$ROOT/manifest.json" "$ROOT/index.js" "$ROOT/style.css" "$TARGET/"
cp -R "$ROOT/src" "$TARGET/src"

echo "已安装到：$TARGET"
echo "版本：$(grep '"version"' "$ROOT/manifest.json" | head -1 | tr -d ' ,')"
