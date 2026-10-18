# just-flf 设计文档（just-fe 重写版）

- **日期**：2026-10-18
- **状态**：待用户审阅
- **前身**：`just-fe/`（全栈研发流程 skill，阶段卡 + 子 agent 形态，2026-10-16 版）
- **决策来源**：2026-10-18 与用户的 4 轮方向提问 + 6 节设计逐节确认

---

## 1. 背景与目标

just-fe 现版本的问题（2026-10-18 全量评审结论）：

- 流程有死结：部署闸门要求合入一个从未提交的分支；代码评审排在合入共享分支之后；`test` 打回后绕过 `review`；契约升版后下游无失效机制。
- 编排者把所有产物全文抄进子 agent prompt、再自己从 JSON 渲染报告，主上下文被撑爆。
- 评分规则可被钻空子（③ 未返回不计分母、⑥ 未返回记 0 分），LLM 打分无校准。
- 3 个工具都有可复现 bug（`workspace-detect.js` 崩溃与误判、`out-of-scope.sh` 漏报与误报、`contract-conformance.js` 误判 FAIL / 空数组 PASS / 真实发送写请求）。
- 自删除脚本层后零验证；本机安装的是旧版；文档有残留引用和内部信息。

本次重写的优先级（用户定）：**用起来轻**、**流程正确**。

## 2. 已定决策

| 项 | 决策 |
|----|------|
| 名称 | `just-flf`；安装时清除旧 `just-fe` |
| 定位 | 核心通用、画像驱动：流程与工具不写死任何项目值，技术栈 / 网关 / 响应体格式 / 门禁命令都来自画像；主场景为一个前端仓 + 一个后端仓 |
| 重构方式 | 重写。保留四条理念：接口先行、确定性检查交给脚本、提交权归用户、找不到问题如实给高分 |
| 整体结构 | 阶段卡（编排者读）与角色卡（子 agent 读）分开 |
| 闸门 | 每个阶段结束都停，由用户决定是否继续 |
| git | 流程不执行任何 git 写操作，也不产出合入 / 部署命令；只读 git（`status` / `diff` / `ls-files` / `rev-parse`）允许 |
| 本地闭环 | 开发、代码评审、本地测试评估全在本地完成；交付说明之后代码取舍由用户决定 |
| 联调 | 可选阶段，用户自行部署后触发 |
| 需求分档 | 小改动不进流程 / `lite` / `full` |
| 编排 | 子 agent 按路径自己读输入、按模板自己落盘报告，只回小 JSON 回执 |
| 评审 | 清单逐项 pass / fail / na + 证据，脚本机械算分，critical 一票否决；`api` / `design` / `review` 每次 3 个评审员，`lite` 档代码评审、`test`、`integrate` 各 1 个 |
| 角色 | 前后端各有独立的架构师与开发角色卡；架构师是泳道负责人，参与本泳道代码评审 |
| 状态 | `state.json` + `state.js`；`MEMORY.md` 由脚本生成，仅供阅读 |
| 产物位置 | `<工作区根目录>/.just-flf/<需求短名>/`；skill 目录不放任何运行产物 |
| 验证 | 工具单测 + 角色卡场景测试 + 一个真实小需求端到端 |

## 3. 阶段骨架

### 3.1 阶段

阶段 ID 用英文短词，文件名、`--from=` 参数、状态记录统一使用。

| ID | 名称 | 何时运行 | 职责 |
|----|------|----------|------|
| `triage` | 需求梳理 | 总是 | 开头运行 `workspace.js` 自动识别工作区，识别不出才问用户。产出台账、术语表、场景矩阵与覆盖缺口、验收标准、影响面、存量消费方排查、决策卡；判定分档、`stackScope`、每个接口的状态（existing / new / change） |
| `api` | 接口梳理确认 | 需求涉及接口时 | existing：列出后端实现位置与前端调用点，形成复用清单交用户确认，不做评审循环。new / change：定义字段（类型 / 可空 / 校验 / 示例）、错误码、枚举与状态机、幂等、标识来源辨析，阶段内自动评审修订后交用户确认 |
| `design` | 方案 | `full` 档 | 前后端两条泳道并行出方案，各自阶段内「评审 → 修订」，两泳道都通过后合并为一道闸门 |
| `dev` | 开发 | 总是 | 每个仓开工先运行 `scope.js baseline`。前端开工前确认设计稿（链接或用户原话「按现有风格」）。前端按接口定义生成 Mock 做 UI；后端实现接口与契约测试，跑画像里的编译 / 格式检查 / 测试命令 |
| `review` | 代码评审 | 总是 | 每个仓一次；`lite` 档单评审员 |
| `test` | 本地测试评估 | 总是 | 每个仓一次：取证者先跑命令取证，评审员再判测试质量项，脚本算分 |
| `deliver` | 交付说明 | 主线终点 | `state.js deliver` 组装：每个仓的改动文件清单、越界文件、原有改动、建议 commit message、必须人工验证的点、各阶段结果 |
| `integrate` | 联调 | 可选 | 用户说「已部署 + 网关地址」并把凭证写入 `~/.just-flf/auth` 后运行：前端仓拍联调前基线 → `conformance.js` 契约校验 → fe-developer 把 PASS 接口替换为真接口（FAIL 保留 Mock 并记问题，不做前端兼容补丁）→ 1 个 reviewer 评审联调改动 → `state.js deliver` 增量更新交付说明 |

### 3.2 闸门

- 每个阶段结束停下，三选一：`进入下一阶段（写明名字）` / `本阶段还有调整` / `先停在这里`。
- 评审不通过时的闸门选项：`回 dev 修复（推荐）` / `接受现状进入下一阶段（取舍记入状态与交付说明）` / `先停在这里`。
- 阶段内部的修订循环自动进行：`api` 最多 2 轮，`design` 最多 3 轮；到上限停下交给用户。
- 用户点名阶段（「开始代码评审」「出方案」）等价于 `--from=<id>`，先跑 `state.js jump`。
- 汇报不超过 10 行：报告路径、结论 / 分数、决策卡标题与建议选项、下一阶段、还缺什么输入。

### 3.3 打回与失效

- `review` 不通过 → 回 `dev`，只修问题清单中的项 → 重跑 `review`。
- `test` 不通过 → 回 `dev` → **必须重跑 `review`** → 再跑 `test`。
- 接口定义升版 → `state.js` 把受影响泳道已完成的 `design` / `dev` / `review` / `test` / `deliver` 标为 `stale`。
- `dev` 重跑 → `review` / `test` / `deliver` 标为 `stale`。
- `stale` 的阶段必须重跑或由用户在闸门处明确确认沿用。

### 3.4 三档路由

| 档位 | 判定条件 | 路径 |
|------|----------|------|
| 小改动 | 改一行文案、单文件明显 bug | 不进流程（description 排除） |
| `lite` | 接口全部 existing、不碰公共模块 / 公共组件（以画像的「高风险区域」为准；无画像时由 analyst 依据引用计数判断并在报告中说明） | `triage` → `api`（只确认复用清单）→ `dev` → `review`（单评审员）→ `test` → `deliver` |
| `full` | 有 new / change 接口、跨模块、新页面 | `triage` → `api` → `design` → `dev` → `review` → `test` → `deliver`（可选 `integrate`） |

- 分档在 `triage` 闸门由用户确认，可改。
- `lite` 中发现需要 new / change 接口 → 闸门处提示升级为 `full`。
- 需求不涉及接口 → 跳过 `api`。

### 3.5 后端可写 / 只读

- 不在开头询问。`triage` 判定 `needsBackendWrite=true`（存在 new / change 接口）时停下问用户：
  - **可写**：后端泳道由本流程实现。
  - **只读**：`api` 照样把接口完整定义出来交后端团队实现，后端泳道（`design`-be / `dev`-be / `review`-be / `test`-be）标 `na`。
- 选择写入 `state.json` 的 `repos.be.mode`。

### 3.6 画像

- `triage` 有画像就用，没有也能跑。
- `api` / `design` / `dev` 之前，本需求涉及的泳道必须有画像；缺失时派 `profiler` 生成，用户确认后写入 `<仓>/.claude/{fe,be}-profile.md`。
- 画像在 `dev` 基线之前生成，不会被判为越界。

## 4. 文件结构

```
pis-skills/
├── README.md
├── docs/                         不随 skill 安装
│   ├── specs/                    设计文档
│   ├── history/                  旧版研讨纪要、全栈设计（清理内部信息后）
│   └── CHANGELOG.md              原 todo.md 的反馈与处理记录
├── tests/just-flf/               不随 skill 安装
│   ├── tools/                    工具单测（node:test）
│   └── scenarios/                角色卡场景测试 + 测试工作区 + check.js
└── just-flf/                     安装单元
    ├── SKILL.md
    ├── README.md / INSTALL.md / UNINSTALL.md
    ├── stages/   triage.md api.md design.md dev.md review.md test.md deliver.md integrate.md
    ├── roles/    analyst.md api-designer.md fe-architect.md be-architect.md
    │             fe-developer.md be-developer.md dev-rules.md reviewer.md verifier.md profiler.md
    ├── checklists/  api.md design-fe.md design-be.md code.md test.md
    ├── templates/   profile-fe.md profile-be.md
    └── tools/       state.js workspace.js scope.js conformance.js
```

### 4.1 各类文件的职责

| 类别 | 读者 | 内容 | 规模目标 |
|------|------|------|----------|
| `SKILL.md` | 编排者 | 阶段表、闸门协议、派任务模板、回执判读总则、子 agent 工具参数映射、报错处理、红旗清单 | ≤150 行 |
| `stages/*.md` | 编排者 | 运行条件、入参（路径）、前置判定、派谁（角色卡 + 清单分组）、回执字段判读、下一步 | 每张约 50 行 |
| `roles/*.md` | 子 agent | 人设、工作步骤、铁律、报告模板、机器文件格式、回执格式 | 每张 80–150 行 |
| `checklists/*.md` | 评审子 agent、`state.js` | 检查项表（编号 / 组 / 检查项 / 严重度 / 适用范围） | 每份 40–80 行 |
| `templates/` | `profiler` | 前后端画像模板 | — |
| `tools/` | 编排者（Bash） | 确定性操作 | — |

### 4.2 角色卡

| 角色卡 | 用于 | 要点 |
|--------|------|------|
| `analyst.md` | `triage` | 六条元原则；范式接入（有范式按范式，无范式按内置最小集，覆盖缺口反推 / 存量消费方排查 / 决策卡六项不可裁剪）；`lite` 档的精简版输出要求 |
| `api-designer.md` | `api` | 先勘察再定义；existing 必须有证据；同时产出 `api-v<N>.md`（人读）与 `api-v<N>.json`（机读） |
| `fe-architect.md` | `design`-fe、`api` 评审、`review`-fe | 约束提取、文件清单、组件树、状态归属、数据流与竞态、接口类型、Mock 方案、路由权限、样式与国际化、性能、风险、备选方案、任务卡；评审时的视角与职责 |
| `be-architect.md` | `design`-be、`api` 评审、`review`-be | 约束提取、落点模块、分层（按画像）、接口落地映射、数据模型与索引、事务并发幂等、缓存与消息、性能与安全、契约测试方案、风险、备选方案、任务卡；不写死任何语言 / 框架 |
| `fe-developer.md` | `dev`-fe、`integrate` | 防御性边界、组件化、编码规范、性能与内存；联调专项段 |
| `be-developer.md` | `dev`-be | 防御性边界、分层与契约执行、编码规范、契约测试；命令一律取自画像 |
| `dev-rules.md` | 两位开发 | 变更边界铁律、不执行任何 git 写操作、基线对比回退自己引入的无关改动、自验收必须看到通过结果 |
| `reviewer.md` | 所有评审 | 评审员纪律、pass / fail / na 判定规则、证据要求、`observations`、items 文件与回执格式 |
| `verifier.md` | `test` | 验证手段优先级、逐条验收取证、回归、只许改测试文件、未执行即 unverified |
| `profiler.md` | 画像缺失时 | 前后端探测清单、未探测到如实标注、用户确认后写入 |

架构师作为评审员时同时读自己的角色卡与 `reviewer.md`；开发同时读自己的角色卡与 `dev-rules.md`。

### 4.3 单一真源规则

- 人设只在 `roles/`；评审维度与检查项只在 `checklists/`；报告模板只在对应角色卡里。
- README 与 SKILL.md 只引用，不复制配分或检查项。
- `state.js` 的报告段落校验从角色卡模板里解析 `##` 标题；算分权重从清单表格里解析严重度。
- 文件名全部英文。

## 5. 编排协议与回执

### 5.1 派任务模板

编排者给子 agent 的 prompt 固定为以下结构，长度与产物大小无关：

```
你是「<角色名>」。先完整读以下文件并按其执行：
  <skill>/roles/<role>.md
  [<skill>/roles/reviewer.md | <skill>/roles/dev-rules.md]
任务：<一句话>[；只负责清单 <skill>/checklists/<x>.md 中的 <组前缀> 组]
输入（自己读）：<名称> <路径> ｜ <名称> <路径> ｜ …
输出：报告写到 <路径>（按角色卡模板，段落不删）[；机器文件写到 <路径>]
回执：最后输出一个 json 代码块，格式见角色卡「回执」一节
```

- `subagent_type` 取当前环境工具描述里的通用类型；`dev` / `test` / `integrate` / `profiler` 需要写权限与命令执行权限。
- 并行评审员必须在同一条消息里派出。
- 编排者不读角色卡、不读清单、不读完整报告；只读阶段卡、回执、`state.js` 输出。

### 5.2 回执

公共字段：

```json
{ "status": "ok | blocked | needs_input | failed",
  "report": "<报告路径>",
  "summary": "不超过 3 句",
  "questions": [] }
```

各角色追加字段（大清单一律写入机器文件，回执只放路径与计数）：

| 角色 | 追加字段 | 机器文件 |
|------|----------|----------|
| analyst | `route`、`stackScope`、`apis{existing,new,change}`、`needsBackendWrite`、`uiChange`、`designAssets[]`、`decisionCards[{id,title,recommendation}]` | — |
| api-designer | `version`、`endpoints{existing,new,change}`、`apiJson` | `api-v<N>.json` |
| 架构师（出方案） | `lane`、`filesList`、`taskCount`、`needsClarification[]` | `<lane>/files.txt` |
| 开发 | `lane`、`commands[{cmd,exit}]`、`outOfScopeClaimed[]`；be 加 `contractTests{expected,written,passed}` | — |
| 评审员 | `items`（路径）、`counts{pass,fail,na}`、`criticalFails[]`；代码评审中的架构师加 `changeSummary`、`commitMessage`、`manualChecks[]` | `<报告名>.items.json` |
| verifier | `criteria`（路径）、`counts{pass,fail,unverified}`、`regressionFailures[]`、`blockers[]` | `<报告名>.criteria.json` |
| profiler | `lane`、`profilePath`、`unknowns[]` | — |

### 5.3 回执处理

1. 编排者从子 agent 回复中取最后一个 json 代码块。
2. 运行 `node <skill>/tools/state.js receipt <stage> --lane <lane> --json '<回执>'`：校验必填字段、报告存在且段落齐全、机器文件可解析，然后写入 `state.json`。
3. 校验失败 → 带着脚本输出的错误原因重派一次；仍失败 → 停下，把原因交给用户。
4. 禁止降级为编排者自己完成分析 / 开发 / 评审。

### 5.4 产物命名（相对 `.just-flf/<需求短名>/`）

| 阶段 | 文件 |
|------|------|
| 状态 | `state.json`、`MEMORY.md`（生成） |
| triage | `triage-r<n>.md` |
| api | `api-v<N>.md`、`api-v<N>.json`、`api-v<N>-review-r<n>-<reviewer>.md` + `.items.json`、`api-v<N>-review-r<n>.md`（汇总） |
| design | `<lane>/design-r<n>.md`、`<lane>/files.txt`、`<lane>/design-review-r<n>-<k>.md` + `.items.json`、`<lane>/design-review-r<n>.md`（汇总） |
| dev | `<lane>/baseline.json`、`<lane>/dev-r<n>.md`、`<lane>/scope.json` |
| review | `<lane>/review-r<n>-<arch|correct|conv>.md` + `.items.json`、`<lane>/review-r<n>.md`（汇总） |
| test | `<lane>/test-r<n>-verify.md` + `.criteria.json`、`<lane>/test-r<n>-quality.md` + `.items.json`、`<lane>/test-r<n>.md`（汇总） |
| deliver | `deliver.md` |
| integrate | `integrate/conformance-r<n>.json`、`integrate/integrate-r<n>.md`、`integrate/review-r<n>.md` |

轮次都保留，不覆盖。报告内的时间用用户本地时间。

### 5.5 续接

- 每次会话开始先运行 `state.js status`，得到当前阶段、`stale` 阶段、下一步动作。
- `--from=<id>` → `state.js jump <id>`：检查前置产物，中间阶段逐个问用户标「确认完成」或「跳过」。
- 汇报时的阶段名一律来自 `state.js status` 的输出。

## 6. 评审清单与算分

### 6.1 清单格式

```
| ID       | 组    | 检查项                                       | 严重度   | 适用 |
|----------|-------|----------------------------------------------|----------|------|
| LOGIC-03 | LOGIC | 接口里标为可空的字段，视图层有兜底展示          | major    | fe   |
| SEC-01   | SEC   | 按 ID 操作资源前校验归属，不信任前端透传的身份   | critical | be   |
```

- 严重度：`critical` / `major` / `minor`。
- 适用：`all` / `fe` / `be`。
- 现版本各阶段卡里的「必须逐项检查」内容迁移为清单项，后端项去除 Java 写死，改为「按画像约定」。

### 6.2 判定规则（写在 `reviewer.md`）

- 每项只能 `pass` / `fail` / `na`。
- `fail`：必须有位置（`文件:行号` / 接口 id / 方案章节）与修法；critical 项还要写后果。
- critical 项 `pass`：必须写明查了哪里。
- `na`：必须写原因。
- 清单外的发现写进 `observations`，不计分。

### 6.3 算分（`state.js score`）

- 权重：critical 3、major 2、minor 1；`na` 不计入。
- 总分 = 通过项权重之和 ÷ 适用项权重之和 × 100（四舍五入）。
- 通过 = 总分 ≥ 80 且无 critical `fail`。
- 任一指派的评审员在重派后仍无合格回执 → 该轮判「无法完成」，停下交用户；不做部分计分。
- `lite` 档单评审员：覆盖指派组内所有 critical 与 major 项，跳过 minor。

### 6.4 评审员分配（每次 3 个，同一条消息并行）

| 评审 | 评审员 1 | 评审员 2 | 评审员 3 | 清单 |
|------|----------|----------|----------|------|
| `api` | fe-architect：前端消费视角（字段够用、可空、错误码的前端表现） | be-architect：后端约定、可实现性、幂等与兼容 | reviewer：字段表与 JSON 一致、标识来源辨析 | `api.md` |
| `design`-fe | reviewer：需求覆盖、可行性 | reviewer：模块结构、状态管理 | reviewer：风险、规范 | `design-fe.md` |
| `design`-be | reviewer：需求覆盖、分层与接口落地 | reviewer：数据模型、事务并发幂等 | reviewer：性能安全、规范 | `design-be.md` |
| `review`（每仓） | 本泳道 architect：实现与方案一致性、架构与可维护性、爆炸半径（产出改动摘要 / 建议 commit message / 人工验证点） | reviewer：正确性、健壮性、类型 | reviewer：规范、安全 | `code.md` |

- 方案由架构师撰写，`design` 评审不由架构师评。
- 具体每个评审员负责哪些组前缀，写在对应阶段卡里。
- `lite` 档代码评审：1 个 reviewer（通用评审员），覆盖 `code.md` 所有组的 critical 与 major 项；方案一致性组标 `na`（`lite` 没有方案）。
- `integrate` 评审：1 个 reviewer，只评联调改动（`scope.js diff` 相对联调前基线），覆盖 `code.md` 的 critical 与 major 项；门禁命令由 fe-developer 在联调收尾时自跑并写入回执。

### 6.5 test 阶段

1. verifier 取证：逐条验收标准给 `pass` / `fail` / `unverified` 与证据；跑回归门禁；后端逐个 new / change 接口确认契约测试存在并运行。
2. 1 个 reviewer 按 `test.md` 判测试质量项。
3. `state.js score` 计算：验收覆盖项来自 `criteria.json`（`unverified` 计为未通过），测试质量项来自 `items.json`。
4. 一票否决（与总分无关）：任一验收 `fail`、任一回归失败、任一契约测试失败。
5. `unverified` 不否决，全部进入交付说明的「必须人工验证的点」。

## 7. 状态与工具

### 7.1 产物位置

- `<工作区根目录>/.just-flf/<需求短名>/`。工作区根目录按以下顺序确定：
  1. **有 `.code-workspace`**：取该文件所在目录。当前目录在某个 git 仓内时，先过滤掉「与当前仓无关」的候选（判定见 7.3），剩 0 个按单仓模式、剩 1 个直接用、剩多个输出到 `questions` 由用户指定；用户的选择通过 `--workspace <file>` 回传。
  2. **单仓例外**：没有 `.code-workspace`，但当前打开目录本身就是一个 git 仓（能判定为前端仓或后端仓）→ 以该仓根目录为工作区根目录，按单仓模式运行，无需创建 `.code-workspace`。
  3. **其他情况**（当前打开目录不是 git 仓，例如是多个仓的父目录）：不回退、不开始 `triage`。`workspace.js` 在 `questions` 里输出创建提示，内容包括建议路径（当前打开目录）和建议的文件内容（`folders` 预填探测到的前端仓 / 后端仓）。编排者把提示交给用户，用户创建后（或明确让编排者按建议内容代为创建后）重新运行 `workspace.js`。
- **单仓模式下需要另一个仓时**：`triage` 判定涉及另一条泳道（如前端仓里发现要新增 / 变更后端接口），或需要勘察后端实现给已有接口找证据时，停下问用户另一个仓的路径，写入 `state.json` 的 `repos`；产物目录保持不变。用户不提供时：需要实现的泳道无法启动，按 3.5 的「只读」处理；已有接口的证据只记前端调用点，并标注「后端未勘察」。
- 若该目录落在某个 git 仓内部，`state.js init` 把 `.just-flf/` 写入该仓的 `.git/info/exclude`（仅本机生效，不改共享 `.gitignore`）。
- `scope.js` 始终排除 `.just-flf/`。

### 7.2 `state.js`

`state.json` 结构（示意）：

```json
{
  "requirement": "<需求短名>",
  "workspaceRoot": "<绝对路径>",
  "workspaceMode": "workspace | single-repo",
  "route": "lite | full | blocked",
  "stackScope": "fe | be | fullstack",
  "repos": {
    "fe": { "path": "...", "profile": "...", "mode": "write" },
    "be": { "path": "...", "profile": "...", "mode": "write | readonly" }
  },
  "apiVersion": 1,
  "design": { "url": null, "noDesignReason": null },
  "stages": {
    "triage": { "status": "done", "round": 1, "reports": ["triage-r1.md"] },
    "review": { "lanes": { "fe": { "status": "awaiting_gate", "round": 1, "score": 86, "passed": true } } }
  },
  "decisions": [{ "card": "DC-1", "choice": "...", "at": "..." }],
  "gates": [{ "stage": "triage", "choice": "next", "at": "..." }],
  "integrate": { "gatewayUrl": null, "authSource": "~/.just-flf/auth" }
}
```

阶段状态取值：`pending` / `running` / `awaiting_gate` / `done` / `skipped` / `na` / `stale` / `failed`。

| 命令 | 作用 |
|------|------|
| `init` | 以 `workspace.js` 输出建状态；按需写本地 exclude |
| `status` | 当前阶段、`stale` 阶段、下一步动作 |
| `receipt <stage> [--lane]` | 校验回执、报告段落、机器文件，写入状态 |
| `score <stage> [--lane]` | 读 items / criteria 文件与清单，算分并生成汇总报告 |
| `gate <stage> <choice>` | 记录闸门决定；评审不通过时「接受现状」写入取舍 |
| `jump <stage>` | 跳转前置检查与中间阶段标记 |
| `deliver` | 组装 `deliver.md` |
| `render` | 重新生成 `MEMORY.md`（其他写命令执行后自动调用） |

### 7.3 `workspace.js`

- 命令：`node workspace.js [--cwd <dir>] [--home <dir>] [--workspace <file>]`；`node workspace.js config --paradigm <路径|none> [--home <dir>]`（写 `~/.just-flf.json`）。识别命令只读，输出 `{ workspaceMode, workspaceFile, workspaceRoot, repos[{ lane, laneBy, name, path, profile, dirty }], paradigm, notes[], questions[] }`。
- 定位 `.code-workspace`：给了 `--workspace` 直接用该文件（不过滤）；否则从当前打开目录向上查找到用户主目录，在最近一个有候选的目录处理：
  - 当前目录不在 git 仓内：1 个 → 用；多个 → `choose_workspace`。
  - 当前目录在 git 仓内（仓根 `topReal`）：候选「包含当前仓」= folders 含 `topReal`，或候选所在目录不是 `topReal` 的严格祖先（等于仓根或位于仓内）。不包含的候选忽略并记 note；无法解析的候选若位于仓根的严格祖先目录则忽略并记 note，否则 `fix_workspace`。剩 0 个 → 单仓模式；1 个 → 用；多个 → `choose_workspace`。
  - 找不到且当前目录在 git 仓内 → 单仓模式；找不到且不在 git 仓内 → `create_workspace`，不输出 `workspaceRoot`（见 7.1）。
- 解析 JSONC（注释、尾逗号、BOM）；解析结果不是对象或 `folders` 不是数组 → `fix_workspace`。folders 里不是 git 仓根的目录逐个记 note（区分「位于某仓内」与「非 git 目录」），不自动提升；一个仓都没识别到 → `no_repos`。
- 泳道判定：有画像以画像为准；否则 `pom.xml` / `build.gradle(.kts)` / `go.mod` / `pyproject.toml` 或 `dependencies` 里的后端框架 → be，`dependencies` / `devDependencies` 里的前端框架 → fe（`devDependencies` 里的后端框架不计，前端仓常用它做 Mock）；无法判定或同泳道多个仓 → `questions`。
- 网关地址、响应体格式（code 字段 / 成功码 / data 字段 / 鉴权码）、门禁命令从画像读，由编排层转成 `conformance.js` 参数（传递方式在计划 2 确定）。
- 需求处理范式路径从 `~/.just-flf.json` 读；未配置时输出 `paradigm_path` 问题。

`questions` 的 id 与回答方式（计划 2 的 `state.js init` 与 `triage` 阶段卡照此处理）：

| id | 含义 | 如何回答 |
|----|------|----------|
| `paradigm_path` | 需求处理范式未配置 | `workspace.js config --paradigm <路径|none>` 后重跑 |
| `choose_workspace` | 多个相关的工作区文件 | 重跑并带 `--workspace <file>` |
| `fix_workspace` | 工作区文件无法解析或结构不对 | 用户修正文件后重跑 |
| `create_workspace` | 不在 git 仓内且没有工作区文件 | 按 `suggestion` 创建（或用户授权代为创建）后重跑 |
| `no_repos` | 工作区里没有识别到 git 仓 | 用户修正 `folders` 指向仓库根后重跑 |
| `lane_unknown` | 无法判定某仓是前端还是后端 | 由 `state.js init` 接受泳道覆盖参数（计划 2） |
| `lane_conflict` | 同泳道识别到多个仓 | 由 `state.js init` 接受仓库选择参数（计划 2） |

### 7.4 `scope.js`

- `baseline --repo <仓库根> --out <file>`：记录 `HEAD` 与所有已修改 / 已暂存 / 未跟踪文件的内容哈希。
- `diff --repo <仓库根> --baseline <file> [--files <files.txt>] --out <file> [--exclude <相对路径>]...`：
  - `changed` = 自基线 `HEAD` 以来已提交的变化 ∪ 工作区变化 ∪ 新增未跟踪文件，其中基线里已有的文件仅当哈希变化时计入。
  - `preexisting` = 基线已有且未被改动的文件（仅提示）。
  - `outOfScope` = `changed` − `files.txt`；文件清单与 `--exclude` 共用一套规整（去掉开头 `./`、`/`），按「等于或以 `<条目>/` 开头」匹配，目录条目末尾有没有 `/` 都行。
  - 不传 `--files`（如 `lite` 档没有方案、没有 `files.txt`）→ `requirementFiles` 与 `outOfScope` 为 `null`，表示「未判越界」，消费方不得当作「无越界」。
  - 排除 `.just-flf/`；`-z` 处理中文路径与重命名。
- `--repo` 必须是仓库根目录（realpath 比较），基线与当前仓不符 → 退出码 2；任意位置的 `--help` 打印说明并退出 0。
- 已知限制：基线时已有的脏文件若被原样提交，仍归入 `preexisting`（开发 agent 不允许提交，基线后的提交视为用户所为）。
- 只读 git。

### 7.5 `conformance.js`

- 命令：`node conformance.js --api <api-vN.json> --base-url <http(s) URL> [--auth-file <file>] [--allow-write <id,…>] [--only <id,…>] [--timeout <ms>] [--code-field <f>] [--success-codes <a,…>] [--data-field <f>] [--auth-codes <a,…>] [--out <file>] [--dry-run]`。无统一响应体的 REST 接口传 `--code-field '' --data-field ''`。
- 输入 `api-v<N>.json`（不再用正则从 Markdown 抽取）。每个接口必须有 `id`、`method`、以 `/` 开头的 `path`；每个 `errorProbes[j]` 必须有 `expectCode` 或 `expectHttp`；不满足 → 退出码 2。`--timeout` 非正数、`--base-url` 不是 http(s) → 退出码 2。
- 接口定义格式（计划 3 的 `api-designer.md` 按此产出）：`{ id, method, path, request?: { path?, query?, body? }, response?: { data?: <字段表> | schema?: <单个字段说明> }, envelope?: { codeField, successCodes, dataField, authCodes }, errorProbes?: [{ name, request: { path?, query?, body? }（字面值）, expectCode?, expectHttp? }] }`；字段说明 `{ type, required?, nullable?, example?, enum?, fields?, items? }`，`type` 取封闭集合：string / enum / date / datetime / number / decimal / float / double / integer / int / long / boolean / array / list / object。`response.schema` 描述整体为数组或基本类型的 data。
- 默认只发送 GET / HEAD；写接口标 `UNVERIFIED`（「写接口默认不发送」）；`--allow-write <ids>` 仅在用户于闸门处明确同意后使用。
- 安全：凭证只从 `--auth-file`（权限 600，每行一个 `Header: value`）读，不接受命令行明文，不出现在输出与日志中；不跟随重定向（3xx → `UNVERIFIED`）；发送前校验目标与 `--base-url` 同源。
- 判定顺序：网络错误 → `UNVERIFIED`（附错误原因）；HTTP 401 / 403、HTML 登录页、HTTP 502 / 503 / 504（环境不可用）→ `UNVERIFIED`；2xx 空响应体：接口无响应定义则 `PASS`，否则 `FAIL`；统一响应体 code 属于鉴权码（默认 401、403，`--auth-codes` / `envelope.authCodes` 可覆盖）→ `UNVERIFIED`；code 不在成功码 → `FAIL`；再逐字段比对。
- 结果四态：`PASS` / `PARTIAL`（存在无法核对的字段：空数组、类型未声明或不在封闭集合、错误探针未验证）/ `FAIL` / `UNVERIFIED`。
- 响应体格式从画像读，可被接口定义的 `envelope` 覆盖。
- 可选 `errorProbes`：用字面值覆盖请求参数，核对 HTTP 状态码与 / 或错误码；`expectHttp` 命中时先于鉴权判断生效。
- 退出码：有 `FAIL` → 1；否则 0；参数或输入错误 → 2。

## 8. 验证方案

### 8.1 工具单测（`tests/just-flf/tools/`，`node:test`）

| 工具 | 用例 |
|------|------|
| `state.js` | 各阶段回执校验（缺字段 / 报告缺段 / 机器文件损坏）、`stale` 传递、算分公式与权重、评审员缺失判「无法完成」、`jump` 前置检查、`deliver` 组装 |
| `workspace.js` | 单仓模式、创建提示、多个工作区文件的过滤与选择、`--workspace`、祖先工作区不含当前仓、外层仓内的工作区、元仓库、非仓库根 folders 与 `no_repos`、结构异常 → `fix_workspace`、JSONC、只有 `build.gradle`、带 `package.json` 的 Java 仓、devDependencies 后端框架不计、画像优先、多候选输出 questions（21 条） |
| `scope.js` | 原有脏文件未改 / 已改、已提交越界文件、重命名、中文路径、排除 `.just-flf/`、`--exclude`、目录前缀无尾斜杠、`--files` 可选、`--repo` 非仓根 / 基线不符 → 2、子命令 `--help`（15 条） |
| `conformance.js` | HTML 401 / 2xx HTML → UNVERIFIED、空数组与未知类型 → PARTIAL、DELETE 默认不发送、`--allow-write`、204 空响应、`errorProbes`（含 expectHttp 403、缺期望 → 2）、响应体鉴权码与 `--auth-codes`、`response.schema`、不跟随重定向、502–504、path 不以 `/` 开头 → 2、参数非法 → 2、auth 文件读取 / 缺失 / 不泄露、连接被拒附原因（21 条） |

运行：`node --test tests/just-flf/tools/*.test.js`（Node 22 不接受直接传目录）。2026-10-18 评审中复现的 8 个问题各对应一条回归用例。

### 8.2 角色卡场景测试（`tests/just-flf/scenarios/`）

- 测试工作区：小型前端仓（零依赖 HTML/JS + `node:test`）+ 小型后端仓（Node 原生 `http` + `node:test`，验证非 Java 通用性），可离线运行。
- 每张角色卡至少一个场景；`check.js` 检查：回执通过 `state.js receipt`、报告段落齐全、角色专属断言。

| 角色 | 断言 |
|------|------|
| analyst | 找出预埋的覆盖缺口与需求冲突；接口状态判定正确 |
| api-designer | existing / new 区分正确，existing 带证据；`api-v1.json` 可被 `conformance.js` 读取 |
| fe-architect / be-architect | 产出 `files.txt`；方案引用的接口 id 都存在 |
| fe-developer / be-developer | `scope.js` 越界为 0；无 git 写操作；自验收命令退出码为 0 |
| reviewer | 抓到预埋 critical（缺归属校验）与 minor；干净代码给出高分（检验不编造扣分） |
| verifier | 环境缺失时如实标 unverified，不伪造证据 |
| profiler | 未探测到的项如实标注，不用通用常识填充 |

- 重复次数：reviewer 场景 5 次，其余 3 次；看通过率与结果一致性；自动检查标记的项逐条人工复核。

### 8.3 真实小需求端到端

- 在用户工作区挑一个真实小需求，从 `triage` 跑到 `deliver`。
- 成功信号：回执校验失败经一次重派可恢复；无 git 写操作；编排者未亲自执行分析 / 开发 / 评审；越界判定准确。
- 采集：各阶段子 agent 调用次数、耗时、重派次数、分数分布、闸门干预次数，记入 `docs/CHANGELOG.md`。

## 9. 实施顺序

1. **清理与改名**：`docs/` 与 `todo.md` 移到仓库根 `docs/`，清除内部域名、仓库名、凭证位置描述；`just-fe/` 改名 `just-flf/`；删除 `.DS_Store` 并加 `.gitignore`。（仅改当前文件，git 历史是否重写由用户决定。）
2. **工具**：4 个工具 + 单测。
3. **编排层**：`SKILL.md` + 8 张阶段卡。
4. **执行层**：10 张角色卡 + 5 份清单 + 2 个画像模板。
5. **场景测试**：测试工作区 + 场景 + `check.js`，按结果修订角色卡。
6. **安装与卸载**：重写 `INSTALL.md` / `UNINSTALL.md`；安装时清除 `~/.cursor/skills/just-fe`、`~/.claude/skills/just-fe` 等旧副本与旧 workflow 脚本。
7. **真实试跑**。

## 10. SKILL.md frontmatter 草案

```yaml
---
name: just-flf
description: 当用户要按研发流程开发前端、后端或全栈需求（新页面、新接口、跨模块改动），需要需求梳理、接口梳理确认、方案评审、代码评审打分或本地测试评估时使用；也用于提到 just-flf / 研发流程 / 接口梳理，或续接、恢复中断的流程。改一行文案、修单文件明显 bug 不使用。
---
```

## 11. 非目标

- 不执行任何 git 写操作，不产出合入 / 部署命令。
- 不支持 monorepo、多个后端服务（v1 只支持一个前端仓 + 一个后端仓，或其中之一）。
- 不引入 Team / SendMessage 异步编排。
- 不安装或修改用户 `~/.cursor/agents/`、`.claude/agents/` 下的自定义 agent。
- 不迁移旧版 `MEMORY.md`。

## 12. 风险与待观察

| 风险 | 应对 |
|------|------|
| 子 agent 不按模板落盘或回执不合规 | `state.js receipt` 校验 + 一次重派 + 停下交用户；场景测试覆盖 |
| 画像质量决定评审与门禁质量 | `profiler` 场景测试；画像未探测项如实标注，评审员遇到画像缺项写 `na` 并说明 |
| 清单项过粗或过细导致分数失真 | 场景测试中观察分数分布；`observations` 中反复出现的问题补进清单 |
| 平台子 agent 类型名与并行能力差异（Cursor / Claude Code） | SKILL.md 只给映射规则，类型名以当前工具描述为准 |
| 场景测试成本 | reviewer 5 次、其余 3 次；先跑工具单测再跑场景 |
