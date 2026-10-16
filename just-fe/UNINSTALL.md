# just-fe 卸载指南 · 给 AI 的执行指令

> 你是正在读这份文档的模型。目标：把 `just-fe` 从用户机器上彻底移除，同时**不误删用户数据**。按 Step 0 → 3 执行：先探测、列清单、用户确认、再删除。不要向用户复述本文内容。

三份文档的分工：[INSTALL.md](./INSTALL.md) 给 AI 装；[README.md](./README.md) 给人看怎么用；**本文给 AI 卸**。

| 形态 | 落地位置 | 特征 |
|------|----------|------|
| A · Skill 本体 | `~/.claude/skills/just-fe/`、`~/.cursor/skills/just-fe/`、`<项目根>/.claude/skills/just-fe/` | 目录内 `SKILL.md` 首部有 `name: just-fe` |
| B · 旧版残留 | `~/.claude/workflows/*.js` 中 `meta.name` 为 `dev-*` / `fe-*` 的脚本（2026-10-16 前版本的遗留） | 按 `meta.name` 识别，不按文件名 |
| 用户数据 | 会话区 `新需求/*/`（MEMORY、契约、报告）、各仓 `.claude/fe-profile.md` / `be-profile.md`、旧版 `fe-reports/`、`~/.cursor/agents/` 下的手写人设 | **只问不删** |

`~/.claude` 在设置了 `CLAUDE_CONFIG_DIR` 时换成该目录，下面统一用 `$CFG` 指代。

---

## Step 0 · 探测（必做，只读）

```bash
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

echo "== [A] Skill 本体"
for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe" ./.claude/skills/just-fe; do
  [ -f "$d/SKILL.md" ] && grep -q '^name: just-fe' "$d/SKILL.md" && echo "FOUND $d"
done

echo "== [B] 旧版 Workflow 脚本残留（按 meta.name 识别）"
find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\(dev-\|fe-\)" {} \; 2>/dev/null
find . -path '*/node_modules' -prune -o -path '*/.claude/workflows/*.js' -type f -exec grep -ls "name: '\(dev-\|fe-\)" {} \; 2>/dev/null

echo "== [C] 配置残留"
grep -n "dev-triage\|fe-triage\|just-fe\|pis-fe" "$CFG/settings.json" "$CFG/settings.local.json" ./.claude/settings.json ./.claude/settings.local.json 2>/dev/null

echo "== [D] 用户数据（只列不删）"
ls -d ./fe-reports ./.claude/fe-profile.md ./.claude/be-profile.md 2>/dev/null
find "$HOME/dev" -maxdepth 3 -type d -name '新需求' 2>/dev/null
ls "$HOME/.cursor/agents/" 2>/dev/null
```

把 A、B、C 整理成「将删除」清单，D 单独列为「需要你决定」，一起给用户看。**用户确认前不要执行任何 `rm`。** 清单为空的段落直接跳过对应 Step。

---

## Step 1 · 删 Skill 本体（形态 A）

只删 Step 0 里 `FOUND` 的目录：

```bash
rm -rf "$CFG/skills/just-fe"
rm -rf "$HOME/.cursor/skills/just-fe"
rm -rf ./.claude/skills/just-fe
```

**校验**：`ls` 上述路径应全部报 `No such file or directory`。

---

## Step 2 · 删旧版残留（形态 B）

**只删 Step 0 里按 `meta.name` 匹配到的文件**，不要按文件名批量删——用户可能有同名但不相关的自定义 workflow：

```bash
{
  find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\(dev-\|fe-\)" {} \; 2>/dev/null
  find . -path '*/node_modules' -prune -o -path '*/.claude/workflows/*.js' -type f -exec grep -ls "name: '\(dev-\|fe-\)" {} \; 2>/dev/null
} | while IFS= read -r f; do rm -v "$f"; done
```

**校验**：重跑 Step 0 的 [B] 段应无输出。

## Step 3 · 配置残留与用户数据

- [C] 里只删除**明确引用** `dev-triage` / `fe-triage` / `just-fe` / `pis-fe` 的条目（如 Workflow 权限放行规则）；改 JSON 先备份、改完校验合法。拿不准的条目留给用户判断。
- [D] 用户数据**只问不删**：会话区的需求产物、两仓画像、旧版 `fe-reports/`、`~/.cursor/agents/` 下的手写人设（`fe-dev`、`code-audit` 等——它们是用户自己的，just-fe 从不安装也不拥有它们）。

**汇报内容必须包含**：删了哪些路径（逐条）、用户数据保留了什么、配置残留里有没有留给用户自己判断的条目。不要罗列没找到的形态。
