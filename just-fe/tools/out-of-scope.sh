#!/usr/bin/env bash
# 越界改动检测：实际改动文件 − 需求涉及文件 = 越界文件
#
#   tools/out-of-scope.sh <repoPath> <base> <requirementFiles>
#     requirementFiles：一个文件路径（每行一个需求涉及文件），或 "-" 从 stdin 读
#
#   输出 JSON 到 stdout：{ "repo", "base", "changed": [...], "requirementFiles": [...], "outOfScope": [...] }
#   退出码：有越界文件 → 1；否则 0
#
# 改动范围 = 已提交（base...HEAD）∪ 工作区未提交（含未跟踪），因为开发 agent 不 commit。
# 需求涉及文件支持目录前缀匹配：清单里写 src/views/points/ 则其下所有文件都算在范围内。
set -euo pipefail

repo="${1:?用法: out-of-scope.sh <repoPath> <base> <requirementFiles|->}"
base="${2:?缺 base 分支}"
req="${3:?缺 requirementFiles（文件路径或 -）}"

cd "$repo"

if [ "$req" = "-" ]; then
  req_list=$(cat)
else
  req_list=$(cat "$req")
fi

# 实际改动：已提交 + 未暂存 + 已暂存 + 未跟踪
# core.quotepath=false：中文路径按原样输出，不转成八进制转义
G="git -c core.quotepath=false"
changed=$( {
  $G diff --name-only "$base"...HEAD 2>/dev/null || true
  $G diff --name-only 2>/dev/null || true
  $G diff --name-only --cached 2>/dev/null || true
  $G ls-files --others --exclude-standard 2>/dev/null || true
} | sed '/^$/d' | sort -u )

json_array() {
  # 把换行分隔的列表转成 JSON 数组
  local first=1
  printf '['
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    esc=$(printf '%s' "$line" | sed 's/\\/\\\\/g; s/"/\\"/g')
    if [ $first -eq 1 ]; then first=0; else printf ','; fi
    printf '"%s"' "$esc"
  done
  printf ']'
}

out_of_scope=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  hit=0
  while IFS= read -r r; do
    [ -z "$r" ] && continue
    r="${r#./}"
    if [ "$f" = "$r" ]; then hit=1; break; fi
    case "$r" in
      */) case "$f" in "$r"*) hit=1; break;; esac ;;
    esac
  done <<< "$req_list"
  if [ $hit -eq 0 ]; then out_of_scope+="$f"$'\n'; fi
done <<< "$changed"

printf '{\n  "repo": "%s",\n  "base": "%s",\n  "changed": %s,\n  "requirementFiles": %s,\n  "outOfScope": %s\n}\n' \
  "$(pwd | sed 's/"/\\"/g')" "$base" \
  "$(printf '%s\n' "$changed" | json_array)" \
  "$(printf '%s\n' "$req_list" | sed '/^$/d' | json_array)" \
  "$(printf '%s' "$out_of_scope" | json_array)"

if [ -n "$out_of_scope" ]; then exit 1; fi
