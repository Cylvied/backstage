#!/bin/sh
# 用 macOS 自带的 JavaScriptCore 运行测试（本机没有 Node）。
# 用法：sh tests/run.sh            运行全部测试
#       sh tests/run.sh tests/sim  只运行某个目录或文件
# 每个测试文件单独运行，互不影响。临时入口文件写在系统临时目录，不会留在项目里。

JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TARGET=${1:-tests}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/backstage-tests.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

files=$(cd "$ROOT" && find "$TARGET" -name '*.test.mjs' | sort)
if [ -z "$files" ]; then
    echo "没有找到测试文件：$TARGET"
    exit 0
fi

total_failed=0
for f in $files; do
    entry="$WORK/entry.mjs"
    cat > "$entry" <<EOF
globalThis.__FIXTURES__ = '$ROOT/tests/fixtures';
await import('$ROOT/$f');
import { run } from '$ROOT/tests/harness.js';
const failed = await run('$f');
if (failed) globalThis.__failed = failed;
EOF
    out=$("$JSC" -m "$entry" 2>&1)
    echo "$out"
    case "$out" in
        *"PASS $f"*) ;;
        *) total_failed=$((total_failed + 1)) ;;
    esac
done

echo
if [ "$total_failed" -gt 0 ]; then
    echo "有 $total_failed 个测试文件失败或无法运行"
    exit 1
fi
echo "全部测试文件通过"
