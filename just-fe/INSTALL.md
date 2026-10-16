# just-fe 安装指南 · 给 AI 的执行指令

> 你是正在读这份文档的模型。目标：把 `just-fe` 装进用户的环境——整个目录复制到 skills 目录即可，没有脚本注册、没有构建、没有子 agent 安装。已经装过就升级到当前版本。按 Step 0 → 3 执行，每步校验，不谎报成功，不要向用户复述本文内容。

三份文档的分工：**本文给 AI 装**；[README.md](./README.md) 给人看怎么用；[UNINSTALL.md](./UNINSTALL.md) 给 AI 卸。

---

## 装什么、装到哪

| 形态 | 落地位置 | 何时装 |
|------|----------|--------|
| A · Claude Skill | `~/.claude/skills/just-fe/`（整个 `just-fe/` 目录） | **总是装** |
| Cursor 变体 | `~/.cursor/skills/just-fe/` | 检测到 `~/.cursor` 时一并装 |
| 项目级变体 | `<项目根>/.claude/skills/just-fe/` | 用户明确说「只装到当前项目」 |

`~/.claude` 在用户设置了 `CLAUDE_CONFIG_DIR` 时换成该目录，下面统一用 `$CFG` 指代。

本 Skill 是纯 Markdown + 3 个确定性工具，**不做**：Workflow 脚本注册（脚本层已删除）、子 agent 安装（你的 `~/.cursor/agents/` 是你自己的，不动）、构建（没有生成物）。

---

## Step 0 · 探测（只读）

```bash
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

echo "== Node（tools 需要 ≥ 18）"; node --version 2>/dev/null || echo "node 不在 PATH"
echo "== Cursor"; [ -d "$HOME/.cursor" ] && echo "存在 ~/.cursor" || echo "无"
echo "== 已装 Skill"; for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe" ./.claude/skills/just-fe; do [ -f "$d/SKILL.md" ] && echo "已装 $d"; done
echo "== 旧版残留（脚本与生成物时代的产物）"
find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\(dev-\|fe-\)" {} \; 2>/dev/null
for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe"; do
  [ -d "$d/scripts" ] && echo "旧版脚本目录: $d/scripts"
  [ -d "$d/src" ] && echo "旧版 src 目录: $d/src"
  [ -f "$d/build.js" ] && echo "旧版 build.js: $d/build.js"
done
```

**确定源目录 `$SRC`**：本文件已在本地磁盘上 → 用它所在的 `just-fe/` 绝对路径；否则远程取源：

```bash
git clone --depth 1 https://github.com/linfengfan/pis-skills.git /tmp/pis-skills
SRC=/tmp/pis-skills/just-fe
```

**旧版残留处理**：探测到的 `~/.claude/workflows/` 里 `meta.name` 为 `dev-*` / `fe-*` 的脚本、Skill 目录里的 `scripts/` / `src/` / `build.js` / `agents/` / `tests/`，是 2026-10-16 之前版本的产物，随 Step 1 的 `rm -rf` + 复制自然清掉；`~/.claude/workflows/` 里的旧脚本要单独删：

```bash
find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\(dev-\|fe-\)" {} \; 2>/dev/null \
  | while IFS= read -r f; do rm -v "$f"; done
```

在沙箱里写 `~/.claude`、`~/.cursor` 需要工作区之外的写权限，拿不到就把命令原样交给用户手动执行，不要静默跳过。

---

## Step 1 · 复制

```bash
mkdir -p "$CFG/skills"
rm -rf "$CFG/skills/just-fe"
cp -R "$SRC" "$CFG/skills/just-fe"

# Cursor 变体（检测到 ~/.cursor 时）
[ -d "$HOME/.cursor" ] && {
  mkdir -p "$HOME/.cursor/skills"
  rm -rf "$HOME/.cursor/skills/just-fe"
  cp -R "$SRC" "$HOME/.cursor/skills/just-fe"
}
```

项目级变体：目标换成 `./.claude/skills/just-fe`，其余相同。

**校验（必做）**：

```bash
for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe"; do
  [ -d "$d" ] || continue
  grep -q '^name: just-fe' "$d/SKILL.md" \
    && [ "$(ls "$d"/stages/*.md 2>/dev/null | wc -l | tr -d ' ')" = "9" ] \
    && [ -f "$d/roles/fe-dev.md" ] \
    && [ -f "$d/tools/contract-conformance.js" ] && [ -f "$d/tools/out-of-scope.sh" ] && [ -f "$d/tools/workspace-detect.js" ] \
    && [ -f "$d/references/评分口径.md" ] \
    && echo "OK $d" || echo "FAIL $d"
done
chmod +x "$CFG/skills/just-fe/tools/"*.sh "$CFG/skills/just-fe/tools/"*.js "$HOME/.cursor/skills/just-fe/tools/"*.sh "$HOME/.cursor/skills/just-fe/tools/"*.js 2>/dev/null
# tools 冒烟（只读，不打网络）
node "$CFG/skills/just-fe/tools/contract-conformance.js" --help >/dev/null && echo "tools OK"
```

任一条 `FAIL` 就停下来报错，不要继续。

---

## Step 2 · 升级已安装版本

Step 0 发现已装过时走这里，而不是重复 Step 1：

```bash
diff -rq "$SRC" "$CFG/skills/just-fe" 2>&1 | grep -v '\.git' | head -20
```

有差异就用 Step 0 的旧版残留清理 + Step 1 的命令原样覆盖（`rm -rf` + `cp -R` 本身就是升级），Cursor 变体同样处理。

**升级不碰用户数据**：会话区里的 `新需求/*/`、各仓 `.claude/fe-profile.md` / `be-profile.md`、旧版 `fe-reports/` 都是运行产物，不在安装范围内。旧版 `MEMORY.md` 缺 `repos[] / report_dir / contract_version` 等字段，续接时由编排方按 ⓪ 补齐，不用迁移。`~/.cursor/agents/` 下的手写人设（`fe-dev`、`code-audit` 等）是用户自己的，不动。

---

## Step 3 · 汇报

**汇报内容必须包含**（不要罗列没装的东西）：

1. 装了哪些形态、各自的落地路径；旧版残留（`dev-*` / `fe-*` 脚本、`scripts/`、`src/`、`build.js`）是否已清
2. 怎么开始用：指向 README §2，给用户起手话——`用 just-fe 走一遍：<需求>`；提醒第一步是 ⓪ 工作区确认，会问「后端仓可写还是只读」
3. 用户还需自己做的事：首次跑会生成 fe-profile / be-profile；部署与提交由用户执行
4. 限制：尚未端到端跑过完整 fullstack 流程；打分是模型判断，确定性检查交给 `tools/`
