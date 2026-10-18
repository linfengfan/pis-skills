---
name: just-fe
description: 当用户要开发前端、后端或全栈功能，做需求分析、接口契约、方案评审，要求走研发流程，或提到 "just-fe / 研发流程 / 契约 / 代码评审打分" 时使用。也用于从某个阶段续接或恢复中断的流程。适用于一个前端仓 + 一个后端仓 + 一个会话区、后端经部署闸门发布到 dev 环境再联调的团队工作区；纯前端需求自动退化为单泳道。与 just-flf 是两套独立流程，不要同时安装。改一行文案、修一个单文件明显 bug 不用本 Skill，直接改。
---

# 全栈研发工作流（just-fe）

⓪ 工作区确认 → ① 需求梳理 → ② 契约 → ② 方案（fe / be）→ ③ 方案评审（fe / be）→ ④ 开发（fe UI / be 接口）→ 🚀 部署闸门 → ⑤ 契约校验 + 联调 → ⑥ 代码 Review（每仓）→ ⑦ 测试评估（每仓）→ ⑧ 变更说明 + 提交清单

**你（读到这里的模型）是编排者。** 每个阶段是一张可执行的阶段卡（`stages/*.md`）：读它、按它拼 prompt、派子 agent、按它的公式汇总、按它的模板落盘。阶段之间的串联、打回、轮次、两条泳道的对齐、向用户确认，全部由你在阶段之间完成。**阶段卡是唯一真源，不要凭记忆执行**。

**流程不执行任何 git 写操作**。`add` / `commit` / `merge` / `push` 全部由用户做；你只产出清单和命令。

## 核心流程

```
⓪ 工作区确认（tools/workspace-detect.js → report_dir / repos[] / scope / source / dev 网关）─▶ ⛩
   │
① 需求梳理 ─▶ ⛩（决策卡逐张拍板）
   │  stackScope: fe | be | fullstack · route: light | full | blocked · 接口三态 existing / new / change
   │  有 new / change 且后端仓 readonly → 停下问用户
   ▼
② 契约设计 + ③a 契约评审（有接口才跑；<80 打回升版本，最多 2 轮）─▶ ⛩  contract-v{N}
   ├───────────────┬───────────────┐
   ②-FE 方案       ②-BE 方案       ← 并行，契约是接口唯一真源
   ③-FE 评审 6 维   ③-BE 评审 6 维   ← <80 回对应 ②，最多 3 轮
   └───────────────┴───────────────┘
   ⛩ 一道闸（两泳道都过）；scope 到此的在此停
   ├───────────────┬───────────────┐
   🎨 设计稿闸门     （无）
   ④-FE UI 开发     ④-BE 接口开发（必须有契约测试，本地 compile / spotless / test 过）
   └───────────────┴───────────────┘
   🚀 部署闸门：先给后端待提交清单（用户在特性分支提交），再给「合入 dev 并 push」命令、会触发的流水线、
   │  需先执行的 DDL 与需配置的网关路由；用户执行后回复「已部署」+ gatewayUrl（凭证写本地文件，不贴对话）
   │
⑤ tools/contract-conformance.js 对 dev 网关逐接口校验（默认只发只读请求）→ 联调 agent 换真接口
   │  任一 FAIL → 不进 ⑥，后端修实现或契约升版本
   ▼
⑥ 代码 Review：tools/out-of-scope.sh 算越界（排除 ④ 开工前已有的改动）→ 每仓 7 维并行；两仓都 ≥80 且无 🔴
   ▼
⑦ 测试评估：每仓先取证再打分；fe E2E 打 dev 网关，be 单测 + 契约测试；验收 / 回归 / 契约测试失败一票否决
   ▼
⑧ change-{日期}.md：每仓「建议 add 的文件 + 越界文件 + 建议 message + 合入命令」。流程结束，提交由用户决定
```

`⛩` = 阶段闸门。默认每个阶段结束都停下来问用户；`--auto` 才连续跑，但阻断 / 打回 / 达轮次上限 / 设计稿 / 部署 / 后端权限这几类仍必停。

`stackScope=fe` 且后端仓 `readonly`：契约阶段退化为「勘察 + 复用清单」，BE 泳道、部署闸门、be 的 ⑥⑦ 全部标 `⏭ 不适用`。`route=light` 与 `stackScope=be` 的走法见下文「lite 档与纯后端需求」。

## ⓪ 工作区确认（① 之前，只做一次）

1. Bash：`node <本 Skill>/tools/workspace-detect.js <.code-workspace 或父目录> --requirement <需求短名>`
2. 把 `nextQuestions` 一次性问用户：后端仓本次**可写还是只读参考**、`scope`（本期做到哪）、`source`（需求来源优先级）、脏工作区确认
3. 以 `MEMORY.md`（本目录）为模板建 `<report_dir>/MEMORY.md`，写入 `report_dir / scope / source / repos[] / env.dev.gatewayUrl / paradigm`。`report_dir` 默认 `<会话区>/新需求/<需求短名>/`
4. 缺画像的仓库先走 `references/项目画像初始化.md`（fe-profile / be-profile 都要过闸门）

之后所有阶段的仓库路径、分支、base、画像、网关地址都从 MEMORY 读，不再问。

## 阶段闸门协议（每个阶段结束必做）

1. **落盘**：报告写到 `<report_dir>/<泳道子目录>/<产物>.md`（路径见「产物查找规则」）
2. **更新 MEMORY.md**：阶段状态、分数、`current_stage` 改为「本阶段已完成，等待用户确认」
3. **汇报**（≤10 行）：产物路径、分数 / 结论、待决问题（① 是决策卡）、下一阶段是什么、还缺什么输入
4. **提问并等待**：三选一——`进入下一阶段（写清名字）` / `本阶段还有调整` / `先停在这里`

闸门规则：用户没选「进入下一阶段」前禁止执行下一阶段；闸门处的修改属于当前阶段；记录用户决定到 MEMORY「阶段闸门记录」；① 的决策卡裁定记到「决策卡裁定」，下游只认那里的结论。

## 三道特殊闸门

| 闸门 | 何时 | 你要做的事 |
|------|------|-----------|
| 🎨 设计稿 | ④-FE 之前 | 读 ① 的 `uiChange` / `designAssets`。`uiChange=false` → 问用户是否跳过 ④-FE；有链接（Figma / 蓝湖 / 在线原型 / 截图）→ 作 `designUrl` 传入，在线原型可先下载源码走查并落 `prototype-interactions-{日期}.md`；没有 → **先问用户**要链接或明确的「无设计稿，按现有风格」原话作 `noDesignReason`。两者都没有不进 ④-FE |
| 🔐 后端权限 | ① 返回 `needsBackendWrite=true` 而 MEMORY `repos[be].mode=readonly` | 停下问用户：改为可写（本流程实现）还是保持只读（契约只定义、交后端团队，BE 泳道不启动） |
| 🚀 部署 | ④-BE `completed` 之后、⑤ 之前 | 开发 agent 不提交，所以合入前必须先提交。依次给用户：① **待提交清单**——④-BE 的 `completedFiles`（先用 `tools/out-of-scope.sh` 核对，越界文件建议先回退）与建议 commit message，请用户在特性分支 `repos[be].branch` 上提交；② **合入命令** `git checkout <base> && git merge --no-ff <branch> && git push origin <base>` 与「会触发的流水线」清单（来自 MEMORY `be_modules` 与流水线表）；③ **部署前置**——④-BE 报告里的 DDL / 迁移脚本需要先在 dev 库执行，契约里 `needsGatewayRoute` 的接口需要先配置网关路由。**你不执行任何一步**。用户回复「已部署」+ `gatewayUrl` 后写 MEMORY `deploy` / `env.dev`；鉴权请用户写进本地文件（如 `~/.just-fe/auth`，每行一个 `Header: value`，权限 600），MEMORY 只记文件位置，不让用户把 token 贴进对话。然后跑 ⑤ 的校验脚本 |

## 打回回路

- ⑥ 打回 → 对应 ④ 只修汇总里的问题 → 重跑 ⑥。
- ⑦ 打回 → 对应 ④（缺口源于方案则回 ②-方案）→ **必须重跑 ⑥** → 再跑 ⑦。修复不能绕过代码评审。
- 后端在 ⑤ / ⑥ / ⑦ 之后又改了代码 → 重新走 🚀 部署闸门（提交、合入、部署）→ 重跑 ⑤ 的校验脚本，再继续。
- 契约升版本（v{N} → v{N+1}）→ 已完成的 ②-方案、④、⑤ 按新契约复核：受影响的泳道重跑对应阶段，或由用户在闸门处明确确认沿用；两泳道的 ④ 都要拿到新版契约。

## lite 档与纯后端需求

- **`route=light`**：跳过 ②③（不出契约、不出方案）。④ 照常；⑥ 用 `stages/08-code-review.md`，但只派 **1 个**评审员（label `<lane>-all`）：prompt 里依次放入 7 个维度的正文与检查清单，要求输出 7 个 `CODE_DIMENSION_SCHEMA` 对象组成的 JSON 数组（顺序与维度一致），汇总公式与一票否决不变；⑦ 只派取证 agent（子 agent 1），不派评估员、不打分，按一票否决规则判定通过与否，`unverified` 照常进人工清单；然后 ⑧。
- **`stackScope=be`**：没有前端泳道，跳过 🎨 与 ④-FE。部署后 ⑤ 只跑第一步契约校验脚本，不派联调 agent；有 FAIL 同样不进 ⑥。⑥⑦ 只跑 be。

## 用户点名阶段：跳转优先，状态先同步

用户说「开始代码评审」「出契约」「跑测试」等价于 `--from=对应阶段`。先改 MEMORY `current_stage`，中间未完成的阶段问一句标「✅ 用户确认完成」或「⏭ 用户跳过」，按「产物查找规则」补前置产物，再执行目标阶段。**汇报时的阶段名必须来自 MEMORY `current_stage`**。

| 用户的话 | 阶段卡 |
|------|------|
| 梳理需求 / 分析需求 / triage | `stages/01-triage.md` |
| 出契约 / 定接口 / 接口清单 | `stages/02-contract.md` |
| 出方案 / 做架构 / 拆任务卡（说清前端还是后端） | `stages/03-architecture.md` |
| 评审方案 / 方案打分 | `stages/04-architecture-review.md` |
| 开始开发 / 写页面 / 画界面 | `stages/05-ui-implementation.md` |
| 写接口 / 后端开发 / 建表 | `stages/06-be-implementation.md` |
| 部署好了 / 已合 dev | 🚀 → `stages/07-api-integration.md` |
| 联调 / 接接口 / 跑契约校验 | `stages/07-api-integration.md` |
| 代码评审 / Review / 代码打分 | `stages/08-code-review.md` |
| 测试评估 / 跑测试 / E2E / 验收 | `stages/09-test-assessment.md` |
| 写变更说明 / 提交清单 | ⑧（无卡，见下） |

## 阶段编排表（入参带齐，不空参执行）

各阶段的完整入参、前置判定、子 agent 组成、schema、汇总公式、报告模板在阶段卡里，下表只是索引。所有报告落盘前用 `date -u +%FT%TZ` 填时间字段。

| 阶段 | 阶段卡 | 关键入参（来源） | 返回值判读 |
|------|--------|----------------|-----------|
| ① | `stages/01-triage.md` | `requirement`；`paradigm`、两仓画像、`repos` | `blocked` 停；记 `stackScope / route / apiNeeds / needsBackendWrite / uiChange / designAssets / decisionCards / acceptanceCriteria` |
| ② 契约 | `stages/02-contract.md` | + `apiNeeds`、`beMode`、`version`、`round`；重评带 `previousContract` + `issues` | `no_api` 直接进方案；`passed=false` 带 `issues` 重跑（≤2）；记 `contract_version / be_modules`；落 `contract-v{N}.md` + `contract-review-v{N}.md` |
| ② 方案 | `stages/03-architecture.md` | + `lane`、`contract`；打回带 `reviewIssues` | `needs_clarification` 回①；`requirementFiles` 记 MEMORY 对应仓 |
| ③ 评审 | `stages/04-architecture-review.md` | + `architecture`、`lane`、`round` | `passed=false` 带 `issues` 回 ②-方案（≤3） |
| ④-FE | `stages/05-ui-implementation.md` | + `designUrl` 或 `noDesignReason`、`contract`、`mockPlan`、`taskCards` | `needs_design` 回设计稿闸门；`completedFiles` 记 MEMORY fe |
| ④-BE | `stages/06-be-implementation.md` | + `contract`、`contractJson`、`modules` | `needs_contract` 先跑契约；`incomplete` 修后重跑；`completed` → 部署闸门 |
| ⑤ | `stages/07-api-integration.md` | 先 Bash 跑 `tools/contract-conformance.js`，再 + `conformanceResult` | `contract_mismatch` 不进 ⑥；`canProceed` 才进 ⑥ |
| ⑥ | `stages/08-code-review.md` | 先 Bash 跑 `tools/out-of-scope.sh`，再 + `lane`、`changeScope`、`round` | `passed=false` 带 critical + minor 回对应 ④（≤2）；两仓都过才进 ⑦ |
| ⑦ | `stages/09-test-assessment.md` | + `lane`、`acceptanceCriteria`、`changeScope`；fe 加 `gatewayUrl`，be 加 `contractJson` | `veto=true` 先修失败项；`passed=false` 回对应 ④ 或 ②（≤2） |
| ⑧ | 无卡 | 照 `templates/变更日志模板.md` 写 `change-{日期}.md` | **不执行 git 写操作** |

## 续接与断点恢复

1. 读 `<report_dir>/MEMORY.md` 定位 `current_stage`、泳道状态、轮次、闸门记录、决策卡裁定
2. 按「产物查找规则」确认前置产物存在且完整（段落齐全）
3. 把已有产物读成字符串作为目标阶段入参；从目标阶段继续，不重跑已通过的阶段，不重问已裁定的决策卡

```
/just-fe --from=⑥ --lane=be        # 读契约、be 方案、be 开发报告 → 跑 out-of-scope → 08 卡
/just-fe --from=⑤                  # 读契约 → 跑 conformance → 07 卡
/just-fe --resume                  # 读 MEMORY 定位断点
/just-fe --auto <需求>              # 不设普通闸门；特殊闸门仍停
```

## 产物查找规则（相对 report_dir）

| 阶段 | 产物 |
|------|------|
| ⓪ | `MEMORY.md` |
| ① | `triage-{日期}.md`；原型走查 `prototype-interactions-{日期}.md` |
| ② 契约 | `contract-v{N}.md`、`contract-review-v{N}.md` |
| ②③ 方案 | `fe/architecture-{日期}-r{轮次}.md`、`fe/arch-review-{日期}-r{轮次}.md`；`be/…` 同 |
| ④ | `fe/ui-{日期}-r{轮次}.md`、`fe/baseline-status.txt`；`be/impl-{日期}-r{轮次}.md`、`be/baseline-status.txt` |
| ⑤ | `conformance-{日期}-r{轮次}.json`、`integration-{日期}-r{轮次}.md` |
| ⑥ | `fe/code-review-{日期}-r{轮次}.md`；`be/code-review-{日期}-r{轮次}.md` |
| ⑦ | `fe/test-assessment-{日期}-r{轮次}.md`；`be/test-assessment-{日期}-r{轮次}.md` |
| ⑧ | `change-{日期}.md` |

`{轮次}` 是该阶段在本需求里的第几次执行（打回重跑 +1），这样同一天的多轮产物不会互相覆盖。同一阶段有多个文件时取日期最新、轮次最大的；旧版没有 `-r{轮次}` 的文件名视为 `r1`，照常识别。

存在且完整 → 直接进入该阶段；存在但不完整 → 从该阶段重新开始；不存在 → 回溯前置阶段。

## 评分铁律

- 契约评审 / 方案评审 / 代码 Review / 测试评估 均 **80 分红线**，不到线必须打回，轮次见 `references/评分口径.md`
- 并行评审员必须**全部返回**才算分：缺失的维度原样重派一次，仍缺失则本轮判「无法完成」，停下交用户，不计分
- 代码 Review 任一 🔴 critical → 一票否决；fullstack 两仓都要过
- 测试评估任一验收标准取证失败 / 既有测试回归失败 / 契约测试失败 → 一票否决
- 联调前契约校验任一 FAIL → 不进 ⑥
- `unverified` 不算覆盖，进「人工 / 联调环境验证清单」，提交前逐条确认
- 反向铁律：找不到真实问题必须如实给高分，禁止编造扣分项

## 编排纪律

1. **入口不干活**——只路由、协调、汇总；分析 / 设计 / 开发 / 评审在子 agent 里
2. **闸门必停**——`--auto` 只跳过「一切正常时的点头」，特殊闸门与打回仍停
3. **产物落盘先行**——先落盘、再更新 MEMORY、再汇报
4. **状态以 MEMORY 为准**——仓库路径 / 分支 / 画像 / 网关 / 契约版本 / 决策卡裁定全部从 MEMORY 读
5. **契约先行**——有接口的需求先过契约评审再出方案；契约改动升版本重评，两泳道的 ④ 都要收到变更通知
6. **确定性检查用脚本**——越界改动、契约符合性、工作区探测都跑 `tools/`，不让 agent 猜
7. **变更边界**——开发 agent 只改需求涉及文件；越界文件在 ⑧ 单列为「建议先回退」
8. **提交权归用户**——任何阶段不 `git add / commit / merge / push`；部署闸门只产出命令
9. **设计稿先问**——涉及界面改动、没有设计稿链接，不进 ④-FE
10. **不重复澄清**——已裁定的决策卡引用 MEMORY，不重问

## 红旗清单：出现这些念头立刻停下

| 念头 | 真相 |
|------|------|
| 「凭记忆按 7 个维度评审一下」 | 维度真源在阶段卡。先 `Read` 对应阶段卡，照它的维度与公式来 |
| 「上一阶段分很高，直接进下一阶段」 | 闸门没过。先汇报、再提问、等用户选 |
| 「后端仓是只读的，我先把接口定义放到前端方案里」 | 接口不属于方案，属于契约。先过 🔐 后端权限闸门，契约照出，只是不实现 |
| 「契约差一个字段，我在前端做个兼容」 | 契约是真源。FAIL 的接口保留 Mock，后端修或契约升版本，不做前端补丁 |
| 「后端起不来，我本地装个 MySQL 跑一下」 | 不可本地运行就标 `unverified`，等 dev 环境 |
| 「代码写完了，顺手 commit 一下」 | 提交权归用户。只写 `change-{日期}.md` 的清单 |
| 「合入 dev 触发部署，我来 push」 | 部署闸门只产出命令。用户执行 |
| 「越界改动我看一眼 diff 就知道」 | 跑 `tools/out-of-scope.sh`，结果喂给 ⑥ |
| 「没设计稿就按现有风格来吧」 | 用户的决定。先问，拿到链接或「无设计稿」原话再进 ④-FE |
| 「决策卡太多，我挑几个重要的问」 | 全部汇报，用户决定哪些现在拍、哪些按建议默认走；裁定写 MEMORY |
| 「子 agent 连番报错，我自己在主上下文做吧」 | 参数错 ≠ 工具不可用。查 `references/运行时排错.md` 改一次；仍失败停下交用户 |
| 「汇报时说『当前在 UI 开发阶段』」 | 先读 MEMORY `current_stage`，不凭记忆 |

## 配套资源

| 资源 | 何时读 |
|------|--------|
| `MEMORY.md`（本目录） | ⓪ 建 `<report_dir>/MEMORY.md` 时 |
| `stages/01~09-*.md` | 每个阶段执行前**必读**，按卡执行 |
| `roles/fe-dev.md` | ④-FE 与 ⑤ 拼 prompt 时（两卡共用的人设，不复制副本） |
| `tools/workspace-detect.js` | ⓪ |
| `tools/contract-conformance.js` | ⑤ 之前 |
| `tools/out-of-scope.sh` | ⑥ 之前，每仓一次 |
| `templates/项目画像模板.md` / `templates/后端画像模板.md` | 生成 fe-profile / be-profile 时 |
| `templates/变更日志模板.md` | ⑧ 写 `change-{日期}.md` |
| `references/评分口径.md` | ③⑥⑦ 打分前统一口径 |
| `references/项目画像初始化.md` | 画像缺失 |
| `references/需求分诊.md` | ① 的 route / stackScope 判定与范式接入 |
| `references/运行时排错.md` | 子 agent 参数形态、schema 尾注、并行规则、报错对照 |
