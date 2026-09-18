/**
 * 需求梳理 Workflow
 * 基于需求梳理分析师的精华 prompt
 */

import { REQUIREMENT_ANALYSIS_SYSTEM } from './shared/prompts.js'
import { REQUIREMENT_SCHEMA } from './shared/schemas.js'

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
