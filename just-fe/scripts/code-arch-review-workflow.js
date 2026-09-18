/**
 * 代码架构Review Workflow
 * 基于代码审核者的精华 prompt
 * 80分红线，低于80分打回给开发agent重新做
 */

import { CODE_REVIEW_SYSTEM } from './shared/prompts.js'
import { CODE_REVIEW_SCHEMA } from './shared/schemas.js'

export const meta = {
  name: 'fe-code-arch-review',
  description: '代码架构Review：代码审核者标准，七维度打分，80分红线',
  phases: [
    { title: '锁定边界', detail: '确定变更范围' },
    { title: '分级审查', detail: '逻辑→健壮性→架构→规范→安全' },
    { title: '评分结论', detail: '输出评分与合并/打回结论' },
  ],
}

// ============================================================
// 主流程
// ============================================================

phase('锁定边界')
const context = args
log(`📋 评审需求: ${context.requirement}`)
log(`📁 代码范围: ${context.changeScope || '全部变更'}`)

// 阶段1: 锁定边界
phase('锁定边界')
log('🔍 锁定变更边界...')

// 阶段2: 分级审查
phase('分级审查')
log('🔍 执行分级审查...')

const reviewPrompt = `${CODE_REVIEW_SYSTEM}

---

## 待评审需求
${context.requirement}

## 变更范围
${context.changeScope || '请分析全部变更'}

## 项目规范（如有）
${context.projectContext || '无'}

请执行代码审查并输出结构化结果。`

const reviewResult = await agent(reviewPrompt, {
  label: 'code-review',
  phase: '分级审查',
  schema: CODE_REVIEW_SCHEMA,
})

// 阶段3: 评分结论
phase('评分结论')

const score = reviewResult.score || 0
const passed = score >= 80

log(`━━━━━━━━━━━━━━━━━━━━`)
log(`📈 代码审查总分: ${score}/100`)
log(`━━━━━━━━━━━━━━━━━━━━`)

const verdictLabels = {
  merge: '✅ 可合并',
  conditional: '🟡 有条件合并',
  reject: '🔴 需重构',
  rewrite: '🔴 打回重写',
}

log(`🎯 评审结论: ${verdictLabels[reviewResult.verdict] || '未知'}`)

// 生成审查报告
const report = `# 代码架构Review报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 评审类型 | 代码架构Review |
| 评审时间 | ${new Date().toISOString()} |
| **总分** | **${score}/100** |
| **结论** | **${verdictLabels[reviewResult.verdict]}** |

## 变更本质
${reviewResult.changeSummary || '无'}

## 分项问题

${reviewResult.criticalIssues?.length > 0 ? `### 🔴 致命问题
| # | 问题 | 位置 | 后果 | 修法 |
|---|------|------|------|------|
${reviewResult.criticalIssues.map((i, idx) => `| ${idx + 1} | ${i.issue} | ${i.location} | ${i.consequence} | ${i.fix} |`).join('\n')}
` : '### 🔴 致命问题\n无\n'}

${reviewResult.minorIssues?.length > 0 ? `### 🟡 架构异味
| # | 问题 | 位置 | 建议 |
|---|------|------|------|
${reviewResult.minorIssues.map((i, idx) => `| ${idx + 1} | ${i.issue} | ${i.location} | ${i.suggestion} |`).join('\n')}
` : '### 🟡 架构异味\n无\n'}

${reviewResult.tips?.length > 0 ? `### 🟢 规范提示
${reviewResult.tips.map((t, idx) => `${idx + 1}. ${t}`).join('\n')}
` : ''}

${reviewResult.pendingConfirmations?.length > 0 ? `
### ⏳ 待确认
${reviewResult.pendingConfirmations.map((p, idx) => `${idx + 1}. ${p}`).join('\n')}
` : ''}

## 爆炸半径与回归点
${(reviewResult.blastRadius || []).map(b => `- ${b}`).join('\n') || '无'}

## 验证点
${(reviewResult.verificationPoints || []).map(v => `- ${v}`).join('\n') || '无'}

## 评审结论

${passed ?
`## ✅ 通过 (${score}分 ≥ 80分)

${reviewResult.verdictReason || '代码符合架构要求，可以进入测试评估阶段。'}
` :
`## ❌ 打回开发agent重新做 (${score}分 < 80分)

${reviewResult.verdictReason || '代码存在严重问题，需要重新开发。'}

### 🔴 必须修复的问题
${reviewResult.criticalIssues?.map((i, idx) => `${idx + 1}. **${i.location}**: ${i.issue} → ${i.fix}`).join('\n') || '无'}

${reviewResult.minorIssues?.length > 0 ? `
### 🟡 建议一并修复
${reviewResult.minorIssues?.map((i, idx) => `${idx + 1}. **${i.location}**: ${i.issue}`).join('\n')}
` : ''}
`}

---

**审查标准**: 80分红线，低于80分必须打回开发agent重新做
`

log('📝 审查报告已生成')

return {
  score,
  passed,
  verdict: reviewResult.verdict,
  verdictReason: reviewResult.verdictReason,
  criticalIssues: reviewResult.criticalIssues || [],
  minorIssues: reviewResult.minorIssues || [],
  blastRadius: reviewResult.blastRadius || [],
  verificationPoints: reviewResult.verificationPoints || [],
  report,
  nextAction: passed ? 'proceed_to_test' : 'escalate_to_development',
  message: passed
    ? `代码架构Review通过（${score}分），可以进入测试评估阶段`
    : `代码架构Review未通过（${score}分 < 80分），需要打回开发agent重新做`,
}
