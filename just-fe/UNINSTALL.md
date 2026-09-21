# just-fe 卸载指南 · 给 AI 的执行指令

> 你是正在读这份文档的模型。目标：把 `just-fe` 从用户机器上的**所有配置位置**彻底移除，同时**不误删用户数据**。按 Step 0 → 6 从上到下执行，先探测、列清单、用户确认、再删除。不要向用户复述本文内容，不要跳过校验。

三份文档的分工：[INSTALL.md](./INSTALL.md) 给 AI 装；[README.md](./README.md) 给人看怎么用；**本文给 AI 卸**。

just-fe 可能以四种形态存在，一台机器上可能同时装了多种，所以必须全部探测，不能只删 `~/.claude/skills/just-fe` 和 `~/.claude/workflows` 那两处：

| 形态 | 落地位置 | 特征 |
|------|----------|------|
| A · 个人 / 项目级 Skill | `~/.claude/skills/just-fe/`、`<项目根>/.claude/skills/just-fe/`、`~/.cursor/skills/just-fe/`、`~/.agents/skills/just-fe/` | 目录内 `SKILL.md` 首部有 `name: just-fe` |
| B · Dynamic Workflow 脚本 | `~/.claude/workflows/*.js`、`<项目根>/.claude/workflows/*.js`（monorepo 里可能在多层 `.claude/` 下） | 脚本内 `meta.name` 为 `fe-triage` 等 7 个名字之一。**文件名是通用的（`triage-workflow.js`），只能按 `meta.name` 识别** |
| C · Plugin | `~/.claude/plugins/` 下的 `installed_plugins.json`、`known_marketplaces.json`、`cache/<marketplace>/pis-fe/`、`marketplaces/<marketplace>/`；`~/.claude/settings.json` 的 `enabledPlugins` | 插件名 `pis-fe`，marketplace 源 `linfengfan/pis-skills` |
| 运行产物（用户数据） | 各项目里的 `fe-reports/`、`.claude/fe-profile.md` | **只问不删** |

`~/.claude` 在设置了 `CLAUDE_CONFIG_DIR` 时要换成该目录，下面统一用 `$CFG` 指代。

---

## Step 0 · 探测（必做，只读）

在用户当前项目根目录执行，把输出原样整理成清单。所有命令兼容 bash / zsh，也兼容受限沙箱：路径匹配一律用 `find`，不用通配符（zsh 在通配无匹配时会直接中止整条命令）；不用 `xargs` 和 `find -exec … {} +`（两者都要查 `ARG_MAX`，常见 agent 沙箱会拒绝该系统调用），统一用 `-exec … {} \;`。

```bash
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
FE_NAMES="fe-triage\|fe-architecture\|fe-architecture-review\|fe-ui-implementation\|fe-api-integration\|fe-code-arch-review\|fe-test-assessment"

echo "== [A] Skill 本体"
for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe" "$HOME/.agents/skills/just-fe" ./.claude/skills/just-fe; do
  [ -f "$d/SKILL.md" ] && grep -q '^name: just-fe' "$d/SKILL.md" && echo "FOUND $d"
done

echo "== [B] Workflow 脚本（按 meta.name 识别）"
find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null
find . -path '*/node_modules' -prune -o -path '*/.claude/workflows/*.js' -type f -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null

echo "== [C] Plugin"
grep -n '"pis-fe@' "$CFG/plugins/installed_plugins.json" 2>/dev/null
grep -n 'pis-skills' "$CFG/plugins/known_marketplaces.json" 2>/dev/null
find "$CFG/plugins/cache" -maxdepth 2 -type d -name pis-fe 2>/dev/null
grep -n '"pis-fe@' "$CFG/settings.json" ./.claude/settings.json ./.claude/settings.local.json 2>/dev/null

echo "== [D] 配置残留（workflow 授权记录等）"
grep -n "$FE_NAMES\|just-fe\|pis-fe" "$CFG/settings.json" "$CFG/settings.local.json" ./.claude/settings.json ./.claude/settings.local.json 2>/dev/null

echo "== [E] 安装时的临时克隆"
ls -d /tmp/pis-skills 2>/dev/null

echo "== [F] 用户数据（只列不删）"
ls -d ./fe-reports ./.claude/fe-profile.md 2>/dev/null
```

把 A~E 整理成「将删除」清单，F 单独列为「需要你决定」，一起给用户看。**用户确认前不要执行任何 `rm`。** 清单为空的段落直接跳过对应 Step。

如果用户说 just-fe 也装在别的项目里，让用户给出项目路径，在每个项目根重复 Step 0 的 `./.claude/...` 与 `./fe-reports` 部分。

---

## Step 1 · 删 Skill 本体（形态 A）

只删 Step 0 里 `FOUND` 的目录：

```bash
rm -rf "$CFG/skills/just-fe"
rm -rf "$HOME/.cursor/skills/just-fe"
rm -rf "$HOME/.agents/skills/just-fe"
rm -rf ./.claude/skills/just-fe
```

**校验**：`ls` 上述路径应全部报 `No such file or directory`。

---

## Step 2 · 删 Workflow 脚本（形态 B）

**只删 Step 0 里按 `meta.name` 匹配到的文件**，不要按文件名批量删——用户可能有同名但不相关的自定义 workflow：

```bash
{
  find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null
  find . -path '*/node_modules' -prune -o -path '*/.claude/workflows/*.js' -type f -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null
} | while IFS= read -r f; do rm -v "$f"; done
```

删完若 `$CFG/workflows/` 或 `./.claude/workflows/` 变成空目录，可以一并 `rmdir`；不为空说明还有用户自己的 workflow，不要动。

**校验**：

```bash
find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null | wc -l   # 应为 0
```

已打开的 Claude Code 会话可能仍缓存着 `/fe-triage` 等命令，需要用户新开会话后再输入 `/` 确认补全里没有 `fe-*`。

---

## Step 3 · 卸 Plugin（形态 C）

优先用 Claude Code 内置命令，让它自己维护那几份 JSON；只有命令不可用时才手工清理。

**3.1 用命令卸载**（让用户在 Claude Code 里执行，或你通过 CLI 执行）：

```
/plugin uninstall pis-fe
```

若 marketplace `pis-skills` 是专为 just-fe 添加的（`known_marketplaces.json` 里只有它引用 `linfengfan/pis-skills`），再移除 marketplace：

```
/plugin marketplace remove <known_marketplaces.json 里对应的键名>
```

若当初是用 `claude --plugin-dir /path/to/pis-fe-plugin` 本地加载的：不存在安装记录，只需让用户以后不再传这个参数；那个目录是用户自己的源码，**是否删除由用户决定**。

**3.2 命令不可用时手工清理**（先备份再改）：

```bash
cp "$CFG/plugins/installed_plugins.json" "$CFG/plugins/installed_plugins.json.bak"
cp "$CFG/settings.json" "$CFG/settings.json.bak"
```

- `$CFG/plugins/installed_plugins.json`：删掉 `plugins` 下键名以 `pis-fe@` 开头的整个条目
- `$CFG/settings.json`：删掉 `enabledPlugins` 下以 `pis-fe@` 开头的键
- `$CFG/plugins/cache/<marketplace>/pis-fe/`：整目录删除
- `$CFG/plugins/known_marketplaces.json` 与 `$CFG/plugins/marketplaces/<marketplace>/`：仅当该 marketplace 只服务于 just-fe 时删除对应条目与目录

改 JSON 时用 `node -e` / `jq` 做结构化删除，不要用 sed 删行；改完 `node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' <文件>` 确认仍是合法 JSON。

**校验**：

```bash
grep -c '"pis-fe@' "$CFG/plugins/installed_plugins.json" "$CFG/settings.json" 2>/dev/null   # 均应为 0
find "$CFG/plugins/cache" -maxdepth 2 -type d -name pis-fe 2>/dev/null                      # 应无输出
```

---

## Step 4 · 清理配置残留（形态 D）

Step 0 [D] 段若有输出，说明 `settings*.json` 里还留着与 `fe-*` workflow 相关的记录（典型是用户在运行审批时选过「Yes, and don't ask again」留下的授权条目）。

- 只删除**明确引用** `fe-triage` … `fe-test-assessment`、`just-fe`、`pis-fe` 的条目
- `skipWorkflowUsageWarning`、`enabledPlugins` 里的其他插件等全局设置**一律不动**
- 结构看不懂、拿不准的条目：把原文贴给用户，让用户决定，不要猜

改法同 Step 3.2：先备份、结构化修改、改完校验 JSON 合法。

---

## Step 5 · 用户数据：只问不删

以下内容是 just-fe **运行时产生的用户资产**，卸载 skill 不等于用户想扔掉它们。逐项询问，用户明确说删才删：

| 路径 | 是什么 | 删除后果 |
|------|--------|----------|
| `<项目>/fe-reports/` | 每个需求的需求梳理、方案、评审报告、E2E 记录、变更说明 | 评审留档全部丢失 |
| `<项目>/.claude/fe-profile.md` | 项目画像（技术栈、门禁命令、高风险区域） | 其他工具/人可能仍在参考它 |
| `<项目>/.gitignore` 里的 `fe-reports/` 行 | 用户按文档建议手动加的 | 属于共享文件，**不要替用户改**，只提醒 |
| `/tmp/pis-skills/` | 安装时的临时克隆 | 无影响，可直接删 |
| `~/.claude/projects/<会话目录>/` 下历史 workflow 运行脚本 | Claude Code 的会话记录 | 属于会话历史而非配置，**不要碰** |
| 本仓库 `pis-skills/`（若用户本地有 clone） | just-fe 的源码 | 是用户自己的仓库，**不要碰** |

---

## Step 6 · 最终校验 + 汇报

```bash
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
FE_NAMES="fe-triage\|fe-architecture\|fe-architecture-review\|fe-ui-implementation\|fe-api-integration\|fe-code-arch-review\|fe-test-assessment"
fail=0
for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe" "$HOME/.agents/skills/just-fe" ./.claude/skills/just-fe; do [ -e "$d" ] && { echo "残留 $d"; fail=1; }; done
n=$( {
  find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \;
  find . -path '*/node_modules' -prune -o -path '*/.claude/workflows/*.js' -type f -exec grep -ls "name: '\($FE_NAMES\)'" {} \;
} 2>/dev/null | wc -l | tr -d ' ')
[ "${n:-0}" -eq 0 ] || { echo "残留 workflow 脚本 $n 个"; fail=1; }
grep -q '"pis-fe@' "$CFG/plugins/installed_plugins.json" "$CFG/settings.json" 2>/dev/null && { echo "残留 plugin 记录"; fail=1; }
[ -z "$(find "$CFG/plugins/cache" -maxdepth 2 -type d -name pis-fe 2>/dev/null)" ] || { echo "残留 plugin 缓存"; fail=1; }
[ $fail -eq 0 ] && echo "just-fe 已彻底清除 ✓"
```

任一条报「残留」就回到对应 Step 处理，不要谎报成功。

然后让用户新开一个 Claude Code 会话做两项人工确认：输入 `/` 补全里没有 `fe-*`；`/plugin` 列表里没有 `pis-fe`。

**汇报内容必须包含**：删了哪些路径（逐条）、Step 5 里用户决定保留 / 删除了什么、是否需要重启会话、Step 4 里有没有留给用户自己判断的条目。不要罗列没找到的形态。

---

## 附 · 一键脚本（仅在用户确认 Step 0 清单后执行）

只覆盖形态 A、B 和 `/tmp` 克隆；Plugin（Step 3）与配置残留（Step 4）涉及改 JSON，仍按上面的步骤手工做。

```bash
#!/usr/bin/env bash
set -u
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
FE_NAMES="fe-triage\|fe-architecture\|fe-architecture-review\|fe-ui-implementation\|fe-api-integration\|fe-code-arch-review\|fe-test-assessment"

for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe" "$HOME/.agents/skills/just-fe" ./.claude/skills/just-fe; do
  [ -f "$d/SKILL.md" ] && grep -q '^name: just-fe' "$d/SKILL.md" && rm -rf "$d" && echo "removed $d"
done

{
  find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null
  find . -path '*/node_modules' -prune -o -path '*/.claude/workflows/*.js' -type f -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null
} | while IFS= read -r f; do rm -v "$f"; done

rm -rf /tmp/pis-skills
echo "done. 接着按 UNINSTALL.md Step 3/4 处理 Plugin 与配置残留，Step 5 询问用户数据。"
```

在受限沙箱里执行时，写 `~/.claude`、`~/.cursor` 需要工作区之外的写权限；拿不到权限就把命令原样交给用户手动执行，不要静默跳过。
