#!/usr/bin/env bash
# 越界改动检测：实际改动文件 − 需求涉及文件 − 开工前已有的改动 = 越界文件
#
#   tools/out-of-scope.sh <repoPath> <base> <requirementFiles> [<baselineFiles>]
#     requirementFiles：一个文件路径（每行一个需求涉及文件），或 "-" 从 stdin 读
#     baselineFiles（可选）：④ 开工前记录的已有改动清单（git status --porcelain 的输出或每行一个路径）；
#                            其中的文件属于用户原有改动，归入 preexisting，不判越界
#
#   输出 JSON 到 stdout：{ "repo", "base", "baseRef", "changed": [...], "requirementFiles": [...], "preexisting": [...], "outOfScope": [...] }
#   退出码：有越界文件 → 1；否则 0
#
# 改动范围 = 已提交（baseRef...HEAD）∪ 工作区未提交（含未跟踪），因为开发 agent 不 commit。
# baseRef 优先用本地分支 <base>，本地没有时用 origin/<base>；两者都没有时只统计工作区改动，并在 stderr 告警。
# 需求涉及文件支持目录前缀匹配：清单里写 src/views/points/ 则其下所有文件都算在范围内。
set -euo pipefail

repo="${1:?用法: out-of-scope.sh <repoPath> <base> <requirementFiles|-> [<baselineFiles>]}"
base="${2:?缺 base 分支}"
req="${3:?缺 requirementFiles（文件路径或 -）}"
baseline_file="${4:-}"

cd "$repo"

if [ "$req" = "-" ]; then
  req_list=$(cat)
else
  req_list=$(cat "$req")
fi

baseline_list=""
if [ -n "$baseline_file" ] && [ -f "$baseline_file" ]; then
  # 兼容 git status --porcelain 格式（前 3 个字符是状态位）与纯路径
  baseline_list=$(sed -E 's/^[ MADRCU?!]{2} //; s/^.* -> //' "$baseline_file" | sed '/^$/d')
fi

# core.quotepath=false：中文路径按原样输出，不转成八进制转义
G="git -c core.quotepath=false"

base_ref=""
if $G rev-parse --verify -q "${base}^{commit}" >/dev/null 2>&1; then
  base_ref="$base"
elif $G rev-parse --verify -q "origin/${base}^{commit}" >/dev/null 2>&1; then
  base_ref="origin/$base"
else
  echo "⚠️ 找不到 ${base} 或 origin/${base}，只统计工作区未提交的改动（已提交的越界文件不会被检出）" >&2
fi

# 实际改动：已提交 + 未暂存 + 已暂存 + 未跟踪
changed=$( {
  if [ -n "$base_ref" ]; then $G diff --name-only "$base_ref"...HEAD 2>/dev/null || true; fi
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

in_list() {
  # $1 = 文件，$2 = 换行分隔的清单（支持以 / 结尾的目录前缀）
  local f="$1" r
  while IFS= read -r r; do
    [ -z "$r" ] && continue
    r="${r#./}"
    if [ "$f" = "$r" ]; then return 0; fi
    case "$r" in
      */) case "$f" in "$r"*) return 0;; esac ;;
    esac
  done <<< "$2"
  return 1
}

out_of_scope=""
preexisting=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if in_list "$f" "$req_list"; then continue; fi
  if [ -n "$baseline_list" ] && in_list "$f" "$baseline_list"; then preexisting+="$f"$'\n'; continue; fi
  out_of_scope+="$f"$'\n'
done <<< "$changed"

printf '{\n  "repo": "%s",\n  "base": "%s",\n  "baseRef": %s,\n  "changed": %s,\n  "requirementFiles": %s,\n  "preexisting": %s,\n  "outOfScope": %s\n}\n' \
  "$(pwd | sed 's/"/\\"/g')" "$base" \
  "$( [ -n "$base_ref" ] && printf '"%s"' "$base_ref" || printf 'null' )" \
  "$(printf '%s\n' "$changed" | json_array)" \
  "$(printf '%s\n' "$req_list" | sed '/^$/d' | json_array)" \
  "$(printf '%s' "$preexisting" | json_array)" \
  "$(printf '%s' "$out_of_scope" | json_array)"

if [ -n "$out_of_scope" ]; then exit 1; fi
