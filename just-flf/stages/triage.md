# 阶段卡 · triage 需求梳理

## 何时运行

新需求的第一步；用户要求重新梳理需求时也从这里开始（重跑会让下游已完成的阶段标为过期）。

## 步骤

### 1. 识别工作区（只在还没有产物目录时做）

```bash
node <skill>/tools/workspace.js --cwd <当前打开的目录> > /tmp/flf-ws.json
```

按输出里的 `questions` 处理，处理完重跑，直到没有阻塞性问题：

| id | 怎么处理 |
|----|----------|
| `paradigm_path` | 问用户需求处理范式文件在哪（没有就答「无」），执行 `workspace.js config --paradigm <路径或 none>` |
| `choose_workspace` | 把候选列给用户选，重跑时加 `--workspace <所选文件>` |
| `fix_workspace` | 把报错给用户，请用户修正工作区文件 |
| `create_workspace` | 把 `suggestion`（路径与内容）给用户，用户创建后重跑；用户明确授权时可以按建议内容代为创建 |
| `no_repos` | 请用户把工作区文件的 `folders` 指向仓库根目录 |
| `lane_unknown` / `lane_conflict` | 问用户哪个是前端仓、哪个是后端仓，`init` 之后用 `state.js set --key repos.<fe/be> --value '{"path":"…","profile":null,"mode":"write"}'` 修正 |

`notes` 里的内容（例如忽略了哪个工作区文件）在汇报时一并告诉用户。

和用户商定一个需求短名（中文可以，不含 `/`），然后：

```bash
node <skill>/tools/state.js init --workspace-json /tmp/flf-ws.json --requirement <需求短名>
```

输出的 `dir` 就是后面所有命令的 `--dir`。

### 2. 开始本阶段

```bash
node <skill>/tools/state.js start --dir <d> --stage triage
```

把用户给的需求原文（或需求文档路径、原型链接）原样写进 `paths.requirement`。

### 3. 派需求梳理分析师（1 个）

- 角色卡：`roles/analyst.md`
- 输入：需求原文 `paths.requirement`；需求处理范式（`state.json` 里的 `paradigm`，没有就不给）；前端 / 后端画像（`repos.*.profile`，有就给）；仓库路径与可写性（`repos`）；用户要求走 `lite` 时注明。
- 输出：报告 `paths.report`。

### 4. 回执

```bash
node <skill>/tools/state.js receipt --dir <d> --stage triage --role analyst --json '<回执>'
```

脚本会把分档、技术栈范围、接口计数、决策卡记进状态。

- `status=blocked`：需求有逻辑死锁，汇报阻断原因，停下等用户。
- 回执 `hints` 提示「需要新增 / 变更接口」而后端仓不可写或不存在：问用户二选一——后端改为可写（`set --key repos.be.mode --value write`），或保持只读（`set --key repos.be.mode --value readonly`，接口照样定义、交后端团队实现，后端泳道不启动）。单仓模式下没有后端仓时，先问后端仓路径。

### 5. 闸门

`state.js finish --dir <d> --stage triage`，然后汇报：

- 报告路径、一句话目标、分档与技术栈范围（请用户确认，可改）。
- 决策卡：逐张列出标题与建议，请用户拍板；每张用 `state.js decide --dir <d> --card <id> --choice <裁定>` 记录。用户说「按建议」时按建议记录。
- 涉及界面改动但没有设计稿：提醒用户 dev 之前需要设计稿链接或「按现有风格」的明确答复。

用户选「进入下一阶段」后 `gate --choice next`。接口计数全为 0 时，再对 api 执行 `gate --dir <d> --stage api --choice skip`（无需先 start）。

## 画像（在 api / design / dev 之前按需执行）

`state.js status` 的 `missingProfiles` 列出缺画像的仓。本需求涉及的泳道缺画像时：

1. `state.js start --dir <d> --stage profile --lane <fe|be>`
2. 派 `roles/profiler.md`。输入：仓库路径、模板 `<skill>/templates/profile-<fe|be>.md`。输出：画像写到 `paths.profile`，报告写到 `paths.report`。
3. `state.js receipt --stage profile --lane <l> --role profiler --json '<回执>'`
4. `state.js finish --stage profile --lane <l>`，把报告里「需要用户确认的决策点」给用户；用户确认后 `gate --stage profile --lane <l> --choice next`，要改就 `adjust` 并重派。
