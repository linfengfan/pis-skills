# just-flf 安装 · 给 AI 的执行指令

> 你是正在读这份文档的模型。目标：把 `just-flf/` 整个目录装进用户的 skills 目录。没有构建、没有依赖安装。按 Step 0 → 3 执行，每步校验，不谎报成功。

## Step 0 · 探测（只读）

```bash
echo "== Node（需要 ≥ 18）"; node --version 2>/dev/null || echo "node 不在 PATH"
echo "== git"; git --version 2>/dev/null || echo "git 不在 PATH"
for d in "$HOME/.cursor/skills" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"; do
  [ -d "$(dirname "$d")" ] && echo "目标可用：$d"
  [ -f "$d/just-flf/SKILL.md" ] && echo "已安装：$d/just-flf"
  [ -f "$d/just-fe/SKILL.md" ] && echo "旧版 just-fe：$d/just-fe"
done
```

确定源目录 `SRC`：本文件所在的 `just-flf/` 的绝对路径。

Node 低于 18 或不存在：停下告诉用户，工具脚本无法运行。

## Step 1 · 复制

对 Step 0 里每个「目标可用」的 skills 目录执行（`~/.cursor` 存在就装 Cursor，`~/.claude` 存在就装 Claude Code）：

```bash
DEST="<skills 目录>/just-flf"
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
```

在沙箱里写用户主目录可能需要额外权限；拿不到就把命令原样交给用户执行，不要静默跳过。

## Step 2 · 校验

```bash
for DEST in "$HOME/.cursor/skills/just-flf" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/just-flf"; do
  [ -d "$DEST" ] || continue
  grep -q '^name: just-flf' "$DEST/SKILL.md" \
    && [ "$(ls "$DEST"/stages/*.md | wc -l | tr -d ' ')" = "8" ] \
    && [ "$(ls "$DEST"/roles/*.md | wc -l | tr -d ' ')" = "10" ] \
    && [ "$(ls "$DEST"/checklists/*.md | wc -l | tr -d ' ')" = "5" ] \
    && node "$DEST/tools/state.js" --help >/dev/null \
    && node "$DEST/tools/workspace.js" --help >/dev/null \
    && node "$DEST/tools/scope.js" --help >/dev/null \
    && node "$DEST/tools/conformance.js" --help >/dev/null \
    && echo "OK $DEST" || echo "FAIL $DEST"
done
```

任一 `FAIL` 就停下报告。

## Step 3 · 旧版 just-fe 与汇报

Step 0 发现旧版 `just-fe` 时，把它的路径列给用户，**问用户是否删除**；用户同意后才执行 `rm -rf <路径>`。旧版的产物（会话区里的报告、各仓 `.claude/*-profile.md`）不在安装范围内，不动。

汇报内容：

1. 装到了哪些路径。
2. 怎么开始：「用 just-flf 走一遍：<需求>」；继续上次的需求说「just-flf 继续」。
3. 第一次使用时会问：需求处理范式文件在哪（可以没有）、缺画像的仓会先生成画像请用户确认。
4. 流程不执行任何 git 写操作，提交由用户决定。
