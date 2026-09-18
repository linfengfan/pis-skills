/**
 * 架构设计 Workflow
 * 基于前端架构师的精华 prompt
 */

import { ARCHITECTURE_SYSTEM } from './shared/prompts.js'
import { ARCHITECTURE_SCHEMA } from './shared/schemas.js'

export const meta = {
  name: 'fe-architecture',
  description: '前端架构设计：文件规划、组件树、状态归属、接口契约',
  phases: [
    { title: '约束提取', detail: '读取项目规范，勘查同类实现' },
    { title: '方案设计', detail: '模块划分、状态管理、接口契约' },
    { title: '任务卡拆解', detail: '拆解为可执行的任务卡' },
  ],
}

// ============================================================
// 主流程
// ============================================================

phase('约束提取')
const context = args
log(`📋 需求: ${context.requirement}`)

// 读取项目规范
log('📖 读取项目规范...')

// 阶段1: 约束提取
phase('约束提取')
log('🔍 执行约束提取...')

// 阶段2: 方案设计
phase('方案设计')
log('🏗️ 执行架构设计...')

const designPrompt = `${ARCHITECTURE_SYSTEM}

---

## 待设计需求
${context.requirement}

## 需求梳理结果（如有）
${context.requirementAnalysis ? JSON.stringify(context.requirementAnalysis, null, 2) : '无'}

## 项目规范（如有）
${context.projectContext || '请基于通用前端最佳实践设计'}

请按结构化格式输出架构设计方案。`

const designResult = await agent(designPrompt, {
  label: 'architecture-design',
  phase: '方案设计',
  schema: ARCHITECTURE_SCHEMA,
})

// 检查需求是否充足
if (designResult.requirementIssues && designResult.requirementIssues.length > 0) {
  log('⚠️ 需求存在不足项')
}

// 阶段3: 任务卡拆解
phase('任务卡拆解')
log('📋 拆解任务卡...')

// 生成架构设计报告
const report = `# 架构设计方案

## 基本信息
| 字段 | 值 |
|------|-----|
| 需求 | ${context.requirement} |
| 设计时间 | ${new Date().toISOString()} |
| 状态 | ${designResult.requirementIssues?.length > 0 ? '⚠️ 需求不足' : '✅ 可推进'} |

${designResult.requirementIssues?.length > 0 ? `
## ⚠️ 需求不足项
${designResult.requirementIssues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

请先补齐上述信息后再进行架构设计。
` : ''}

## 方案总览
${designResult.overview || '无'}

## 关键决策
${(designResult.keyDecisions || []).map((d, idx) => `${idx + 1}. ${d}`).join('\n') || '无'}

## 文件清单

### ➕ 新增文件
| 文件路径 | 职责 |
|----------|------|
${(designResult.fileList?.add || []).map(f => `| ${f.path} | ${f.responsibility} |`).join('\n') || '| 无 | |'}

### 🔄 修改文件
| 文件路径 | 修改内容 |
|----------|----------|
${(designResult.fileList?.modify || []).map(f => `| ${f.path} | ${f.responsibility} |`).join('\n') || '| 无 | |'}

### ➖ 删除文件
${(designResult.fileList?.delete || []).map(f => `- ${f.path}: ${f.reason}`).join('\n') || '无'}

## 组件树与拆分边界
${(designResult.componentTree || []).map(c => `- ${c}`).join('\n') || '无'}

## 状态归属
| 状态 | 归属 | 理由 |
|------|------|------|
${(designResult.stateOwnership || []).map(s => `| ${s.state} | ${s.ownership} | ${s.reason} |`).join('\n') || '| 无 | | |'}

## 数据流
${designResult.dataFlow || '无'}

## 接口契约
${(designResult.apiContracts || []).map(a => `### ${a.name}
- 路径: ${a.path}
- 方法: ${a.method}
- 请求: ${JSON.stringify(a.request)}
- 响应: ${JSON.stringify(a.response)}
`).join('\n') || '无'}

## 路由设计
| 路由 | 组件 | 权限 |
|------|------|------|
${(designResult.routing || []).map(r => `| ${r.path} | ${r.component} | ${r.permission} |`).join('\n') || '| 无 | | |'}

## 风险与爆炸半径
${(designResult.risks || []).map(r => `- **${r.risk}**: ${r.mitigation}`).join('\n') || '无'}

## 方案取舍
${(designResult.alternatives || []).map(a => `### ${a.option}
- 优点: ${a.pros?.join('、')}
- 缺点: ${a.cons?.join('、')}
- 选择理由: ${a.reason}
`).join('\n') || '无'}

## 任务卡
${(designResult.taskCards || []).map((t, idx) => `
### 任务卡 ${idx + 1}: ${t.title}
- **目标**: ${t.goal}
- **涉及文件**: ${t.files?.join(', ')}
- **完成判定**: ${t.criteria}
- **依赖**: ${t.dependencies || '无'}
- **可并行**: ${t.parallel ? '✅' : '❌'}
`).join('\n')}
`

log('📝 架构设计方案已生成')

return {
  design: designResult,
  report,
  status: designResult.requirementIssues?.length > 0 ? 'needs_clarification' : 'ready',
  nextStep: designResult.requirementIssues?.length > 0 ? 'clarify_requirements' : 'architecture_review',
  message: designResult.requirementIssues?.length > 0
    ? `需求存在不足项，需补齐后再评审`
    : '架构设计完成，可以进入方案评审阶段',
}
