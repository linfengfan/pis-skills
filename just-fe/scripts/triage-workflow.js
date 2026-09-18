/**
 * 需求梳理 Workflow
 * 基于需求梳理分析师的精华 prompt
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
    apiRequirements: { type: 'array', items: { type: 'string' } },
    nonFunctionalConstraints: { type: 'array', items: { type: 'string' } },
    impactScope: { type: 'array', items: { type: 'string' } },
    pendingQuestions: { type: 'array', items: { type: 'string' } },
    splittingSuggestions: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    blockReason: { type: 'string', description: '如果有逻辑死锁，说明原因' },
  },
  required: ['oneSentenceGoal', 'scope'],
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
const context = args
log(`📋 需求: ${context.requirement}`)

// 检查是否有项目上下文
const hasProjectContext = context.projectPath || context.existingImplementation
if (hasProjectContext) {
  log('🔍 检测到项目上下文，正在分析既有实现...')
} else {
  log('⚠️ 无项目上下文，将基于需求描述进行分析')
}

// 阶段1: 现状勘查
phase('现状勘查')
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

const analysisResult = await agent(analysisPrompt, {
  label: 'requirement-analysis',
  phase: '结构化输出',
  schema: REQUIREMENT_SCHEMA,
})

// 检查是否有逻辑死锁
if (analysisResult.blockReason) {
  log('🚫 检测到需求逻辑死锁')
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
  report,
  status: analysisResult.blockReason ? 'blocked' : 'ready',
  nextStep: analysisResult.blockReason ? 'resolve_block' : 'architecture',
  message: analysisResult.blockReason
    ? `需求存在逻辑死锁，需解决后才能继续: ${analysisResult.blockReason}`
    : '需求梳理完成，可以进入架构设计阶段',
}
