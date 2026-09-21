---
name: just-fe
description: 当用户要开发前端功能、做前端需求分析或方案评审、要求走前端研发流程，或提到 "just-fe / 前端工作流 / 研发流程 / fe-triage / 代码评审打分" 时使用。也用于用户要求从某个阶段（UI开发、接口联调、代码Review、测试评估）续接或恢复中断的前端流程。项目无关。
---

# 前端研发工作流

需求梳理 → 方案架构 → 方案评审 → 页面UI开发 → 接口联调 → 代码架构Review → 测试评估 → 变更说明与提交

**你（读到这里的模型）是编排者。** 7 个阶段各自是一个 Dynamic Workflow 脚本，阶段之间的串联、打回、轮次计数、向用户确认，全部由你在阶段之间完成。Workflow 运行期间不能向用户提问（运行时限制），所以**所有需要用户拍板的事，都发生在你调用下一个 Workflow 之前**。

## 核心流程

```
[入口] 需求输入 / 续接指令 / 用户点名某阶段
   │
   ▼
① 需求梳理 ──▶ ⛩ 闸门 ──▶ ② 方案架构 ──▶ ⛩ 闸门 ──▶ ③ 方案评审
                                                        │ <80 → 打回②，最多3轮
                                                        │ ≥80
                                                        ▼
                                                     ⛩ 闸门
                                                        │
                                          🎨 设计稿闸门（缺设计稿先问用户）
                                                        │
                                                        ▼
④ UI开发（Mock数据） ──▶ ⛩ 闸门 ──▶ ⑤ 接口联调（先清单后联调） ──▶ ⛩ 闸门
                                                                    │
                                                                    ▼
⑥ 代码架构Review ── <80 或有🔴致命 → 打回④⑤，最多2轮
   │ 通过
   ▼
⛩ 闸门 ──▶ ⑦ 测试评估（先跑E2E/回归取证，再打分） ── <80 或验收/回归失败 → 打回②④⑤，最多2轮
              │ 通过
              ▼
           ⛩ 闸门 ──▶ ⑧ 变更说明 → 只 add 本次需求涉及文件 → commit
```

`⛩ 闸门` = 阶段闸门，见下一节。默认每个阶段结束都停下来问用户；用户显式给了 `--auto` 才连续跑。

## 阶段闸门协议（每个阶段结束必做）

一个阶段的 Workflow 返回后，**按顺序做完这四步，才算该阶段结束**：

1. **落盘**：把 `result.report` 写到 `fe-reports/{需求}/<阶段产物>.md`
2. **更新 MEMORY.md**：阶段状态、分数、`current_stage` 改为「本阶段已完成，等待用户确认」
3. **向用户汇报**（不超过 10 行）：产物路径、分数/结论（如有）、待决问题、下一阶段是什么、下一阶段还缺什么输入
4. **提问并等待**：用 AskUserQuestion（或等价的提问工具）问一个问题，选项固定三个：
   - `进入下一阶段（⑤接口联调）`——写清下一阶段名字
   - `本阶段还有调整，继续做`——用户随后给出修改点，你在本阶段内修改、重新落盘、再回到步骤 3
   - `先停在这里`——更新 MEMORY.md 的中断原因与阶段，结束本轮对话

**闸门规则：**
- 用户没有选「进入下一阶段」之前，**禁止调用下一阶段的 Workflow**。「用户没反对」「上一阶段分很高」「产物看起来完整」都不构成进入下一阶段的理由
- 只有 `--auto` 模式跳过闸门；即便如此，遇到 阻断（`blocked` / `needs_design` / `awaiting_apis` / `invalid_args`）、评审打回、达到轮次上限，仍必须停下来问用户
- 用户在闸门处提出的修改，属于「当前阶段」，重跑当前阶段的 Workflow 或直接补做，不要把它算进下一阶段
- 记录用户在闸门处的决定到 MEMORY.md「阶段闸门记录」

## 设计稿闸门（④ UI 开发前必做）

进入 ④ 前，检查 ① 的 triage 结果里 `uiChange` 与 `designAssets`（或 MEMORY.md 的 `design` 字段）：

| 情况 | 你要做的事 |
|------|-----------|
| `uiChange=false` | 用 AskUserQuestion 确认「本需求不涉及界面改动，跳过 UI 开发阶段？」；用户同意 → MEMORY 标记 ④ 为 `⏭ 跳过`，直接进 ⑤ 闸门 |
| `uiChange=true` 且已有设计稿链接 | 把链接作为 `figmaUrl` 传入，MEMORY `design` 记录链接 |
| `uiChange=true` 且没有设计稿 | **先问用户**：「请提供设计稿链接（Figma / 蓝湖 / MasterGo / 截图均可），或明确回复『没有设计稿，按现有页面风格实现』」。拿到链接 → `figmaUrl`；拿到明确的「无设计稿」回复 → 原话作为 `noDesignReason` 传入。两者都没有 → 不调 ④ |

`fe-ui-implementation` 在既无 `figmaUrl` 也无 `noDesignReason` 时会直接返回 `status='needs_design'` 且不启动任何开发 agent——这是脚本层兜底，不是让你依赖它来「顺便问一下」。**问设计稿这一步必须由你在调用前主动完成。**

开发过程中（④⑤）开发 agent 若在报告 `issues` 里写了「需要设计稿」「视觉细节缺失」，同样回到本闸门问用户，不要让它凭想象补。

## 用户点名阶段：跳转优先，状态先同步

用户说「开始代码评审」「进入联调」「跑一下测试评估」，等价于 `--from=对应阶段`。**先同步状态，再执行**：

1. 按下表把用户的话映射到阶段
2. **立刻更新 MEMORY.md**：`current_stage` 改为目标阶段；之前未标完成的阶段按实际情况标为 `✅ 用户确认完成` 或 `⏭ 用户跳过`（问一句即可，不要替用户决定）
3. 按「续接协议」检查目标阶段所需的前置产物；缺失就读磁盘/问用户补齐，**不重跑用户已确认完成的阶段**
4. 调用目标阶段的 Workflow

| 用户的话（举例） | 阶段 |
|------|------|
| 梳理需求 / 分析一下需求 / triage | ① |
| 出方案 / 做架构设计 / 拆任务卡 | ② |
| 评审方案 / 方案打分 | ③ |
| 开始开发 / 写页面 / 做 UI / 画界面 | ④ |
| 接接口 / 联调 / 接口清单 | ⑤ |
| 代码评审 / Review / 审一下代码 / 代码打分 | ⑥ |
| 测试评估 / 跑测试 / E2E / 验收 | ⑦ |
| 写变更说明 / 提交 / commit | ⑧ |

**汇报时的阶段名必须来自 MEMORY.md 的 `current_stage`**，不是你记忆里的上一阶段。每次向用户汇报前先读一次 MEMORY.md；发现不一致，先改 MEMORY.md 再开口。

## 各阶段的执行方式（不要调用不存在的 Skill）

本 Skill **不依赖任何名为「前端开发工程师」「前端架构师」「需求梳理分析师」「代码审核者」「测试评估专家」的外部 Skill 或 Agent**。这些只是各脚本内联 prompt 里的角色名。`Skill(前端开发工程师)` 这类调用是错误的，会得到 `Unknown skill`。

先判定运行模式，再按表执行：

| 模式 | 判定 | 每个阶段怎么跑 |
|------|------|--------------|
| **B/C · Workflow 可用** | 输入 `/` 能补全出 `fe-triage` 等 7 个命令，或 Workflow 工具调用 `fe-triage` 不报 `Unknown workflow` | 用 Workflow 工具调用下表的 `fe-*` 名称，**带齐入参** |
| **A · 只装了 Skill** | 上述命令不存在 | 读 `scripts/<阶段>-workflow.js`，把其中的 system prompt 常量（如 `FRONTEND_DEV_SYSTEM`）连同「主流程」里拼装的入参，交给一个子 agent（Task/Agent 工具）执行；脚本里的 JS 汇总逻辑（加权、判定、报告拼装）由你手工完成。打分类阶段（③⑥⑦）的多维度要**同一批并行**派出多个子 agent，每个只负责一个维度 |

两种模式下产物路径、闸门、评分铁律完全一致。模式 A 下 `parallel()` 的隔离性靠你手工保证：不要把一个维度的结论喂给另一个维度的评审员。

## 阶段编排表（入参必须带齐）

**没有总编排脚本。** 每次调用前从磁盘读上游产物作为入参；**不要空参调用**——脚本对空参只会返回 `status='invalid_args'`（或从 diff 推断并降低置信度），不会替你去读文件。

| 阶段 | Workflow 名称 | 必带入参（来源） | 可选入参 | 返回值判读 |
|------|---------------|----------------|----------|-----------|
| ①需求梳理 | `fe-triage` | `requirement`（需求原文） | `projectContext`（fe-profile 全文） | `status==='blocked'` 停下问用户；记录 `uiChange` / `designAssets` / `needsDesignInput` 到 MEMORY |
| ②方案架构 | `fe-architecture` | `requirement`、`requirementAnalysis`（① 的 `analysis`） | `projectContext` | `status==='needs_clarification'` 回①补齐 |
| ③方案评审 | `fe-architecture-review` | `architecture`（architecture-{日期}.md 全文）、`round` | `profile` | `passed===false` 带 `issues` 回②，`round+1`，最多 3 轮 |
| ④UI开发 | `fe-ui-implementation` | `requirement`、`figmaUrl` **或** `noDesignReason`（设计稿闸门产出） | `taskCards`（② 的任务卡） | `status==='needs_design'` 回设计稿闸门；`blockReason` 非空停下 |
| ⑤接口联调 | `fe-api-integration` | `requirement`、`architecture`、`uiCompleted`（④ 报告全文或改动文件清单） | — | `status==='awaiting_apis'` 停下等接口就绪，问用户 |
| ⑥代码Review | `fe-code-arch-review` | `requirement`、`changeScope`（如 `git diff main...HEAD`）、`round` | `projectContext`、`requirementFiles`（②文件清单 + ④⑤ `completedFiles`，用于判越界改动） | `passed===false` 带 `criticalIssues`+`minorIssues` 回④⑤，`round+1`，最多 2 轮 |
| ⑦测试评估 | `fe-test-assessment` | `requirement`、`acceptanceCriteria`（① 的验收标准）、`changeScope`、`round` | `projectContext`（含 e2e/test 门禁命令）、`e2eCommand`、`devServerCommand`、`baseUrl`、`skipE2E` | `passed===false` 回②④⑤，`round+1`，最多 2 轮；`e2eVeto===true` 时先修失败项 |

单阶段调用形态：

```javascript
const result = await workflow('fe-code-arch-review', {
  requirement: '<triage 报告「一句话目标」+ 验收标准>',
  changeScope: 'git diff main...HEAD',
  projectContext: '<.claude/fe-profile.md 全文>',
  requirementFiles: ['src/views/Detail.vue', 'src/api/favorite.ts'],
  round: 1,
})
// result.passed / result.finalScore / result.criticalIssues / result.report
```

### 完整流程的编排步骤

1. 读 `.claude/fe-profile.md`；不存在则先按 `references/项目画像初始化.md` 生成（这一步也要过闸门，用户确认后写盘）
2. 在 `fe-reports/{需求}/` 下用 `MEMORY.md` 建流程状态（模板即本目录的 `MEMORY.md`），`gate_mode` 记 `gated`（默认）或 `auto`
3. 依次执行 ①~⑦，**每个阶段结束走完「阶段闸门协议」四步**
4. ④ 之前过「设计稿闸门」
5. 遇到 `passed===false`：把 `issues` / `criticalIssues` 原文带回打回目标阶段，轮次 +1；达轮次上限停下交人工
6. ⑦ 通过并过闸门后，按 `templates/变更日志模板.md` 写 `change-{日期}.md`；`git add` **只加本次需求涉及的文件**（对照 ④⑤ 的 `completedFiles`），再 commit

### 续接与断点恢复

同样没有 resume 脚本，手工续接：

1. 读 `fe-reports/{需求}/MEMORY.md` 定位 `current_stage`、已完成轮次、闸门记录
2. 按「产物查找规则」逐个确认前置产物存在且完整
3. 把已有产物读成字符串，作为目标阶段 Workflow 的入参
4. 从目标阶段继续；不重跑已通过的阶段，不重问已澄清的维度

```
/just-fe --from=⑥                    # 读①~⑤产物 → 直接调 fe-code-arch-review
/just-fe --from=⑤ --需求="商品详情页"   # 读①~④产物 → 直接调 fe-api-integration
/just-fe --resume                    # 读 MEMORY.md 定位断点后按上述步骤续接
/just-fe --auto <需求>                # 不设闸门连续跑；阻断/打回/达上限仍会停
```

### 产物查找规则

| 阶段 | 产物路径 |
|------|----------|
| ①需求梳理 | `fe-reports/{需求}/triage-{日期}.md` |
| ②方案架构 | `fe-reports/{需求}/architecture-{日期}.md` |
| ③方案评审 | `fe-reports/{需求}/arch-review-{日期}.md` |
| ④UI开发 | `fe-reports/{需求}/ui-{日期}.md` |
| ⑤接口联调 | `fe-reports/{需求}/api-list-{日期}.md`、`integration-{日期}.md` |
| ⑥代码Review | `fe-reports/{需求}/code-arch-review-{日期}.md` |
| ⑦测试评估 | `fe-reports/{需求}/test-assessment-{日期}.md` |
| ⑧完成 | `fe-reports/{需求}/change-{日期}.md` |

产物存在且完整 → 直接进入该阶段；存在但不完整 → 从该阶段重新开始；不存在 → 回溯到前置阶段。

## 评分铁律

- 方案评审 < 80 分 → 打回重写（最多 3 轮）
- 代码架构Review < 80 分 → 打回开发（最多 2 轮）
- 代码架构Review 出现任一 🔴 致命问题 → **一票否决，与总分无关**
- 测试评估 < 80 分 → 打回架构和开发（最多 2 轮）
- 测试评估中任一验收标准 E2E 失败、或既有测试回归失败 → **一票否决，与总分无关**
- 未能自动验证（`unverified`）的验收标准不算覆盖，必须列进「人工验证清单」，合并前逐条确认

打分口径统一见 `templates/评分协议.md`。反向铁律同样成立：**找不到真实问题时必须如实给高分**，禁止为了显得严格而编造扣分项。

## 编排纪律

1. **入口不干活** —— 只路由和协调，实现/评审在各 Workflow（或模式 A 的子 agent）执行
2. **闸门必停** —— 每个阶段结束向用户汇报并提问，用户点头才进下一阶段；`--auto` 是唯一例外
3. **产物落盘先行** —— 先落盘、再更新 MEMORY、再汇报
4. **状态以 MEMORY 为准** —— 汇报的阶段名取自 `current_stage`；用户点名阶段先改 MEMORY 再执行
5. **设计稿先问** —— 涉及界面改动、没有设计稿链接，不进 ④
6. **入参带齐** —— 不空参调用 Workflow；上游产物从磁盘读成字符串传入
7. **变更边界** —— 开发 agent 只改需求涉及文件；提交时只 add 这些文件；Review 把越界格式化/重构当问题记
8. **不重复澄清** —— 已澄清维度引用记录，不重问
9. **清单先行** —— 接口联调必须先产出清单，有了清单再开发
10. **评分铁律** —— 不到线必须打回，不允许妥协；致命/验收失败一票否决

## 红旗清单：出现这些念头立刻停下

| 念头 | 真相 |
|------|------|
| 「调用 `Skill(前端开发工程师)` 让它写代码」 | 不存在这个 Skill。用 Workflow `fe-ui-implementation`，或模式 A 下带 `FRONTEND_DEV_SYSTEM` 派子 agent |
| 「上一阶段分很高，直接进下一阶段」 | 闸门没过。先汇报、再提问、等用户选 |
| 「用户说开始评审了，我先把 UI 阶段收个尾」 | 用户点名了阶段。先改 MEMORY `current_stage`，再问 ④⑤ 算完成还是跳过 |
| 「没设计稿就按现有风格来吧」 | 这是用户的决定。先问，拿到链接或明确的「无设计稿」原话再进 ④ |
| 「直接 `/fe-code-arch-review` 跑一下」 | 空参会失败或降置信度。从磁盘读 requirement / changeScope / round 再调 |
| 「顺手把这个文件格式化一下」 | 越界改动。开发 agent 只改需求涉及文件，Review 会把它记成问题 |
| 「测试评估看代码就能打分」 | 先跑 E2E/回归取证。没有工具证据的验收标准只能算 unverified |
| 「汇报时说『当前在 UI 开发阶段』」 | 先读 MEMORY.md 的 `current_stage`，不凭记忆 |

## 配套资源

阶段执行时按需读取，不要凭记忆编造格式：

| 资源 | 何时读 |
|------|--------|
| `MEMORY.md`（本目录） | 建流程状态时复制为 `fe-reports/{需求}/MEMORY.md` |
| `templates/项目画像模板.md` | 生成 `.claude/fe-profile.md` 时 |
| `templates/需求梳理报告模板.md` | ①落盘 `triage-{日期}.md` 时 |
| `templates/架构方案模板.md` | ②落盘 `architecture-{日期}.md` 时 |
| `templates/评分协议.md` | ③⑥⑦打分前，统一扣分口径 |
| `templates/变更日志模板.md` | ⑧落盘 `change-{日期}.md` 时 |
| `references/项目画像初始化.md` | 项目画像缺失，需要探测技术栈与门禁命令时 |
| `references/需求分诊.md` | ①需要六维度澄清清单与六关筛选口径时 |
| `references/前端功能团队.md` | 中大型改动想用四角色并行分析加强②时（可选增强） |
| `scripts/*-workflow.js` | 模式 A 下需要取出各阶段 system prompt 与汇总逻辑时；模式 B/C 下不需要读 |
