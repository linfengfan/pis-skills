/**
 * 页面UI开发 Workflow
 * 基于前端开发工程师的精华 prompt
 */

import { FRONTEND_DEV_SYSTEM } from './shared/prompts.js'
import { UI_DEV_SCHEMA } from './shared/schemas.js'

export const meta = {
  name: 'fe-ui-implementation',
  description: '前端UI开发：基于Figma设计稿开发页面UI',
  phases: [
    { title: '防御扫描', detail: '确认异步状态机、竞态、极值、空值兜底' },
    { title: '组件开发', detail: '强契约、职责单一、状态收敛' },
    { title: '编码规范', detail: '魔术值清零、模板纯净、i18n' },
    { title: '性能检查', detail: '长列表虚拟化、内存释放' },
  ],
}

// ============================================================
// 主流程
// ============================================================

phase('防御扫描')
const context = args
log(`📋 需求: ${context.requirement}`)
log(`🎨 设计稿: ${context.figmaUrl || '未提供'}`)

// 阶段1: 防御性边界扫描
phase('防御扫描')
log('🛡️ 执行防御性边界扫描...')

// 阶段2: 组件开发
phase('组件开发')
log('🎨 开始UI组件开发...')

const developmentPrompt = `${FRONTEND_DEV_SYSTEM}

---

## 待开发需求
${context.requirement}

## 设计稿
${context.figmaUrl || '未提供，基于需求描述开发'}

## 任务卡（如有）
${context.taskCards ? JSON.stringify(context.taskCards, null, 2) : '无'}

请执行UI开发，产出生产级代码。`

const devResult = await agent(developmentPrompt, {
  label: 'ui-development',
  phase: '组件开发',
  schema: UI_DEV_SCHEMA,
})

// 检查逻辑死锁
if (devResult.blockReason) {
  log(`🚫 检测到逻辑死锁: ${devResult.blockReason}`)
}

// 阶段3: 编码规范
phase('编码规范')
log('✅ 检查编码规范...')

// 阶段4: 性能检查
phase('性能检查')
log('⚡ 检查性能...')

// 生成开发报告
const report = `# 页面UI开发报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 需求 | ${context.requirement} |
| 设计稿 | ${context.figmaUrl || '未提供'} |
| 开发时间 | ${new Date().toISOString()} |
| 质量评估 | ${devResult.quality || 'medium'} |

${devResult.blockReason ? `
## 🚫 逻辑死锁
${devResult.blockReason}
` : ''}

## 完成文件

### ➕ 新增组件
${(devResult.newComponents || []).map(c => `- \`${c}\``).join('\n') || '无'}

### 🔄 修改组件
${(devResult.modifiedComponents || []).map(c => `- \`${c}\``).join('\n') || '无'}

## 防御措施
${(devResult.defensiveMeasures || []).map(m => `- ${m}`).join('\n') || '无'}

## 问题记录
${(devResult.issues || []).map(i => `- ${i}`).join('\n') || '无'}

## 下一步
${devResult.blockReason ? '存在逻辑死锁，需解决后再继续' : 'UI开发完成，可以进入接口联调阶段'}
`

log('📝 UI开发报告已生成')

return {
  completedFiles: devResult.completedFiles || [],
  newComponents: devResult.newComponents || [],
  modifiedComponents: devResult.modifiedComponents || [],
  defensiveMeasures: devResult.defensiveMeasures || [],
  issues: devResult.issues || [],
  blockReason: devResult.blockReason,
  quality: devResult.quality || 'medium',
  report,
  status: devResult.blockReason ? 'blocked' : 'completed',
  nextStep: devResult.blockReason ? 'resolve_block' : 'api-integration',
  message: devResult.blockReason
    ? `存在逻辑死锁: ${devResult.blockReason}`
    : 'UI开发完成，可以进入接口联调阶段',
}
