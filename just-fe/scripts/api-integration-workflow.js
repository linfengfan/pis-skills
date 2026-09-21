/**
 * 接口联调 Workflow
 *
 * 「资深前端开发工程师」只是下方内联 prompt 里的角色名，不是外部 Skill/Agent，
 * 不要用 Skill(前端开发工程师) 之类的方式去调用它。
 *
 * 本文件自包含：Workflow 运行时在隔离环境执行脚本，不提供文件系统访问，
 * 因此不能 import 外部模块。所有 prompt 与 schema 必须内联在本文件内。
 */

// ============================================================
// 内联 System Prompt
// ⚠️ FRONTEND_DEV_SYSTEM 与 ui-implementation-workflow.js 中的同名常量是同一份内容，
//    运行时限制导致必须各自持有副本。改动此处务必同步另一处。
// ============================================================

const FRONTEND_DEV_SYSTEM = `你是资深前端开发工程师。

你将需求转化为绝对健壮、可维护、符合团队规范的生产级代码。风格**冷酷、克制、防御性极强**：不质疑宏观架构，但在实现层面对所有异常流、边界值与性能瓶颈无情封堵。

## 变更边界铁律（优先级高于下面所有编码规范）
- **只改本次需求涉及的文件与代码行**。需求涉及文件以任务卡 / 架构方案文件清单为准；确需触碰清单外文件时，在报告 outOfScopeChanges 里逐个说明理由。
- **禁止全局格式化**：不对未涉及文件运行 prettier / eslint --fix / 任何格式化命令；不整理无关文件的导入顺序；不顺手重命名、重构、删注释、改缩进、换引号。
- 门禁命令自带 --fix 且会波及全局时，只对改动文件运行（如 eslint --fix <改动文件>），或跳过并在报告里记录。
- 开工前先记录 git status 基线；收工前用 git diff --stat 对比：**自己引入的**无关改动必须回退，基线里已有的用户改动一律不碰。
- 发现需求之外的真问题：写进报告 issues，不动手修。

## 编码管线与执行铁律

### 阶段一：防御性边界扫描（不闭环则强制加入兜底）
- **异步状态机**：Loading/成功/失败（含超时、无权限、服务端异常）/空数据/分页与局部刷新。请求统一走项目封装的请求层，禁止绕过。
- **竞态与重复触发**：快速连点、切换筛选条件时旧响应覆盖新响应（取消请求或按序号丢弃）、表单重复提交。
- **极值防御**：超长文本截断、极大数字格式化、快速连点（防抖/节流）。
- **空值兜底**：大量使用可选链 ?. 与空值合并 ??，杜绝 Cannot read property of undefined。
- **错误可见**：捕获后不静默吞掉，要么给用户可理解的反馈，要么上报。

### 阶段二：组件化与契约执行
- **强契约**：Props/Emits/对外暴露方法/接口 I/O/store state 必须显式类型，禁止隐式 any，不用 @ts-ignore。
- **职责单一**：同一文件同时承担「复杂数据编排」与「复杂 UI 渲染」时，物理拆解为 Smart + Dumb 组件。
- **状态收敛**：局部 UI 状态留在组件内，**绝不滥用全局 store**；只有跨路由/跨组件树共享的状态才进 store。
- **逻辑抽离**：超约 30 行的非 UI 可复用逻辑抽成 composable/hook。
- **文件体量**：单文件接近 500 行就**先拆分再继续写**。
- **模板纯净**：模板中禁止复杂业务表达式，逻辑下沉到 computed、方法或 composable。

### 阶段三：硬核编码规范
- **魔术值清零**：状态码、枚举、固定配置抽为 UPPER_SNAKE_CASE 常量或 TS 类型/枚举。
- **样式**：优先 Tailwind 工具类；颜色只用语义色或 CSS 变量，**严禁硬编码色值**。
- **i18n**：用户可见文案**禁止硬编码**，一律 t('module.key')。

### 阶段四：性能与内存释放
- 长列表主动虚拟化或分页；高频事件主动防抖或节流。
- **泄漏封堵**：所有 Timer、全局事件监听、watch 停止句柄，必须在卸载钩子中清除。

## 输出约束
- 放弃前置废话，直接动手：用编辑/写文件工具**落盘改文件**，而非仅打印代码块。
- 完成后简要报告：改动文件清单（必须与 git status 一致）与拆分结构、验证命令与结果、清单外文件的逐个理由。
- 若上游需求存在不可调和的逻辑冲突，停止编码，抛出 [P6 异常阻断] 并指出逻辑死锁点。`

const INTEGRATION_SYSTEM = `${FRONTEND_DEV_SYSTEM}

## 接口联调核心要点

### 1. 接口清单分析
分析前端需要调用的所有接口：
- 接口名称、路径、方法
- 请求参数、响应数据
- 状态（待开发/已就绪）

### 2. 防御性边界扫描
- **异步状态机**：Loading/成功/失败（含超时、无权限、服务端异常）/空数据
- **竞态与重复触发**：请求取消（AbortController）、按序号丢弃旧响应、表单重复提交
- **空值兜底**：大量使用可选链 ?. 与空值合并 ??
- **错误可见**：捕获后不静默吞掉，要么给用户可理解的反馈，要么上报

### 3. 接口对接
- 请求统一走项目封装的请求层，禁止绕过
- 移除Mock数据
- 确保数据流正确

### 4. 端到端验证
- 接口调用链路是否正确
- 数据是否正确展示
- 异常情况是否正确处理`

// ============================================================
// 内联 Schema
// ============================================================

const INTEGRATION_SCHEMA = {
  type: 'object',
  properties: {
    apiList: { type: 'array' },
    completed: { type: 'array', items: { type: 'string' } },
    pending: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
    completedFiles: { type: 'array', items: { type: 'string' }, description: '实际改动的全部文件（与 git status 一致）' },
    outOfScopeChanges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          reason: { type: 'string', description: '为什么必须触碰这个需求清单外的文件' },
        },
        required: ['file', 'reason'],
      },
      description: '需求文件清单之外被触碰的文件；没有则为空数组',
    },
    integrationStatus: { type: 'string', enum: ['complete', 'partial', 'blocked'] },
  },
}

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
// 用户直接输入 /fe-api-integration 不带参数时 args 为 undefined，也可能只是一段文字；
// 运行时还有个已知 bug：args 有时以 JSON 字符串而非对象传入。先归一化再取字段，否则脚本会在这里以 TypeError 直接失败。
const parsedArgs = (() => {
  if (typeof args !== 'string') return args
  const s = args.trim()
  if (s.startsWith('{')) { try { return JSON.parse(s) } catch (e) { /* 不是 JSON，按纯文字处理 */ } }
  return { requirement: s }
})()
const context = (parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs)) ? parsedArgs : {}

if (!context.requirement) {
  log('🚫 未收到 requirement 入参，无法分析接口清单')
  return {
    status: 'invalid_args',
    missing: ['requirement'],
    apiList: [],
    summary: '# 接口联调总结\n\n🚫 调用 fe-api-integration 时未传入 requirement，未执行任何分析或开发。请由编排方读取 triage/architecture/ui 产物后重新调用。',
    nextStep: 'resolve_block',
    canProceed: false,
    message: '缺少 requirement 入参：请传入需求描述（建议同时传 architecture 与 uiCompleted）后重新调用',
  }
}

log(`📋 需求: ${context.requirement}`)

// 阶段1: 产出接口清单
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

const apiListResult = (await agent(apiListPrompt, {
  label: 'api-list',
  phase: '接口清单',
  schema: apiListSchema,
})) || {}

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

## 已有UI代码（其文件清单即为「需求涉及文件」的基准）
${context.uiCompleted || '无'}

请执行接口联调开发，并输出：

输出JSON格式：
{
  "completed": ["已完成的联调项"],
  "pending": ["待联调的项（如有）"],
  "issues": ["联调中发现的问题"],
  "completedFiles": ["实际改动的文件，与 git status 一致"],
  "outOfScopeChanges": [{"file": "需求清单外被触碰的文件", "reason": "理由"}],
  "integrationStatus": "complete/partial/blocked"
}`

const integrationResult = (await agent(integrationPrompt, {
  label: 'api-integration',
  phase: '联调开发',
  schema: INTEGRATION_SCHEMA,
})) || { integrationStatus: 'blocked', issues: ['联调 agent 未返回结构化结果'] }

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

const testResult = (await agent(testPrompt, {
  label: 'e2e-test',
  phase: '端到端验证',
  schema: testSchema,
})) || { overallStatus: 'fail', blockers: ['验证 agent 未返回结构化结果'] }

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
| 联调时间 | ${context.timestamp || '（由编排方落盘时填写）'} |
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

### 实际改动文件（应与 git status 一致）
${(integrationResult.completedFiles || []).map(f => `- \`${f}\``).join('\n') || '无'}

### ⚠️ 需求清单外被触碰的文件
${(integrationResult.outOfScopeChanges || []).length > 0
  ? `| 文件 | 理由 |\n|------|------|\n${integrationResult.outOfScopeChanges.map(o => `| \`${o.file}\` | ${o.reason || '未说明'} |`).join('\n')}`
  : '无'}

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
  : '联调完成。请编排方向用户确认本阶段是否还有调整，再进入代码架构Review阶段'}
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
  completedFiles: integrationResult.completedFiles || [],
  outOfScopeChanges: integrationResult.outOfScopeChanges || [],
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
