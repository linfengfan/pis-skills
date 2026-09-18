/**
 * 测试评估 Workflow
 * 针对需求和代码变更进行完整度、可行性评估
 * 80分红线，低于80分打回架构和开发重新做
 */

import { TEST_ASSESSMENT_SYSTEM } from './shared/prompts.js'
import { TEST_ASSESSMENT_SCHEMA } from './shared/schemas.js'

export const meta = {
  name: 'fe-test-assessment',
  description: '测试评估：需求覆盖/边界/异常/回归/代码质量，80分红线',
  phases: [
    { title: '需求覆盖评估', detail: '验收标准逐条检查' },
    { title: '边界与异常流', detail: '极端情况处理' },
    { title: '回归覆盖', detail: '改动影响的功能' },
    { title: '综合评分', detail: '输出评分与结论' },
  ],
}

// ============================================================
// 主流程
// ============================================================

phase('需求覆盖评估')
const context = args
log(`📋 评估需求: ${context.requirement}`)
log(`📁 变更范围: ${context.changeScope || '全部变更'}`)

// 阶段1-4: 并行评估各维度
const evaluationPrompt = `${TEST_ASSESSMENT_SYSTEM}

---

## 待评估需求
${context.requirement}

## 验收标准
${(context.acceptanceCriteria || []).map((c, idx) => `${idx + 1}. ${c}`).join('\n') || '无'}

## 变更范围
${context.changeScope || '全部变更'}

## 代码变更
${context.codeChanges || '请分析代码变更'}

请执行完整的测试评估并输出结构化结果。`

const assessmentResult = await agent(evaluationPrompt, {
  label: 'test-assessment',
  phase: '综合评估',
  schema: TEST_ASSESSMENT_SCHEMA,
})

// 计算总分
const totalScore = assessmentResult.totalScore || 0
const maxTotalScore = assessmentResult.maxScore || 100
const finalScore = assessmentResult.finalScore || Math.round((totalScore / maxTotalScore) * 100)

const passed = finalScore >= 80

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

log(`🎯 评估结论: ${passed ? '✅ 通过' : '❌ 打回架构和开发'}`)

// 生成评估报告
const report = `# 测试评估报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 需求 | ${context.requirement} |
| 评估轮次 | 第${context.round || 1}轮 |
| 评估时间 | ${new Date().toISOString()} |
| **总分** | **${finalScore}/100** |

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

### 🔴 关键缺口（需求覆盖不足）
${(assessmentResult.criticalGaps || []).map((g, idx) => `${idx + 1}. ${g}`).join('\n') || '无'}

### 🟡 待改进
${dimensions.flatMap(dim =>
  (dim.data?.issues || []).map(i => `**${dim.name}**: ${i}`)
).join('\n') || '无'}

## 必须人工验证的点
${(assessmentResult.manualVerificationPoints ||
  assessmentResult.regressionCoverage?.manualVerification || []).map((v, idx) =>
  `${idx + 1}. ${v}`
).join('\n') || '无'}

## 评估结论

${passed ?
`## ✅ 通过 (${finalScore}分 ≥ 80分)

测试覆盖满足要求，可以进行最终验收。
` :
`## ❌ 打回架构和开发重新做 (${finalScore}分 < 80分)

**严重警告**: 测试覆盖不足，整个需求需要从架构和开发阶段重新处理。

### 🔴 关键缺口
${(assessmentResult.criticalGaps || []).map((g, idx) => `${idx + 1}. ${g}`).join('\n') || '无'}

### 影响评估
- 测试覆盖率不足意味着产品质量无法保证
- 潜在风险无法被提前发现
- 需要从架构设计阶段重新评估

### 打回流程
1. **返回架构设计**: 重新评估方案
2. **返回开发**: 确保实现满足测试需求
3. **重新提交**: 修复后重新走完整流程

### 剩余重试次数
- 当前轮次: 第${context.round || 1}轮
- 最大轮次: 2轮
${(context.round || 1) >= 2 ? '⚠️ 已达最大轮次限制，请人工介入评估' : `剩余重试次数: ${2 - (context.round || 1)}`}
`}

---

**评估标准**: 80分红线，低于80分打回架构和开发重新做
`

log('📝 评估报告已生成')

return {
  dimensions: assessmentResult,
  totalScore,
  maxTotalScore,
  finalScore,
  passed,
  criticalGaps: assessmentResult.criticalGaps || [],
  manualVerificationPoints: assessmentResult.manualVerificationPoints || [],
  report,
  round: context.round || 1,
  maxRounds: 2,
  nextAction: passed ? 'complete' : 'escalate_to_architecture',
  message: passed
    ? `测试评估通过（${finalScore}分），可以进行最终验收`
    : `测试评估未通过（${finalScore}分 < 80分），需要打回架构和开发重新做`,
}
