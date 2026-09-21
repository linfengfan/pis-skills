# just-fe 安装指南 · 给 AI 的执行指令

> 你是正在读这份文档的模型。目标：把 `just-fe` **完整**装进用户的环境——环境支持 Dynamic Workflow 就把 7 个脚本一并装上，不要只装个 Skill 就停；已经装过就升级到当前版本。按 Step 0 → 5 从上到下执行，每步校验，不谎报成功，不要向用户复述本文内容。

三份文档的分工：**本文给 AI 装**；[README.md](./README.md) 给人看怎么用；[UNINSTALL.md](./UNINSTALL.md) 给 AI 卸。

---

## 装什么、装到哪

| 形态 | 落地位置 | 作用 | 何时装 |
|------|----------|------|--------|
| A · Skill 本体 | `~/.claude/skills/just-fe/`（整个 `just-fe/` 目录） | 让 Claude 认识 `just-fe`，掌握编排协议、闸门、评分铁律 | **总是装** |
| B · Dynamic Workflow 脚本 | `~/.claude/workflows/` 下 7 个 `*-workflow.js` | 7 个阶段真的在隔离运行时里跑、评审维度真并行打分 | Claude Code ≥ 2.1.154 时**一并装** |
| Cursor 变体 | `~/.cursor/skills/just-fe/` | Cursor 里同样能触发 just-fe（无 Workflow 运行时，等价于只装 A） | 检测到 `~/.cursor` 存在时一并装 |
| 项目级变体 | `<项目根>/.claude/skills/just-fe/`、`<项目根>/.claude/workflows/` | 只对当前仓库生效，可随仓库提交给团队 | 用户明确说「只装到当前项目」 |
| C · Plugin | 独立的 `pis-fe-plugin/` 目录或 marketplace | Skill + Workflow 一起版本化分发 | 用户明确说「团队共享 / 分发 / plugin」 |

`~/.claude` 在用户设置了 `CLAUDE_CONFIG_DIR` 时要换成该目录，下面统一用 `$CFG` 指代。

---

## Step 0 · 探测环境，定安装计划（只读）

```bash
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
FE_NAMES="fe-triage\|fe-architecture\|fe-architecture-review\|fe-ui-implementation\|fe-api-integration\|fe-code-arch-review\|fe-test-assessment"

echo "== Claude Code 版本（≥ 2.1.154 才能装 B）"; claude --version 2>/dev/null || echo "claude 不在 PATH"
echo "== Cursor"; [ -d "$HOME/.cursor" ] && echo "存在 ~/.cursor" || echo "无"
echo "== 已装 Skill"; for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe" ./.claude/skills/just-fe; do [ -f "$d/SKILL.md" ] && echo "已装 $d"; done
echo "== 已装 Workflow（按 meta.name 识别）"; find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null
echo "== 已装 Plugin"; n=$(grep -c '"pis-fe@' "$CFG/plugins/installed_plugins.json" 2>/dev/null); echo "${n:-0}"
```

**确定源目录 `$SRC`**：本文件已在本地磁盘上（用户 clone 了仓库、或正在仓库里）→ 用它所在的 `just-fe/` 绝对路径；否则远程取源：

```bash
git clone --depth 1 https://github.com/linfengfan/pis-skills.git /tmp/pis-skills
SRC=/tmp/pis-skills/just-fe
```

**按探测结果定计划**（不需要再问用户，直接执行；只有 C 和项目级变体要用户先说出来）：

| 探测结果 | 计划 |
|----------|------|
| `claude --version` ≥ 2.1.154 | A + B |
| `claude` 缺失或 < 2.1.154 | 只装 A；汇报时说明升级 Claude Code 后可补装 B |
| 存在 `~/.cursor` | 追加 Cursor 变体 |
| 已装过任一形态 | 走 Step 4 升级，而不是重复安装 |
| 用户说「只装到当前项目」 | A/B 的目标换成 `./.claude/skills/just-fe` 与 `./.claude/workflows/` |
| 用户说「团队共享 / 分发 / plugin」 | 走 Step 3 |

命令全部兼容 bash / zsh 与受限沙箱：路径匹配用 `find`，不用 `xargs` 和 `find -exec … {} +`。在沙箱里写 `~/.claude`、`~/.cursor` 需要工作区之外的写权限，拿不到就把命令原样交给用户手动执行，不要静默跳过。

---

## Step 1 · 模式 A：Skill 本体

复制**整个目录**（含 `scripts/`，模式 A 下脚本作为流程规格被模型阅读；`README.md`、`INSTALL.md`、`UNINSTALL.md`、`todo.md` 一起带上，不影响触发）：

```bash
mkdir -p "$CFG/skills"
rm -rf "$CFG/skills/just-fe"
cp -R "$SRC" "$CFG/skills/just-fe"
```

Cursor 变体（检测到 `~/.cursor` 时）：

```bash
mkdir -p "$HOME/.cursor/skills"
rm -rf "$HOME/.cursor/skills/just-fe"
cp -R "$SRC" "$HOME/.cursor/skills/just-fe"
```

项目级变体：目标换成 `./.claude/skills/just-fe`，其余相同。

**校验（必做）**：

```bash
for d in "$CFG/skills/just-fe" "$HOME/.cursor/skills/just-fe"; do
  [ -d "$d" ] || continue
  grep -q '^name: just-fe' "$d/SKILL.md" && [ -d "$d/scripts" ] && [ -d "$d/templates" ] && [ -d "$d/references" ] \
    && echo "OK $d" || echo "FAIL $d"
done
```

任一条 `FAIL` 就停下来报错，不要继续。

---

## Step 2 · 模式 B：Dynamic Workflow 脚本

前置条件不满足就不要装（装了也跑不起来）：`claude --version` ≥ 2.1.154；用户是 Pro 计划的话，还要在 Claude Code 里执行 `/config` 打开 **Dynamic workflows**（这一步只能用户自己做，汇报时提醒）。

7 个脚本都是自包含单文件，平铺复制即可。**先按 `meta.name` 清掉旧版本再复制**——文件名可能被改过，不能只靠覆盖同名文件：

```bash
mkdir -p "$CFG/workflows"
find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null \
  | while IFS= read -r f; do rm -v "$f"; done
cp "$SRC"/scripts/*-workflow.js "$CFG/workflows/"
```

项目级变体：目标换成 `./.claude/workflows/`。

**校验（必做）**：

```bash
find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null | wc -l   # 应为 7
find "$CFG/workflows" -maxdepth 1 -name '*-workflow.js' -exec grep -l '^import' {} \; 2>/dev/null                # 应无输出
find "$CFG/workflows" -maxdepth 1 -name '*-workflow.js' -exec grep -ln 'new Date\|Date\.now\|Math\.random' {} \; 2>/dev/null   # 应无输出（有则是旧脚本，会在拼报告时崩）
for f in "$SRC"/scripts/*-workflow.js; do
  node --check <(printf 'async function __w(){\n'; sed 's/^export const meta = {/const meta = {/' "$f"; printf '}\n') && echo "syntax OK $(basename "$f")"
done
```

`node --check` 要包一层 async 函数：脚本体里的顶层 `return` 由运行时提供，直接检查会报 `Illegal return statement`，那是正常的。

装完让用户**新开一个 Claude Code 会话**，输入 `/` 确认补全里出现 `fe-triage`、`fe-architecture`、`fe-architecture-review`、`fe-ui-implementation`、`fe-api-integration`、`fe-code-arch-review`、`fe-test-assessment` 7 个命令（命令名取自 `meta.name`，不是文件名）。可选冒烟：`/fe-triage 冒烟测试：给列表页加一个刷新按钮`——会真的派 agent，消耗 token。

---

## Step 3 · 模式 C：打包成 Plugin（仅用户要求分发时）

Plugin 是唯一能把 Skill 和 Workflow 一起版本化分发的方式。目标结构：

```
pis-fe-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── just-fe/            # $SRC 除 scripts/ 外的全部内容
│       ├── SKILL.md
│       ├── MEMORY.md
│       ├── templates/
│       └── references/
└── workflows/              # $SRC/scripts/ 里的 7 个 *-workflow.js，原样复制
    ├── triage-workflow.js
    └── ...
```

`.claude-plugin/plugin.json`：

```json
{
  "name": "pis-fe",
  "version": "0.2.0",
  "description": "前端研发全流程：需求→方案→评审→UI→联调→Review→测试，阶段闸门、80分红线与产物落盘",
  "author": { "name": "linfengfan" }
}
```

本地验证：`claude --plugin-dir /path/to/pis-fe-plugin`。装载后 Workflow 命令带命名空间前缀：`/pis-fe:fe-triage`。

若要通过 marketplace 安装，在仓库根加 `.claude-plugin/marketplace.json`，然后在 Claude Code 里 `/plugin marketplace add linfengfan/pis-skills`、`/plugin install pis-fe`。

---

## Step 4 · 升级已安装版本

Step 0 发现已装过时走这里，而不是重复 Step 1/2：

```bash
echo "== Skill 差异"; diff -rq "$SRC" "$CFG/skills/just-fe" 2>&1 | grep -v '\.git' | head -20
echo "== Workflow 差异"; for f in "$SRC"/scripts/*-workflow.js; do b=$(basename "$f"); diff -q "$f" "$CFG/workflows/$b" >/dev/null 2>&1 || echo "过期或缺失 $b"; done
```

有差异就用 Step 1 / Step 2 的命令原样覆盖（`rm -rf` + `cp -R` 本身就是升级），Cursor 变体同样处理。

**升级不碰用户数据**：各项目里的 `fe-reports/`、`.claude/fe-profile.md` 是运行产物，不在安装范围内，不要动。Plugin 形态的升级走 `/plugin update pis-fe` 或重新 `--plugin-dir`。

---

## Step 5 · 最终校验 + 汇报

```bash
CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
FE_NAMES="fe-triage\|fe-architecture\|fe-architecture-review\|fe-ui-implementation\|fe-api-integration\|fe-code-arch-review\|fe-test-assessment"
fail=0
grep -q '^name: just-fe' "$CFG/skills/just-fe/SKILL.md" 2>/dev/null || { echo "Skill 未就位"; fail=1; }
[ -d "$HOME/.cursor" ] && { grep -q '^name: just-fe' "$HOME/.cursor/skills/just-fe/SKILL.md" 2>/dev/null || echo "提示：Cursor 变体未装"; }
if [ -d "$CFG/workflows" ]; then
  n=$(find "$CFG/workflows" -maxdepth 1 -name '*.js' -exec grep -ls "name: '\($FE_NAMES\)'" {} \; 2>/dev/null | wc -l | tr -d ' ')
  [ "${n:-0}" -eq 7 ] || echo "提示：Workflow 脚本 $n/7（未装 B 或不完整）"
  for f in "$SRC"/scripts/*-workflow.js; do
    diff -q "$f" "$CFG/workflows/$(basename "$f")" >/dev/null 2>&1 || echo "提示：$(basename "$f") 与源不一致（旧版本？走 Step 4）"
  done
fi
[ $fail -eq 0 ] && echo "just-fe 安装完成 ✓"
```

**汇报内容必须包含**（不要罗列没装的东西）：

1. 装了哪些形态、各自的落地路径
2. 怎么开始用：直接指向 README §1，给用户那句起手话——`用 just-fe 走一遍：<粘贴需求文档>`
3. 用户还需自己做的事：Pro 计划开 `/config` → Dynamic workflows；新开会话让 `/fe-*` 命令生效；首次跑会先生成项目画像 `.claude/fe-profile.md`
4. 本次安装**实际生效**的限制，从下一节挑：只装 A 时打分不真并行；Cursor 无 Workflow 运行时；未做真实运行时端到端验证

---

## 安装后生效的限制（汇报时按需引用）

| 情况 | 限制 |
|------|------|
| 只装了 A（未装 B） | 7 个脚本只是被模型当作流程规格阅读，`parallel()` 并行打分与隔离上下文不生效，评审退化成主对话里的一次判断。装 B 才真跑 |
| 装了 B | Workflow 运行中**不能向用户提问**（官方运行时限制），所以「进不进下一阶段」「要设计稿」这些拍板都发生在两次 Workflow 调用之间，用户会在每个阶段结束被问一次；不想被问用 `--auto` |
| Pro 计划 | 需在 Claude Code `/config` 打开 Dynamic workflows，否则 `/fe-*` 命令不可用 |
| Cursor | 无 Dynamic Workflow 运行时，等价于只装 A |
| 所有形态 | 打分是模型判断，不是确定性检查；lint / 类型 / 单测 / E2E 由 ⑦ 阶段交给工具跑，评分只覆盖工具管不到的层面，不能替代 CI |
| 所有形态 | 脚本逻辑用桩运行时测过，编排协议用子 agent 场景推演过，但**没有在真实 Claude Code 运行时端到端跑过七个阶段**；建议用户先拿小改动试跑 |

---

## 附 · 脚本硬约束（改脚本前必读，安装不需要）

- **单文件自包含**：Workflow 脚本在隔离环境执行，没有文件系统与 shell 权限，**不能出现任何 `import`**，prompt 与 schema 一律内联。Step 2 校验里的 `grep '^import'` 就是查这条。
- **`FRONTEND_DEV_SYSTEM` 有两份副本**（`ui-implementation-workflow.js` 与 `api-integration-workflow.js`），运行时限制导致无法共享。改一处必须同步另一处，两处文件头有警示注释。自查：

  ```bash
  node -e 'const fs=require("fs"),g=f=>fs.readFileSync(f,"utf8").match(/const FRONTEND_DEV_SYSTEM = `([\s\S]*?)`\n/)[1];console.log(g("scripts/ui-implementation-workflow.js")===g("scripts/api-integration-workflow.js")?"IDENTICAL":"DIFF")'
  ```

- **禁止 `Date` / `Math.random`**：运行时为了可 resume 强制确定性，脚本里任何 `new Date()` / `Date.now()` / `Math.random()` 都会让整段运行失败——而且是在所有 agent 跑完、拼报告时才炸，结果全丢。时间戳一律从 `args.timestamp` 读，由编排方传入。自查：

  ```bash
  rg -n "new Date|Date\.now|Math\.random" scripts/*.js   # 应无输出
  ```

- **脚本里的角色名不是 Skill**：「资深前端开发工程师」「前端架构师」「代码评审终审官」「E2E 验证执行者」都只是内联 prompt 的称呼，`Skill(前端开发工程师)` 会得到 `Unknown skill`。
- **`args` 可能是 `undefined`，也可能是 JSON 字符串**：前者是用户不带参数调用 `/fe-*`；后者是运行时已知 bug（anthropics/claude-code #67627）。每个脚本开头都有归一化（`undefined` → `{}`，JSON 字符串 → `JSON.parse`，纯文字 → `requirement`），新增脚本要保留这段。
- **按 `name` 可能解析不到 `~/.claude/workflows/` 里的脚本**（#63876）：SKILL.md 已写了 `scriptPath` 退路；安装后若 `/fe-*` 补全正常但 `Workflow` 工具按 name 报 not found，属于这个 bug，不是安装问题。
