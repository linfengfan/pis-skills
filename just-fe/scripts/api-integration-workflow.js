/**
 * 接口联调 Workflow
 * 基于前端开发工程师的精华 prompt
 */

import { INTEGRATION_SYSTEM } from './shared/prompts.js'
import { INTEGRATION_SCHEMA } from './shared/schemas.js'

export const meta = {
  name: 'fe-api-integration',
  description: '前端接口联调：产出接口清单 + 基于开发工程师标准的联调开发',
  phases: [
    { title: '接口清单', detail: '分析需求，产出前端依赖接口清单' },
    { title: '防御检查', detail: '竞态、幂等、异常处理' },
    { title: '联调开发', detail: '接入真实接口' },
    { title: '端到端验证', detail: '数据流验证' },
  ],
}

// ============================================================
// 主流程
// ============================================================

phase('接口清单')
const context = args
log(`📋 需求: ${context.requirement}`)

// 阶段1: 产出接口清单
phase('接口清单')
log('📝 分析并产出前端依赖接口清单...')

const apiListPrompt = `你是前端开发者，分析需求并产出前端依赖接口清单。

需求：
${context.requirement}

架构方案（接口设计部分）：
${context.architecture || '无'}

请分析前端需要调用的所有接口：

接口清单格式：
| 接口名称 | 方法 | 路径 | 状态 | 备注 |
|----------|------|------|------|------|

请输出JSON格式：
{
  "apiList": [
    {
      "name": "接口名称",
      "method": "GET/POST/PUT/DELETE",
      "path": "接口路径",
      "requestParams": "请求参数说明",
      "responseData": "响应数据说明",
      "status": "待开发/已就绪",
      "notes": "备注"
    }
  ],
  "totalCount": 接口总数,
  "readyCount": 已就绪接口数,
  "pendingCount": 待开发接口数
}`

const apiListSchema = {
  type: 'object',
  properties: {
    apiList: { type: 'array' },
    totalCount: { type: 'number' },
    readyCount: { type: 'number' },
    pendingCount: { type: 'number' },
  },
}

const apiListResult = await agent(apiListPrompt, {
  label: 'api-list',
  phase: '接口清单',
  schema: apiListSchema,
})

log('📋 接口清单产出完成')
log(`📊 总接口数: ${apiListResult.totalCount || 0}`)
log(`✅ 已就绪: ${apiListResult.readyCount || 0}`)
log(`⏳ 待开发: ${apiListResult.pendingCount || 0}`)

// 如果有待开发接口，提示等待
if (apiListResult.pendingCount > 0) {
  log(`⚠️ 等待 ${apiListResult.pendingCount} 个接口就绪后再联调`)

  return {
    apiList: apiListResult.apiList || [],
    totalCount: apiListResult.totalCount,
    readyCount: apiListResult.readyCount,
    pendingCount: apiListResult.pendingCount,
    status: 'awaiting_apis',
    message: `有 ${apiListResult.pendingCount} 个接口待开发，请等待接口就绪后再进行联调`,
  }
}

// 阶段2: 防御检查
phase('防御检查')
log('🛡️ 执行防御性边界扫描...')

// 阶段3: 联调开发
phase('联调开发')
log('🔗 开始接口联调开发...')

const integrationPrompt = `${INTEGRATION_SYSTEM}

---

## 待联调需求
${context.requirement}

## 接口清单
${JSON.stringify(apiListResult.apiList, null, 2)}

## 已有UI代码
${context.uiCompleted || '无'}

请执行接口联调开发，并输出：

输出JSON格式：
{
  "completed": ["已完成的联调项"],
  "pending": ["待联调的项（如有）"],
  "issues": ["联调中发现的问题"],
  "integrationStatus": "complete/partial/blocked"
}`

const integrationResult = await agent(integrationPrompt, {
  label: 'api-integration',
  phase: '联调开发',
  schema: INTEGRATION_SCHEMA,
})

log('✅ 接口联调完成')
log(`📊 完成度: ${integrationResult.completed?.length || 0}项`)

// 阶段4: 端到端验证
phase('端到端验证')
log('🧪 执行端到端验证...')

const testPrompt = `对以下接口联调结果进行端到端验证：

需求：${context.requirement}
已完成联调：${(integrationResult.completed || []).join('、')}

验证项：
1. 接口调用链路是否正确
2. 数据是否正确展示
3. 异常情况是否正确处理
4. Loading状态是否正确

输出JSON：
{
  "testResults": [
    {"case": "用例名称", "passed": true/false, "reason": "原因"}
  ],
  "overallStatus": "pass/fail",
  "blockers": ["阻塞问题（如有）"]
}`

const testSchema = {
  type: 'object',
  properties: {
    testResults: { type: 'array' },
    overallStatus: { type: 'string', enum: ['pass', 'fail'] },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

const testResult = await agent(testPrompt, {
  label: 'e2e-test',
  phase: '端到端验证',
  schema: testSchema,
})

if (testResult.overallStatus === 'pass') {
  log('✅ 端到端验证通过')
} else {
  log('⚠️ 端到端验证存在失败项')
}

// 生成联调报告
const report = `# 接口联调总结

## 联调信息
| 字段 | 值 |
|------|-----|
| 需求 | ${context.requirement} |
| 联调时间 | ${new Date().toISOString()} |
| 联调状态 | ${integrationResult.integrationStatus} |

## 接口清单
- 总接口数: ${apiListResult.totalCount}
- 已就绪: ${apiListResult.readyCount}
- 待开发: ${apiListResult.pendingCount}

### 接口详情
| 接口名称 | 方法 | 路径 | 状态 |
|----------|------|------|------|
${(apiListResult.apiList || []).map(api =>
`| ${api.name} | ${api.method} | ${api.path} | ${api.status} |`
).join('\n')}

## 完成情况
### 已完成
${(integrationResult.completed || []).map(t => `- ${t}`).join('\n') || '无'}

### 待完成
${(integrationResult.pending || []).map(t => `- ${t}`).join('\n') || '无'}

## 端到端验证
| 测试项 | 结果 |
|--------|------|
${(testResult.testResults || []).map(t =>
`| ${t.case} | ${t.passed ? '✅' : '❌'} |`
).join('\n')}

**总体状态**: ${testResult.overallStatus === 'pass' ? '✅ 通过' : '❌ 存在失败'}

${testResult.blockers?.length > 0 ? `
## 🔴 阻塞问题
${testResult.blockers.map(b => `- ${b}`).join('\n')}
` : ''}

## 下一步
${integrationResult.integrationStatus === 'blocked' || testResult.overallStatus === 'fail'
  ? '存在阻塞问题，需解决后重新联调'
  : '联调完成，可以进入代码架构Review阶段'}
`

log('📝 联调总结已生成')

return {
  apiList: apiListResult.apiList || [],
  totalCount: apiListResult.totalCount,
  readyCount: apiListResult.readyCount,
  pendingCount: apiListResult.pendingCount,
  completed: integrationResult.completed || [],
  pending: integrationResult.pending || [],
  issues: integrationResult.issues || [],
  integrationStatus: integrationResult.integrationStatus,
  testResults: testResult.testResults || [],
  overallStatus: testResult.overallStatus,
  blockers: testResult.blockers || [],
  summary: report,
  status: integrationResult.integrationStatus,
  nextStep: integrationResult.integrationStatus !== 'blocked' && testResult.overallStatus !== 'fail'
    ? 'code-arch-review'
    : 'resolve_block',
  canProceed: integrationResult.integrationStatus !== 'blocked' && testResult.overallStatus !== 'fail',
  message: integrationResult.integrationStatus !== 'blocked' && testResult.overallStatus !== 'fail'
    ? '联调完成，可以进入代码架构Review阶段'
    : '存在阻塞问题，请解决后再继续',
}
