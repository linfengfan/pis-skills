# 模式 A 执行手册 · 没有 Workflow 工具时怎么跑每个阶段

> 适用条件：当前会话的工具列表里**没有** `Workflow` 工具（Cursor、旧版 Claude Code、Pro 未开 Dynamic workflows）。有 `Workflow` 工具就用它，不要看这份。

**原则：脚本是唯一真源，本手册只告诉你「去哪取、怎么拼、怎么算」。** 每个阶段开工前先 `Read` 对应的 `scripts/<阶段>-workflow.js`，prompt 原文、schema、报告模板全部从脚本里取，不凭记忆复述。两种模式的产物路径、闸门、评分铁律完全一致——本手册不重复它们，见 SKILL.md。

---

## 通用换算规则

| 脚本里的写法 | 你在模式 A 下的做法 |
|-------------|-------------------|
| `const context = …归一化(args)` | 你自己按 SKILL.md「阶段编排表」把入参凑成一个对象；脚本开头的「前置判定」（缺 `requirement` → `invalid_args` 等）同样由你先判 |
| `agent(prompt, { label, schema })` | 一次 `Agent` 工具调用：`description` = label，`subagent_type` = 当前环境的通用类型（Claude Code 是 `general-purpose`，Cursor 是 `generalPurpose`，以工具描述为准），`prompt` = 脚本拼出的 prompt 原文 + **schema 尾注**（见下） |
| `parallel([...])` | **同一条消息里**发出全部 `Agent` 调用；禁止串行；禁止把 A 维度的结论写进 B 维度的 prompt |
| `(await agent(...)) \|\| {兜底对象}` | 子 agent 没返回可解析的 JSON → 按脚本里 `\|\|` 后面那个兜底对象处理 |
| `log(...)` / `phase(...)` | 忽略；必要时在闸门汇报里一句话带过 |
| `const report = \`…\`` | 照这个模板逐段填写，**段落一个不删**（无内容写「无」），产出落盘用的 Markdown |
| `return { … }` | 把这些字段组成一个对象，写进 `MEMORY.md` 该阶段记录；下一阶段和闸门都读它 |
| `context.timestamp` | 你自己 `date -u +%FT%TZ` 取 |

**schema 尾注**（追加在每个 prompt 末尾，`<schema>` 换成脚本里对应 schema 常量的 JSON 原文）：

```
---
回复末尾输出一个 ```json 代码块，严格符合以下 JSON Schema，不要输出 schema 之外的键：
<schema>
```

**解析**：从子 agent 回复中取**最后一个** ```json 代码块 `JSON.parse`；失败则原样重试该 agent 一次；再失败按兜底对象处理，并在报告「待确认」里注明「<label> 未返回结构化结果」。

---

## 阶段卡

每张卡的字段：**脚本** / **取什么** / **前置判定** / **派几个子 agent、prompt 怎么拼** / **怎么算** / **返回对象**。

### ① 需求梳理 · `scripts/triage-workflow.js`

- **取**：`REQUIREMENT_ANALYSIS_SYSTEM`、`REQUIREMENT_SCHEMA`
- **前置**：`requirement` 空 → 不派 agent，`status='invalid_args'`
- **子 agent ×1**，label `requirement-analysis`。prompt 照脚本 `analysisPrompt` 拼：`REQUIREMENT_ANALYSIS_SYSTEM` + `---` + `## 待分析需求` + （有 `projectContext` 则加 `## 项目上下文`）+ 结尾句「请按结构化格式输出需求分析结果。」+ schema 尾注
- **算**：
  - `blockReason` 非空 → `status='blocked'`
  - `uiChange = analysis.uiChange === true`
  - `designAssets = analysis.designAssets`（过滤空值）
  - `needsDesignInput = uiChange && designAssets.length === 0`
- **返回**：`analysis, uiChange, designAssets, needsDesignInput, pendingQuestions, report, status, nextStep, message`。`uiChange / designAssets / needsDesignInput` 必须写进 MEMORY，设计稿闸门要读

### ② 方案架构 · `scripts/architecture-workflow.js`

- **取**：`ARCHITECTURE_SYSTEM`、`ARCHITECTURE_SCHEMA`
- **前置**：`requirement` 空 → `invalid_args`
- **子 agent ×1**，label `architecture-design`。prompt 照 `designPrompt`：`ARCHITECTURE_SYSTEM` + `---` + `## 待设计需求` + `## 需求梳理结果（如有）`（① 的 `analysis` JSON）+ `## 项目规范（如有）` + 结尾句 + schema 尾注
- **算**：`requirementIssues` 非空 → `status='needs_clarification'`，回 ① 补齐；否则 `ready`
- **返回**：`design, report, status, nextStep, message`。`design.taskCards` 与 `design.fileList` 后面 ④⑥ 要用

### ③ 方案评审 · `scripts/architecture-review-workflow.js`

- **取**：`REVIEW_DIMENSIONS`（6 个键，每个值是含 `{architecture}` `{profile}` 占位的 prompt 模板）、`DIMENSION_SCHEMA`
- **前置**：`architecture` 空 → `invalid_args`，`passed=false`
- **子 agent ×6 并行**，label = 维度键（`requirement-coverage` 等）。每个 prompt = `REVIEW_DIMENSIONS[key]` 把 `{architecture}` 换成方案全文、`{profile}` 换成画像全文（无画像写「无项目画像」）+ schema 尾注
- **算**（注意：本阶段**未返回的维度不计入分母**，与 ⑥ 不同）：
  - 只对返回了结果的维度：`totalScore += score`，`maxTotalScore += maxScore`
  - `finalScore = maxTotalScore > 0 ? round(totalScore / maxTotalScore × 100) : 0`
  - `passed = finalScore >= 80`
  - `issues` = 各维度 `issues` 打平，每条带 `dimension`
  - `maxRounds = 3`
- **返回**：`dimensionResults, totalScore, maxTotalScore, finalScore, passed, conclusion, issues, report, round, maxRounds, nextAction, message`。`passed=false` 时把 `issues` 原文带回 ②

### ④ UI 开发 · `scripts/ui-implementation-workflow.js`

- **取**：`FRONTEND_DEV_SYSTEM`、`UI_DEV_SCHEMA`
- **前置**（两道，都不派 agent）：
  1. `requirement` 空 → `invalid_args`
  2. `figmaUrl` 空 **且** `noDesignReason` 空 → `status='needs_design'`。这只是兜底——按 SKILL.md「设计稿闸门」，你在到这里之前就该问过用户了
- **子 agent ×1**，label `ui-development`。prompt 照 `developmentPrompt`：`FRONTEND_DEV_SYSTEM` + `---` + `## 待开发需求` + `## 设计稿`（有 `figmaUrl` 走「读设计上下文」分支，否则走「无设计稿，用户已确认」分支，两段原文都在脚本 `designSection`）+ `## 任务卡（如有）` + `## 数据来源`（Mock 说明）+ 结尾句 + schema 尾注。这个子 agent **要写文件**，`subagent_type` 必须是有写权限的通用类型
- **算**：`blockReason` 非空 → `blocked`；`outOfScopeChanges` 非空 → 在闸门汇报里点出，⑥ 会复核
- **返回**：`completedFiles, newComponents, modifiedComponents, outOfScopeChanges, defensiveMeasures, issues, blockReason, quality, design, report, status, nextStep, message`。`completedFiles` 写进 MEMORY「需求涉及文件」

### ⑤ 接口联调 · `scripts/api-integration-workflow.js`

- **取**：`FRONTEND_DEV_SYSTEM`、`INTEGRATION_SYSTEM`、`INTEGRATION_SCHEMA`；流程里还有两个小 schema `apiListSchema`、`testSchema` 和三段 prompt `apiListPrompt`、`integrationPrompt`、`testPrompt`
- **前置**：`requirement` 空 → `invalid_args`
- **三个子 agent 串行**（后一个依赖前一个的结果）：
  1. label `api-list`：prompt 照 `apiListPrompt`（需求 + 架构方案接口设计部分）+ `apiListSchema` 尾注。**`pendingCount > 0` → 立即返回 `status='awaiting_apis'`，不进入第 2 步**，停下问用户
  2. label `api-integration`：prompt 照 `integrationPrompt`（`INTEGRATION_SYSTEM` + 需求 + 接口清单 JSON + `## 已有UI代码`）+ `INTEGRATION_SCHEMA` 尾注。要写文件
  3. label `e2e-test`：prompt 照 `testPrompt`（需求 + 已完成联调项 + 4 条验证项）+ `testSchema` 尾注
- **算**：`canProceed = integrationStatus !== 'blocked' && overallStatus !== 'fail'`
- **返回**：`apiList, totalCount, readyCount, pendingCount, completed, pending, issues, completedFiles, outOfScopeChanges, integrationStatus, testResults, overallStatus, blockers, summary(即报告), status, nextStep, canProceed, message`

### ⑥ 代码架构 Review · `scripts/code-arch-review-workflow.js`

- **取**：`REVIEW_DISCIPLINE`、`REVIEW_DIMENSIONS`（7 个键，每个是 `{ maxScore, prompt }`）、`CODE_DIMENSION_SCHEMA`、`DIMENSION_LABELS`
- **前置**：`requirement` 缺失**不阻断**——用脚本里那段「调用方未提供需求描述…」占位文字代替，并在报告基本信息里标「⚠️ 未提供，由评审员从 diff 推断」；`changeScope` 缺失用「请用 git diff 自行确定全部变更范围」；`requirementFiles` 缺失用脚本里的那段「未提供，请从架构方案文件清单…」占位
- **子 agent ×7 并行**，label = 维度键（`logic-correctness` 等）。每个 prompt 严格按脚本第 264～284 行拼：`REVIEW_DISCIPLINE` + `---` + `dim.prompt` 把 `{profile}` 换成画像 + `---` + `## 待评审需求` + `## 变更范围` + `## 需求涉及文件（判断越界改动的基准）` + `## 本维度满分 N 分` + 「输出 JSON：dimension 固定填 "<key>"，maxScore 固定填 N，score 为你给出的得分。」+ schema 尾注
- **算**（注意：本阶段**未返回的维度按 0 分计、分母不变**，结论偏保守）：
  - 每维 `score = min(返回的 score, maxScore)`；未返回 → 0
  - `totalScore = Σscore`，`maxTotalScore = 100`，`finalScore = round(totalScore / 100 × 100)`（= `totalScore`）
  - 所有维度的 `issues` 按 `level` 分三桶：`critical` → `criticalIssues`，`minor` → `minorIssues`，其余 → `tips`；每条带 `dimension` 中文名（查 `DIMENSION_LABELS`）
  - `pendingConfirmations` 打平，前缀 `[维度中文名]`
  - `changeSummary / blastRadius / verificationPoints` 取自 `blast-radius` 维度的返回
  - `hasCritical = criticalIssues.length > 0`
  - `passed = finalScore >= 80 && !hasCritical`
  - `verdict`：`hasCritical` → `finalScore < 60 ? 'rewrite' : 'reject'`；否则 `>= 90` → `merge`，`>= 80` → `conditional`，`>= 60` → `reject`，其余 `rewrite`
  - `maxRounds = 2`
- **返回**：`score, finalScore, totalScore, maxTotalScore, dimensionResults, passed, hasCritical, verdict, verdictReason, changeSummary, criticalIssues, minorIssues, tips, pendingConfirmations, blastRadius, verificationPoints, report, round, maxRounds, nextAction, message`。`passed=false` 时把 `criticalIssues + minorIssues` 原文带回 ④⑤

### ⑦ 测试评估 · `scripts/test-assessment-workflow.js`

- **取**：`E2E_RUNNER_SYSTEM`、`E2E_SCHEMA`、`TEST_ASSESSMENT_SYSTEM`、`TEST_ASSESSMENT_SCHEMA`
- **前置**：`requirement` 缺失不阻断（同 ⑥ 用占位文字）；`acceptanceCriteria` 缺失 → E2E 执行者自行从需求 / triage 报告提取
- **两个子 agent 串行**：
  1. label `e2e-runner`（`skipE2E === true` 时**不派**，直接构造 `e2e` 对象：`framework='skipped'`，每条验收标准 `method='unverified', passed=null`）。prompt 照 `e2ePrompt`：`E2E_RUNNER_SYSTEM` + `---` + `## 待验证需求` + `## 验收标准` + `## 变更范围` + `## 项目画像` + `## 调用方指定的命令`（`e2eCommand / devServerCommand / baseUrl`）+ 结尾句 + `E2E_SCHEMA` 尾注。这个子 agent **要跑命令、可能新增测试文件**
  2. label `test-assessment`。prompt 照 `evaluationPrompt`：`TEST_ASSESSMENT_SYSTEM` + `---` + 需求 + 验收标准 + **`## E2E / 回归取证结果（评分基准，不得推翻）`**（把第 1 步结果按脚本 `evidenceTable` 的格式逐条列出：`[method] ✅/❌/⏳ — criterion / 证据 / 用例`，再列执行过的命令、回归失败项、新增测试文件、发现的 bug、取证阻塞）+ `## 变更范围` + `## 代码变更` + 结尾句 + `TEST_ASSESSMENT_SCHEMA` 尾注
- **算**：
  - `failedCriteria = criteriaResults.filter(passed === false)`，`passedCriteria`（`=== true`），`unverifiedCriteria`（其余）
  - `e2eVeto = failedCriteria.length > 0 || regressionFailures.length > 0`
  - `finalScore` = 评估员给的 `finalScore` 钳到 0～100；没给则 `round(totalScore / maxScore × 100)`
  - `passed = finalScore >= 80 && !e2eVeto`
  - `manualVerificationPoints` = 评估员的 `manualVerificationPoints` + `regressionCoverage.manualVerification` + 每条 unverified 验收标准（前缀「【未验证的验收标准】」）
  - `criticalGaps` = 「验收失败：…」×failed + 「回归失败：…」×regression + 评估员的 `criticalGaps`
  - `maxRounds = 2`
- **返回**：`dimensions, e2e{framework, criteriaResults, passedCount, failedCount, unverifiedCount, regressionFailures, newSpecs, bugsFound, blockers}, totalScore, maxTotalScore, finalScore, passed, e2eVeto, verdictReason, criticalGaps, manualVerificationPoints, report, round, maxRounds, nextAction, message`

---

## 汇总公式速查

| 阶段 | 子 agent | 通过条件 | 一票否决 | 未返回维度 | 最多轮次 |
|------|----------|----------|----------|-----------|----------|
| ③ | 6 并行 | `round(Σscore / Σmax × 100) ≥ 80` | — | 不计入分母 | 3 |
| ⑥ | 7 并行 | `Σscore ≥ 80` 且无 critical | 任一 `level='critical'` | 记 0 分，分母仍 100 | 2 |
| ⑦ | 2 串行 | `finalScore ≥ 80` 且无验收/回归失败 | 任一验收 `passed=false` 或 `regressionFailures` 非空 | — | 2 |

---

## 模式 A 特有的错法

| 错法 | 后果 | 正确做法 |
|------|------|----------|
| 把 6/7 个维度串成一个子 agent 或串行派出 | 后面的维度看到前面的结论，独立性归零 | 同一条消息里并行发出全部 `Agent` 调用 |
| 自己在主上下文里当评审员打一个维度 | 主上下文既是编排者又是评审员，且产物灌满上下文 | 每个维度都派子 agent；主上下文只做汇总 |
| prompt 末尾漏掉 schema 尾注 | 拿回一段散文，无法汇总 | 尾注是必填项；解析不出 JSON 先重试再兜底 |
| 凭记忆复述 `FRONTEND_DEV_SYSTEM` 之类的 prompt | 版本漂移，两个阶段按不同标准执行 | 每次 `Read` 脚本，原文粘贴 |
| 报告模板删段 | 续接时按段落判断产物完整性会误判为残缺 | 无内容写「无」，段落保留 |
| 子 agent 类型选了只读类型去做 ④⑤⑦ | 写不了文件、跑不了命令 | 用通用类型（`general-purpose` / `generalPurpose`） |
| 忘了 `timestamp` 直接落盘 | 报告时间字段是占位文字 | 落盘前 `date -u +%FT%TZ` 填进去 |
