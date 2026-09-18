/**
 * 架构方案评审 Workflow
 * 对架构方案进行评审打分
 * 80分红线，低于80分打回重写
 */

import { DIMENSION_SCHEMA } from './shared/schemas.js'

export const meta = {
  name: 'fe-architecture-review',
  description: '架构方案评审：六维度打分，80分红线，低于打回重写',
  phases: [
    { title: '方案分析', detail: '读取方案文档' },
    { title: '多维评审', detail: '六维度并行评审' },
    { title: '综合评分', detail: '汇总得分，输出结论' },
  ],
}

// ============================================================
// 评审维度（结合架构师视角）
// ============================================================

const REVIEW_DIMENSIONS = {
  'requirement-coverage': `你是架构方案评审员，评审"需求覆盖"维度（25分）。

方案文档：
{architecture}

评分标准：
- 25分: 完整覆盖所有需求点，用户故事都有对应设计
- 20分: 覆盖主要需求，有小遗漏
- 15分: 覆盖部分核心需求
- 10分: 遗漏重要需求
- <10分: 严重遗漏

请检查：
1. 功能范围是否完整
2. 用户故事是否都有对应实现设计
3. 验收标准是否被覆盖

输出JSON：
{
  "dimension": "requirement-coverage",
  "score": 分数(0-25),
  "maxScore": 25,
  "findings": ["发现"],
  "issues": ["问题"],
  "recommendation": "建议"
}`,

  'technical-feasibility': `你是架构方案评审员，评审"技术可行性"维度（20分）。

方案文档：
{architecture}

评分标准：
- 20分: 技术选型成熟，方案完全可实现
- 15分: 方案可行，有一定难度
- 10分: 存在技术挑战，需要进一步验证
- <10分: 技术风险过高

请检查：
1. 技术栈是否成熟稳定
2. 依赖库是否可靠
3. 是否有未经验证的技术

输出JSON：
{
  "dimension": "technical-feasibility",
  "score": 分数(0-20),
  "maxScore": 20,
  "findings": ["发现"],
  "issues": ["问题"],
  "recommendation": "建议"
}`,

  'module-structure': `你是架构方案评审员，评审"模块结构"维度（20分）。

方案文档：
{architecture}

评分标准：
- 20分: 模块划分清晰，职责单一，完全解耦
- 16分: 模块划分合理
- 12分: 模块划分一般
- <12分: 模块划分混乱

请检查：
1. 文件清单是否合理
2. 组件树拆分是否清晰
3. 是否有循环依赖风险

输出JSON：
{
  "dimension": "module-structure",
  "score": 分数(0-20),
  "maxScore": 20,
  "findings": ["发现"],
  "issues": ["问题"],
  "recommendation": "建议"
}`,

  'state-management': `你是架构方案评审员，评审"状态管理"维度（15分）。

方案文档：
{architecture}

评分标准：
- 15分: 状态归属清晰，划分合理
- 12分: 状态管理基本合理
- 8分: 状态管理有改进空间
- <8分: 状态管理混乱

请检查：
1. 组件本地状态 vs 全局 store 划分
2. URL query 使用是否恰当
3. 缓存策略是否明确

输出JSON：
{
  "dimension": "state-management",
  "score": 分数(0-15),
  "maxScore": 15,
  "findings": ["发现"],
  "issues": ["问题"],
  "recommendation": "建议"
}`,

  'risk-identification': `你是架构方案评审员，评审"风险识别"维度（10分）。

方案文档：
{architecture}

评分标准：
- 10分: 风险识别完整，有详细缓解措施
- 8分: 识别主要风险，有缓解方案
- 5分: 部分风险识别
- <5分: 风险识别不足

请检查：
1. 是否识别了技术风险
2. 是否识别了业务风险
3. 缓解措施是否可行

输出JSON：
{
  "dimension": "risk-identification",
  "score": 分数(0-10),
  "maxScore": 10,
  "findings": ["发现"],
  "issues": ["问题"],
  "recommendation": "建议"
}`,

  'convention-compliance': `你是架构方案评审员，评审"规范一致性"维度（10分）。

方案文档：
{architecture}

项目规范：
{profile}

评分标准：
- 10分: 完全符合项目规范
- 8分: 基本符合，有合理例外
- 5分: 部分偏离规范
- <5分: 严重偏离规范

请检查：
1. 是否遵循项目代码规范
2. 是否使用项目既定的模式
3. 是否有合理的创新

输出JSON：
{
  "dimension": "convention-compliance",
  "score": 分数(0-10),
  "maxScore": 10,
  "findings": ["发现"],
  "issues": ["问题"],
  "recommendation": "建议"
}`,
}

// ============================================================
// 主流程
// ============================================================

phase('方案分析')
const context = args
log(`📋 评审对象: ${context.architectureName || '架构方案'}`)
log(`📄 方案路径: ${context.architecturePath || '内联提供'}`)

const architecture = context.architecture || context.requirement || '无'
const profile = context.profile || '无项目画像'

log('📖 开始分析方案文档...')

// 阶段1: 多维评审
phase('多维评审')
log('🔍 启动六维度并行评审...')

const dimensions = Object.keys(REVIEW_DIMENSIONS)

const dimensionResults = await parallel(
  dimensions.map(dim => async () => {
    const prompt = REVIEW_DIMENSIONS[dim]
      .replace('{architecture}', architecture)
      .replace('{profile}', profile)

    return await agent(prompt, {
      label: dim,
      phase: '多维评审',
      schema: DIMENSION_SCHEMA,
    })
  })
)

log('✅ 六维度评审完成')

// 阶段2: 综合评分
phase('综合评分')

let totalScore = 0
let maxTotalScore = 0

const scoringTable = []
for (const result of dimensionResults) {
  if (result) {
    totalScore += result.score || 0
    maxTotalScore += result.maxScore || 0
    scoringTable.push({
      dimension: result.dimension,
      score: result.score,
      maxScore: result.maxScore,
      percentage: result.maxScore ? Math.round((result.score / result.maxScore) * 100) : 0,
      issues: result.issues || [],
    })
    log(`📊 ${result.dimension}: ${result.score}/${result.maxScore} (${Math.round((result.score / result.maxScore) * 100)}%)`)
  }
}

const finalScore = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0

log(`━━━━━━━━━━━━━━━━━━━━`)
log(`📈 总分: ${finalScore}/100`)
log(`━━━━━━━━━━━━━━━━━━━━`)

const passed = finalScore >= 80
const conclusion = passed ? '✅ 通过' : '❌ 打回重写'
log(`🎯 评审结论: ${conclusion}`)

// 收集所有问题
const allIssues = []
for (const r of dimensionResults) {
  if (r && r.issues) {
    allIssues.push(...r.issues.map(i => ({ dimension: r.dimension, issue: i })))
  }
}

// 生成评审报告
const report = `# 架构方案评审报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 评审对象 | ${context.architectureName || '架构方案'} |
| 评审轮次 | 第${context.round || 1}轮 |
| 评审时间 | ${new Date().toISOString()} |
| **总分** | **${finalScore}/100** |

## 分项评分

| 维度 | 得分 | 满分 | 占比 | 状态 |
|------|------|------|------|------|
${scoringTable.map(s =>
`| ${s.dimension} | ${s.score} | ${s.maxScore} | ${s.percentage}% | ${s.percentage >= 80 ? '✅' : '❌'} |`
).join('\n')}

**总计**: ${totalScore}/${maxTotalScore} = ${finalScore}%

## 问题清单

${allIssues.length > 0 ? allIssues.map((item, idx) =>
`### ${idx + 1}. [${item.dimension}] ${item.issue}`
).join('\n\n') : '无重大问题'}

## 评审结论

${passed ?
`## ✅ 通过 (${finalScore}分 ≥ 80分)

方案满足要求，可以进入实施阶段。
` :
`## ❌ 打回重写 (${finalScore}分 < 80分)

方案需要修改后重新评审。

### 修复要求
${allIssues.map((item, idx) => `${idx + 1}. [${item.dimension}] ${item.issue}`).join('\n')}

### 恢复方式
修复后重新提交评审，请回复"已修复，重新评审"。
`}

---

**评审标准**: 80分红线，低于80分必须打回重写
`

log('📝 评审报告已生成')

return {
  dimensionResults: scoringTable,
  totalScore,
  maxTotalScore,
  finalScore,
  passed,
  conclusion: passed ? '通过' : '打回重写',
  issues: allIssues,
  report,
  round: context.round || 1,
  nextAction: passed ? 'proceed_to_implementation' : 'revision_required',
}
