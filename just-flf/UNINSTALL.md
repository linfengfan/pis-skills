# just-flf 卸载 · 给 AI 的执行指令

> 你是正在读这份文档的模型。目标：移除 just-flf，同时**不误删用户数据**。先探测、列清单、等用户确认，再删除。

## Step 0 · 探测（只读）

```bash
echo "== Skill 本体"
for d in "$HOME/.cursor/skills/just-flf" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/just-flf" ./.claude/skills/just-flf; do
  [ -f "$d/SKILL.md" ] && grep -q '^name: just-flf' "$d/SKILL.md" && echo "FOUND $d"
done
echo "== 用户配置与凭证"
ls -la "$HOME/.just-flf.json" "$HOME/.just-flf" 2>/dev/null
echo "== 流程产物（只列不删）"
find "$HOME" -maxdepth 4 -type d -name '.just-flf' -not -path "$HOME/.just-flf" 2>/dev/null
```

把清单分三组给用户：

- **将删除**：Skill 本体（`FOUND` 的目录）。
- **需要你决定**：`~/.just-flf.json`（需求处理范式路径配置）、`~/.just-flf/`（联调凭证）。
- **只列不删**：各工作区里的 `.just-flf/<需求>/`（状态、报告、交付说明）、各仓的 `.claude/{fe,be}-profile.md`、`.git/info/exclude` 里的 `.just-flf/` 行。

**用户确认前不执行任何 `rm`。**

## Step 1 · 删除

```bash
rm -rf "<每个 FOUND 的目录>"
```

用户同意时再删 `~/.just-flf.json` 与 `~/.just-flf/`。

## Step 2 · 校验与汇报

重跑 Step 0 的「Skill 本体」一段，应无输出。汇报：删了哪些路径、保留了哪些用户数据。
