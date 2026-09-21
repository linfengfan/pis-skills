/**
 * 需求梳理 Workflow
 *
 * 「需求梳理分析师」只是下方内联 prompt 里的角色名，不是外部 Skill/Agent，
 * 不要用 Skill(需求梳理分析师) 之类的方式去调用它。
 *
 * 本文件自包含：Workflow 运行时在隔离环境执行脚本，不提供文件系统访问，
 * 因此不能 import 外部模块。所有 prompt 与 schema 必须内联在本文件内。
 */

// ============================================================
// 内联 System Prompt
// ============================================================

const REQUIREMENT_ANALYSIS_SYSTEM = `你是需求梳理分析师。

你负责把需求「问清楚、写清楚」，而不是把它实现出来。你的产物是下游架构与开发 agent 的唯一输入，因此**宁可暴露不确定性，也不能靠猜测填空**。

## 执行流程

### 1. 现状勘查（先读再问）
- 读项目上下文：README、CLAUDE.md/AGENTS.md、package.json
- 用 Grep/Glob 定位需求涉及的既有实现（页面、接口、store、类型）
- 判断这是「新增」「改造」还是「重复造轮子」
- 已有相似功能时，必须指出可复用/需对齐的位置（文件:行号）

### 2. 歧义拆解（核心动作）
逐条列出需求中**不明确、自相矛盾、隐含假设**的点，每条给出：
- 问题描述
- 你的**推荐默认取值**（带理由），标注【假设】
- 该假设若被推翻，影响多大
- 严禁把假设写成既定事实

### 3. 结构化输出
按以下结构输出（无内容的段落写「无」，不要删段）：
- **一句话目标**：解决谁的什么问题，成功后什么指标会变化
- **范围边界**：做什么 / 明确不做什么（防范围蔓延）
- **用户故事与流程**：作为<角色>，我要<操作>，以便<价值>
- **验收标准**：可测的条件清单，每条必须可被 E2E 或手工验证
- **状态与异常流**：Loading/空数据/请求失败/极值/快速重复操作
- **UI 形态**：是否涉及页面/组件的视觉改动（新页面、改布局、新组件、样式调整都算）；需求中是否附带设计稿链接（Figma / 蓝湖 / MasterGo / 截图）。**涉及视觉改动但没有设计稿时，必须在待决问题第一条写「请提供设计稿链接，或明确确认按现有页面风格实现」**——这是 UI 开发阶段的准入条件，不能用「按现有风格类推」默默替用户决定
- **数据与接口需求**：需要哪些字段、由哪个接口提供、字段缺失时的兜底
- **非功能约束**：权限、国际化、响应式、性能预算、埋点
- **影响面清单**：受影响的模块/页面/接口/状态，回归测试点
- **待决问题**：必须由人回答才能动工的问题，按阻塞程度排序
- **拆分建议**：若需求过大，切成可独立交付的批次

## 铁律
- **只分析，不改代码**
- 不做技术选型与架构设计——那是前端架构师的职责
- 需求存在逻辑死锁时，立刻输出 [需求阻断] 并指明冲突两端
- 输出用中文、结构化 Markdown`

// ============================================================
// 内联 Schema
// ============================================================

const REQUIREMENT_SCHEMA = {
  type: 'object',
  properties: {
    oneSentenceGoal: { type: 'string', description: '一句话目标' },
    scope: {
      type: 'object',
      properties: {
        include: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
      },
    },
    userStories: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    exceptionFlows: { type: 'array', items: { type: 'string' } },
    uiChange: { type: 'boolean', description: '是否涉及页面/组件的视觉改动' },
    designAssets: { type: 'array', items: { type: 'string' }, description: '需求中出现的设计稿/原型链接或截图路径；没有则为空数组' },
    apiRequirements: { type: 'array', items: { type: 'string' } },
    nonFunctionalConstraints: { type: 'array', items: { type: 'string' } },
    impactScope: { type: 'array', items: { type: 'string' } },
    pendingQuestions: { type: 'array', items: { type: 'string' } },
    splittingSuggestions: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    blockReason: { type: 'string', description: '如果有逻辑死锁，说明原因' },
  },
  required: ['oneSentenceGoal', 'scope', 'uiChange'],
}

export const meta = {
  name: 'fe-triage',
  description: '前端需求梳理：歧义拆解、结构化输出',
  phases: [
    { title: '现状勘查', detail: '读取项目上下文，定位既有实现' },
    { title: '歧义拆解', detail: '列出不明确、自相矛盾、隐含假设的点' },
    { title: '结构化输出', detail: '产出结构化需求文档' },
  ],
}

// ============================================================
// 主流程
// ============================================================

phase('现状勘查')
// 用户直接输入 /fe-triage 不带参数时 args 为 undefined，也可能只是需求原文字符串；
// 运行时还有个已知 bug：args 有时以 JSON 字符串而非对象传入。先归一化再取字段，否则脚本会在这里以 TypeError 直接失败。
const parsedArgs = (() => {
  if (typeof args !== 'string') return args
  const s = args.trim()
  if (s.startsWith('{')) { try { return JSON.parse(s) } catch (e) { /* 不是 JSON，按纯文字处理 */ } }
  return { requirement: s }
})()
const context = (parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs)) ? parsedArgs : {}

if (!context.requirement) {
  log('🚫 未收到 requirement 入参，没有可梳理的需求')
  return {
    analysis: {},
    report: '# 需求梳理报告\n\n🚫 调用 fe-triage 时未传入 requirement，未执行任何分析。请把需求原文作为 requirement 传入后重新调用。',
    status: 'invalid_args',
    missing: ['requirement'],
    nextStep: 'resolve_block',
    message: '缺少 requirement 入参：请把需求原文（文档、聊天记录、口头描述均可）传入后重新调用',
  }
}

log(`📋 需求: ${context.requirement}`)

// 检查是否有项目上下文
const hasProjectContext = context.projectPath || context.existingImplementation || context.projectContext
if (hasProjectContext) {
  log('🔍 检测到项目上下文，正在分析既有实现...')
} else {
  log('⚠️ 无项目上下文，将基于需求描述进行分析')
}

log('📖 执行现状勘查...')

// 阶段2: 歧义拆解 + 结构化输出
phase('结构化输出')
log('📝 执行需求梳理...')

const analysisPrompt = `${REQUIREMENT_ANALYSIS_SYSTEM}

---

## 待分析需求
${context.requirement}

${context.projectContext ? `## 项目上下文
${context.projectContext}` : ''}

请按结构化格式输出需求分析结果。`

const analysisResult = (await agent(analysisPrompt, {
  label: 'requirement-analysis',
  phase: '结构化输出',
  schema: REQUIREMENT_SCHEMA,
})) || { blockReason: '需求梳理 agent 未返回结构化结果' }

// 检查是否有逻辑死锁
if (analysisResult.blockReason) {
  log('🚫 检测到需求逻辑死锁')
}

const uiChange = analysisResult.uiChange === true
const designAssets = Array.isArray(analysisResult.designAssets) ? analysisResult.designAssets.filter(Boolean) : []
const needsDesignInput = uiChange && designAssets.length === 0
if (needsDesignInput) {
  log('🎨 涉及视觉改动但未见设计稿链接：UI 开发前必须向用户索取设计稿或确认按现有风格实现')
}

// 生成需求梳理报告
const report = `# 需求梳理报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 需求 | ${context.requirement} |
| 梳理时间 | ${new Date().toISOString()} |
| 状态 | ${analysisResult.blockReason ? '🚫 需阻断' : '✅ 可推进'} |

${analysisResult.blockReason ? `
## 🚫 需求阻断

**阻断原因**: ${analysisResult.blockReason}

请解决上述冲突后再继续。
` : ''}

## 一句话目标
${analysisResult.oneSentenceGoal || '无'}

## 范围边界

### ✅ 做什么
${(analysisResult.scope?.include || []).map(i => `- ${i}`).join('\n') || '无'}

### ❌ 明确不做什么
${(analysisResult.scope?.exclude || []).map(e => `- ${e}`).join('\n') || '无'}

## 用户故事
${(analysisResult.userStories || []).map(s => `- ${s}`).join('\n') || '无'}

## 验收标准
${(analysisResult.acceptanceCriteria || []).map(c => `- [ ] ${c}`).join('\n') || '无'}

## 状态与异常流
${(analysisResult.exceptionFlows || []).map(e => `- ${e}`).join('\n') || '无'}

## UI 形态
| 字段 | 值 |
|------|-----|
| 涉及视觉改动 | ${uiChange ? '是' : '否'} |
| 设计稿 | ${designAssets.length > 0 ? designAssets.map(d => `\`${d}\``).join('、') : '未提供'} |
| UI 开发准入 | ${!uiChange ? '不涉及 UI，④ 阶段可与用户确认后跳过' : designAssets.length > 0 ? '✅ 已有设计稿' : '🎨 **需向用户索取设计稿链接，或确认按现有风格实现**'} |

## 数据与接口需求
${(analysisResult.apiRequirements || []).map(a => `- ${a}`).join('\n') || '无'}

## 非功能约束
${(analysisResult.nonFunctionalConstraints || []).map(n => `- ${n}`).join('\n') || '无'}

## 影响面清单
${(analysisResult.impactScope || []).map(i => `- ${i}`).join('\n') || '无'}

## 待决问题（需人工回答）
${(analysisResult.pendingQuestions || []).map((q, idx) => `${idx + 1}. ${q}`).join('\n') || '无'}

${(analysisResult.assumptions?.length > 0 ? `
## 【假设】（可能被推翻）
${analysisResult.assumptions.map(a => `- ${a}`).join('\n')}
` : '')}

${(analysisResult.splittingSuggestions?.length > 0 ? `
## 拆分建议
${analysisResult.splittingSuggestions.map(s => `- ${s}`).join('\n')}
` : '')}
`

log('📝 需求梳理报告已生成')

return {
  analysis: analysisResult,
  uiChange,
  designAssets,
  needsDesignInput,
  pendingQuestions: analysisResult.pendingQuestions || [],
  report,
  status: analysisResult.blockReason ? 'blocked' : 'ready',
  nextStep: analysisResult.blockReason ? 'resolve_block' : 'architecture',
  message: analysisResult.blockReason
    ? `需求存在逻辑死锁，需解决后才能继续: ${analysisResult.blockReason}`
    : `需求梳理完成${needsDesignInput ? '；涉及视觉改动但缺设计稿，进入 UI 开发前请先向用户索取' : ''}，请与用户确认后再进入架构设计阶段`,
}
