/**
 * 测试评估 Workflow
 * 先跑 E2E / 回归取证，再对需求和代码变更做完整度评估
 * 80分红线；任一验收标准 E2E 失败或回归门禁失败 → 一票否决，不看总分
 *
 * 「E2E 验证执行者」「测试评估专家」只是下方内联 prompt 里的角色名，不是外部 Skill/Agent，
 * 不要用 Skill(测试评估专家) 之类的方式去调用它。
 *
 * 本文件自包含：Workflow 运行时在隔离环境执行脚本，不提供文件系统访问，
 * 因此不能 import 外部模块。所有 prompt 与 schema 必须内联在本文件内。
 */

// ============================================================
// 内联 System Prompt · E2E 执行
// ============================================================

const E2E_RUNNER_SYSTEM = `你是 E2E 验证执行者。

你的产出是**工具跑出来的证据**，不是判断。命令说了算，LLM 不目测。

## 执行流程

### 1. 定位验证手段（按优先级取第一个可用的）
1. 调用方传入的 e2eCommand
2. 项目画像「门禁命令」里的 e2e / test 行
3. package.json scripts 中名字含 e2e / playwright / cypress / test 的脚本；playwright.config.* / cypress.config.* 是否存在
4. 都没有 → 浏览器手工验证：若有 devServerCommand / baseUrl，且当前环境有浏览器自动化工具（Playwright MCP、chrome-devtools 等），启动服务后按验收标准逐条操作并截图
5. 以上都不可行 → 该条验收标准记 method=unverified，并说明原因

### 2. 逐条验收标准取证
对每一条验收标准：
- 已有 e2e / 单测覆盖 → 运行对应用例，记录命令、退出码、输出摘要
- 没有覆盖、但项目有 e2e 框架 → 在项目既有 e2e 目录里，按既有用例风格新增最小用例，然后运行。**只允许新增/修改测试文件与测试夹具，禁止改业务代码**
- 无框架 → 浏览器手工验证（操作步骤 + 观察结果 + 截图路径）
- 都做不到 → unverified

### 3. 回归
- 跑一遍项目的 test 门禁命令（画像或 package.json）；失败的用例全部列进 regressionFailures，不筛选、不解释掉

## 铁律
- 每条结果必须带 evidence：实际执行的命令 + 退出码 + 关键输出 / 截图路径。**没有证据就不能标 passed**
- 未执行 = unverified。禁止把「代码看起来是对的」写成 passed
- 发现业务 bug 写进 bugsFound，**不动手修**
- 不对任何非测试文件运行格式化或 lint --fix
- 环境缺失（依赖未装、服务起不来、端口被占）如实写进 blockers，不要绕过、不要伪装
- 输出用中文`

// ============================================================
// 内联 System Prompt · 综合评估
// ============================================================

const TEST_ASSESSMENT_SYSTEM = `你是测试评估专家。

对需求和代码变更进行完整度、可行性评估。评估必须**可量化、有依据**，不能模糊判断。上一阶段已经跑过 E2E / 回归取证，**你的评分必须以那份证据为基准**，不得推翻工具结果。

## 评估维度

### 1. 需求覆盖（30分）
验收标准逐条对照 E2E 证据：
- passed=true 的才算「已覆盖」
- passed=false 的是**关键缺口**，必须写进 criticalGaps
- unverified 的算「未验证」，按未覆盖扣分，并写进 manualVerificationPoints
- 扣分原因必须具体指出是哪条验收标准

### 2. 边界与异常流（20分）
检查以下场景是否有处理（有测试证据的优先，其次读代码）：
- 空数据 / 空列表
- 极值（超长文本、极大数字、大列表）
- 网络错误（超时、无权限、服务端异常）
- 并发与竞态（重复提交、请求取消）
- 状态边界（分页边界、列表边界）

### 3. 回归覆盖（20分）
- regressionFailures 非空 → 本维度直接记 0 分，并逐条写进 criticalGaps
- 被修改文件的调用方是否需要回归测试
- 公共组件 / 接口变更的影响范围
- 给出必须人工验证的操作路径清单

### 4. 异常处理（15分）
- 错误是否被静默吞掉
- 用户是否有可理解的错误反馈
- 是否有兜底逻辑

### 5. 代码质量（15分）
- 测试用例本身是否可维护（包括上一阶段新增的 e2e 用例）
- 断言是否充分
- 边界条件是否覆盖

## 评分标准

| 等级 | 分值 | 含义 |
|------|------|------|
| 优秀 | 90-100 | 完整覆盖，有亮点 |
| 良好 | 80-89 | 满足要求 |
| 及格 | 70-79 | 基本满足，有改进空间 |
| **不及格** | **<80** | **必须打回** |

## 输出格式
- 每个维度给出 score / maxScore / covered / missing / issues
- 评分必须有具体扣分原因
- 找不到真实问题时如实给高分，禁止为显得严格而编造扣分项
- 输出用中文`

// ============================================================
// 内联 Schema
// ============================================================

const E2E_SCHEMA = {
  type: 'object',
  properties: {
    framework: { type: 'string', description: 'playwright / cypress / vitest / jest / manual-browser / none 等' },
    commandsRun: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          exitCode: { type: 'number' },
          summary: { type: 'string', description: '关键输出摘要：通过/失败数、报错首行' },
        },
        required: ['command'],
      },
    },
    criteriaResults: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          method: { type: 'string', enum: ['e2e', 'unit', 'manual-browser', 'unverified'] },
          passed: { type: ['boolean', 'null'], description: 'unverified 时为 null' },
          evidence: { type: 'string', description: '命令 + 退出码 + 输出/截图路径；unverified 时写原因' },
          specFile: { type: 'string', description: '对应用例文件（如有）' },
        },
        required: ['criterion', 'method', 'passed', 'evidence'],
      },
    },
    newSpecs: { type: 'array', items: { type: 'string' }, description: '本阶段新增/修改的测试文件' },
    regressionFailures: { type: 'array', items: { type: 'string' }, description: '既有测试失败项，原样列出' },
    bugsFound: { type: 'array', items: { type: 'string' }, description: '取证过程中发现的业务 bug，未修' },
    blockers: { type: 'array', items: { type: 'string' }, description: '环境缺失等导致无法验证的原因' },
  },
  required: ['framework', 'criteriaResults'],
}

const DIMENSION_DETAIL = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    maxScore: { type: 'number' },
    covered: { type: 'array' },
    missing: { type: 'array' },
    issues: { type: 'array' },
  },
}

const TEST_ASSESSMENT_SCHEMA = {
  type: 'object',
  properties: {
    requirementCoverage: DIMENSION_DETAIL,
    boundaryCoverage: DIMENSION_DETAIL,
    regressionCoverage: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        maxScore: { type: 'number' },
        affectedFunctions: { type: 'array' },
        manualVerification: { type: 'array' },
        issues: { type: 'array' },
      },
    },
    exceptionHandling: DIMENSION_DETAIL,
    codeQuality: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        maxScore: { type: 'number' },
        strengths: { type: 'array' },
        issues: { type: 'array' },
      },
    },
    totalScore: { type: 'number' },
    maxScore: { type: 'number' },
    finalScore: { type: 'number' },
    criticalGaps: { type: 'array' },
    manualVerificationPoints: { type: 'array' },
  },
  required: ['totalScore', 'finalScore', 'requirementCoverage'],
}

export const meta = {
  name: 'fe-test-assessment',
  description: '测试评估：先跑 E2E/回归取证，再评需求覆盖/边界/异常/回归/代码质量，80分红线，验收失败一票否决',
  phases: [
    { title: 'E2E 执行', detail: '定位验证手段，逐条验收标准取证，跑回归' },
    { title: '综合评估', detail: '以工具证据为基准五维度打分' },
    { title: '评估结论', detail: '80 分红线 + E2E/回归一票否决' },
  ],
}

// ============================================================
// 主流程
// ============================================================

phase('E2E 执行')
// 用户直接输入 /fe-test-assessment 不带参数时 args 为 undefined，也可能只是一段文字；
// 运行时还有个已知 bug：args 有时以 JSON 字符串而非对象传入。先归一化再取字段，否则脚本会在这里以 TypeError 直接失败。
const parsedArgs = (() => {
  if (typeof args !== 'string') return args
  const s = args.trim()
  if (s.startsWith('{')) { try { return JSON.parse(s) } catch (e) { /* 不是 JSON，按纯文字处理 */ } }
  return { requirement: s }
})()
const context = (parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs)) ? parsedArgs : {}

const requirement = context.requirement
  || '（调用方未提供需求描述。请从 git diff、commit message 以及 fe-reports/ 下最近的 triage/architecture 报告推断本次改动意图，并在报告中注明置信度降低）'
if (!context.requirement) {
  log('⚠️ 未收到 requirement 入参，将从 diff 与已有报告推断需求，结论置信度降低')
}

const acceptanceCriteria = Array.isArray(context.acceptanceCriteria)
  ? context.acceptanceCriteria.filter(Boolean)
  : []
if (acceptanceCriteria.length === 0) {
  log('⚠️ 未收到 acceptanceCriteria，E2E 阶段将从需求/triage 报告里自行提取验收标准')
}

const changeScope = context.changeScope || '请用 git diff 自行确定全部变更范围'
const projectContext = context.projectContext || '（未提供项目画像，请从 package.json scripts 与配置文件自行探测门禁命令）'
const round = context.round || 1

log(`📋 评估需求: ${requirement}`)
log(`📁 变更范围: ${changeScope}`)
log(`🔁 评估轮次: 第${round}轮`)

// 阶段1: E2E / 回归取证
let e2e
if (context.skipE2E === true) {
  log('⏭️ 调用方指定 skipE2E=true，跳过 E2E 执行，所有验收标准记为未验证')
  e2e = {
    framework: 'skipped',
    commandsRun: [],
    criteriaResults: acceptanceCriteria.map(c => ({
      criterion: c,
      method: 'unverified',
      passed: null,
      evidence: '调用方指定 skipE2E=true，未执行',
    })),
    newSpecs: [],
    regressionFailures: [],
    bugsFound: [],
    blockers: ['skipE2E=true'],
  }
} else {
  log('🧪 开始 E2E / 回归取证...')

  const e2ePrompt = `${E2E_RUNNER_SYSTEM}

---

## 待验证需求
${requirement}

## 验收标准（逐条取证；为空时请从需求与 fe-reports/ 下的 triage 报告提取）
${acceptanceCriteria.map((c, idx) => `${idx + 1}. ${c}`).join('\n') || '（未提供）'}

## 变更范围
${changeScope}

## 项目画像（门禁命令以此为准）
${projectContext}

## 调用方指定的命令（如有）
- e2eCommand: ${context.e2eCommand || '未指定'}
- devServerCommand: ${context.devServerCommand || '未指定'}
- baseUrl: ${context.baseUrl || '未指定'}

请执行取证并输出结构化结果。`

  e2e = (await agent(e2ePrompt, {
    label: 'e2e-runner',
    phase: 'E2E 执行',
    schema: E2E_SCHEMA,
  })) || {
    framework: 'none',
    criteriaResults: [],
    blockers: ['E2E agent 未返回结构化结果'],
  }
}

const criteriaResults = Array.isArray(e2e.criteriaResults) ? e2e.criteriaResults : []
const failedCriteria = criteriaResults.filter(c => c.passed === false)
const passedCriteria = criteriaResults.filter(c => c.passed === true)
const unverifiedCriteria = criteriaResults.filter(c => c.passed !== true && c.passed !== false)
const regressionFailures = Array.isArray(e2e.regressionFailures) ? e2e.regressionFailures : []
const e2eBlockers = Array.isArray(e2e.blockers) ? e2e.blockers : []

log(`🧪 验证手段: ${e2e.framework || 'none'}`)
log(`✅ 验收通过 ${passedCriteria.length} · ❌ 验收失败 ${failedCriteria.length} · ⏳ 未验证 ${unverifiedCriteria.length}`)
if (regressionFailures.length > 0) log(`🔴 回归失败 ${regressionFailures.length} 项`)
if (e2eBlockers.length > 0) log(`⚠️ 取证阻塞: ${e2eBlockers.join('；')}`)

// 阶段2: 综合评估（以 E2E 证据为基准）
phase('综合评估')

const evidenceTable = criteriaResults.length > 0
  ? criteriaResults.map((c, idx) =>
    `${idx + 1}. [${c.method}] ${c.passed === true ? '✅ 通过' : c.passed === false ? '❌ 失败' : '⏳ 未验证'} — ${c.criterion}\n   证据: ${c.evidence || '无'}${c.specFile ? `\n   用例: ${c.specFile}` : ''}`
  ).join('\n')
  : '（E2E 阶段没有产出任何验收标准结果）'

const evaluationPrompt = `${TEST_ASSESSMENT_SYSTEM}

---

## 待评估需求
${requirement}

## 验收标准
${acceptanceCriteria.map((c, idx) => `${idx + 1}. ${c}`).join('\n') || '（未提供，以下 E2E 证据中的 criterion 即为验收标准）'}

## E2E / 回归取证结果（评分基准，不得推翻）
验证手段: ${e2e.framework || 'none'}

### 逐条验收结果
${evidenceTable}

### 执行过的命令
${(e2e.commandsRun || []).map(c => `- \`${c.command}\` → exit ${c.exitCode ?? '?'}；${c.summary || ''}`).join('\n') || '无'}

### 回归失败项
${regressionFailures.map(r => `- ${r}`).join('\n') || '无'}

### 新增/修改的测试文件
${(e2e.newSpecs || []).map(s => `- ${s}`).join('\n') || '无'}

### 取证过程发现的 bug（未修）
${(e2e.bugsFound || []).map(b => `- ${b}`).join('\n') || '无'}

### 取证阻塞
${e2eBlockers.map(b => `- ${b}`).join('\n') || '无'}

## 变更范围
${changeScope}

## 代码变更
${context.codeChanges || '请用 git diff 自行分析代码变更'}

请执行完整的测试评估并输出结构化结果。`

const assessmentResult = (await agent(evaluationPrompt, {
  label: 'test-assessment',
  phase: '综合评估',
  schema: TEST_ASSESSMENT_SCHEMA,
})) || { totalScore: 0, finalScore: 0, criticalGaps: ['测试评估 agent 未返回结构化结果'] }

// 阶段3: 结论
phase('评估结论')

const totalScore = assessmentResult.totalScore || 0
const maxTotalScore = assessmentResult.maxScore || 100
const finalScore = typeof assessmentResult.finalScore === 'number'
  ? Math.min(100, Math.max(0, Math.round(assessmentResult.finalScore)))
  : Math.round((totalScore / maxTotalScore) * 100)

// 判定：验收标准 E2E 失败或回归失败一票否决，不看分数
const e2eVeto = failedCriteria.length > 0 || regressionFailures.length > 0
const passed = finalScore >= 80 && !e2eVeto

const verdictReason = e2eVeto
  ? `${failedCriteria.length > 0 ? `${failedCriteria.length} 条验收标准 E2E 失败` : ''}${failedCriteria.length > 0 && regressionFailures.length > 0 ? '，' : ''}${regressionFailures.length > 0 ? `${regressionFailures.length} 项回归测试失败` : ''}，无论总分多少一律不予通过`
  : passed
    ? `无验收/回归失败且总分 ${finalScore} ≥ 80`
    : `总分 ${finalScore} < 80`

log(`━━━━━━━━━━━━━━━━━━━━`)
log(`📈 测试评估总分: ${finalScore}/100`)
log(`━━━━━━━━━━━━━━━━━━━━`)

// 分维度展示
const dimensions = [
  { name: '需求覆盖', data: assessmentResult.requirementCoverage },
  { name: '边界与异常', data: assessmentResult.boundaryCoverage },
  { name: '回归覆盖', data: assessmentResult.regressionCoverage },
  { name: '异常处理', data: assessmentResult.exceptionHandling },
  { name: '代码质量', data: assessmentResult.codeQuality },
]

for (const dim of dimensions) {
  if (dim.data) {
    const pct = dim.data.maxScore ? Math.round((dim.data.score / dim.data.maxScore) * 100) : 0
    log(`📊 ${dim.name}: ${dim.data.score}/${dim.data.maxScore} (${pct}%)`)
  }
}

log(`🎯 评估结论: ${passed ? '✅ 通过' : '❌ 打回架构和开发'} —— ${verdictReason}`)

const manualPoints = [
  ...(assessmentResult.manualVerificationPoints || []),
  ...(assessmentResult.regressionCoverage?.manualVerification || []),
  ...unverifiedCriteria.map(c => `【未验证的验收标准】${c.criterion}（${c.evidence || '无说明'}）`),
]

// 生成评估报告
const report = `# 测试评估报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 需求 | ${context.requirement || '⚠️ 未提供，由评估员从 diff 推断'} |
| 评估轮次 | 第${round}轮 |
| 评估时间 | ${context.timestamp || '（由编排方落盘时填写）'} |
| 验证手段 | ${e2e.framework || 'none'} |
| **总分** | **${finalScore}/100** |
| **结论** | **${passed ? '✅ 通过' : '❌ 打回'}** |
| 判定依据 | ${verdictReason} |

## E2E / 回归取证

### 验收标准逐条结果
| # | 验收标准 | 方式 | 结果 | 证据 |
|---|----------|------|------|------|
${criteriaResults.length > 0
  ? criteriaResults.map((c, idx) => `| ${idx + 1} | ${c.criterion} | ${c.method} | ${c.passed === true ? '✅' : c.passed === false ? '❌' : '⏳ 未验证'} | ${(c.evidence || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`).join('\n')
  : '| - | （无结果） | - | - | - |'}

### 执行过的命令
${(e2e.commandsRun || []).map(c => `- \`${c.command}\` → exit ${c.exitCode ?? '?'}${c.summary ? `；${c.summary}` : ''}`).join('\n') || '无'}

### 回归失败项
${regressionFailures.map(r => `- 🔴 ${r}`).join('\n') || '无'}

### 新增/修改的测试文件
${(e2e.newSpecs || []).map(s => `- \`${s}\``).join('\n') || '无'}

### 取证过程发现的 bug（未修，需开发处理）
${(e2e.bugsFound || []).map(b => `- ${b}`).join('\n') || '无'}

### 取证阻塞
${e2eBlockers.map(b => `- ⚠️ ${b}`).join('\n') || '无'}

## 分项评估

| 维度 | 得分 | 满分 | 占比 | 状态 |
|------|------|------|------|------|
${dimensions.map(dim => {
  if (!dim.data) return `| ${dim.name} | - | - | - | ⏳ |`
  const pct = dim.data.maxScore ? Math.round((dim.data.score / dim.data.maxScore) * 100) : 0
  const status = pct >= 80 ? '✅' : pct >= 60 ? '🟡' : '🔴'
  return `| ${dim.name} | ${dim.data.score} | ${dim.data.maxScore} | ${pct}% | ${status} |`
}).join('\n')}

## 问题清单

### 🔴 关键缺口（验收失败 / 回归失败 / 需求覆盖不足）
${[
  ...failedCriteria.map(c => `验收失败：${c.criterion}（${c.evidence || '无证据'}）`),
  ...regressionFailures.map(r => `回归失败：${r}`),
  ...(assessmentResult.criticalGaps || []),
].map((g, idx) => `${idx + 1}. ${g}`).join('\n') || '无'}

### 🟡 待改进
${dimensions.flatMap(dim =>
  (dim.data?.issues || []).map(i => `**${dim.name}**: ${i}`)
).join('\n') || '无'}

## 必须人工验证的点
${manualPoints.map((v, idx) => `${idx + 1}. ${v}`).join('\n') || '无'}

## 评估结论

${passed ?
`## ✅ 通过 (${finalScore}分 ≥ 80分，无验收/回归失败)

测试覆盖满足要求，可以进行最终验收。
${unverifiedCriteria.length > 0 ? `
⚠️ 仍有 ${unverifiedCriteria.length} 条验收标准未能自动验证，合并前请按「必须人工验证的点」逐条手工确认。` : ''}
` :
`## ❌ 打回架构和开发重新做

**判定依据**: ${verdictReason}

${e2eVeto ? `### 🔴 必须先修复的失败项
${[...failedCriteria.map(c => `- 验收失败：${c.criterion}\n  证据: ${c.evidence || '无'}`), ...regressionFailures.map(r => `- 回归失败：${r}`)].join('\n')}
` : ''}
### 打回流程
1. **返回开发**: 修复失败项与关键缺口，补齐测试
2. **返回架构**（若缺口源于方案）: 重新评估方案
3. **重新提交**: 修复后重新跑本阶段

### 剩余重试次数
- 当前轮次: 第${round}轮
- 最大轮次: 2轮
${round >= 2 ? '⚠️ 已达最大轮次限制，请人工介入评估' : `剩余重试次数: ${2 - round}`}
`}

---

**评估标准**: 80分红线；任一验收标准 E2E 失败或既有测试回归失败 → 一票否决，与总分无关。
`

log('📝 评估报告已生成')

return {
  dimensions: assessmentResult,
  e2e: {
    framework: e2e.framework || 'none',
    criteriaResults,
    passedCount: passedCriteria.length,
    failedCount: failedCriteria.length,
    unverifiedCount: unverifiedCriteria.length,
    regressionFailures,
    newSpecs: e2e.newSpecs || [],
    bugsFound: e2e.bugsFound || [],
    blockers: e2eBlockers,
  },
  totalScore,
  maxTotalScore,
  finalScore,
  passed,
  e2eVeto,
  verdictReason,
  criticalGaps: [
    ...failedCriteria.map(c => `验收失败：${c.criterion}`),
    ...regressionFailures.map(r => `回归失败：${r}`),
    ...(assessmentResult.criticalGaps || []),
  ],
  manualVerificationPoints: manualPoints,
  report,
  round,
  maxRounds: 2,
  nextAction: passed ? 'complete' : 'escalate_to_architecture',
  message: passed
    ? `测试评估通过（${finalScore}分${unverifiedCriteria.length > 0 ? `，${unverifiedCriteria.length} 条待人工验证` : ''}），请与用户确认后进入变更说明与提交`
    : `测试评估未通过（${verdictReason}），需要打回架构和开发重新做`,
}
