/**
 * 架构设计 Workflow
 *
 * 「前端架构师」只是下方内联 prompt 里的角色名，不是外部 Skill/Agent，
 * 不要用 Skill(前端架构师) 之类的方式去调用它。
 *
 * 本文件自包含：Workflow 运行时在隔离环境执行脚本，不提供文件系统访问，
 * 因此不能 import 外部模块。所有 prompt 与 schema 必须内联在本文件内。
 */

// ============================================================
// 内联 System Prompt
// ============================================================

const ARCHITECTURE_SYSTEM = `你是前端架构师。

你输出**可执行的技术方案**，不写业务实现代码。方案要精确到文件路径与职责边界，让开发 agent 无需二次决策即可落地。

## 执行流程

### 1. 约束提取（不许凭空设计）
- 读 CLAUDE.md/AGENTS.md/README，提取本项目的**强制规范**（组件写法、命名、样式方案、i18n、状态管理、请求封装）
- 读 package.json 与配置文件确认真实技术栈与版本
- Grep/Glob 勘查同类既有实现，**优先复用**现有组件、composable、工具与类型
- 项目规范与你的个人偏好冲突时，**一律以项目规范为准**

### 2. 方案设计
按以下结构输出：
- **方案总览**：核心思路一段话 + 关键决策 3~5 条
- **文件清单**：新增/修改/删除的路径与职责，含目录结构树
- **组件树与拆分边界**：父子层级、Smart（数据/逻辑容器）与 Dumb（纯展示）划分、Props/Emits 契约签名
- **状态归属**：哪些状态留组件本地，哪些进全局 store，哪些进 URL query，哪些只做服务端缓存。明确写出「为什么不放全局」
- **数据流**：请求时机（路由进入/挂载/交互触发）、缓存与失效策略、并发与竞态处理（取消、串行化、乐观更新回滚）
- **接口契约与类型**：请求/响应 TS 接口定义，字段可空性，后端数据到视图模型的规整层
- **路由与权限**：路由结构、meta 约定、守卫影响、免登录范围
- **样式与主题**：复用的语义色/变量/断点，禁止硬编码；深浅色适配落点
- **国际化**：新增文案 key 的命名空间规划，需同步的语言包文件清单
- **性能与健壮性**：首屏/长列表/大数据量策略（虚拟化、分页、懒加载）、内存释放点（定时器/监听/订阅在何处清理）、失败降级与骨架屏
- **风险与爆炸半径**：本方案会影响的既有模块，可能的回归点
- **方案取舍**：给出至少一个备选方案，写清优劣与选择理由

### 3. 任务卡拆解（交给开发 agent 的接口）
把方案切成有序、可独立验证的任务，每张卡包含：目标/涉及文件/完成判定。标注串行依赖与可并行项。

## 铁律
- **只出方案，不落盘业务代码**
- 不过度设计：没有第二个使用方就不要抽象层；没有明确性能问题就不要提前优化
- 需求本身不清晰（缺验收标准、缺异常流定义）时，输出 [需求不足] 并列出必须先补齐的信息
- 输出用中文、结构化 Markdown`

// ============================================================
// 内联 Schema
// ============================================================

const ARCHITECTURE_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string', description: '方案总览' },
    keyDecisions: { type: 'array', items: { type: 'string' } },
    fileList: {
      type: 'object',
      properties: {
        add: { type: 'array', items: { type: 'object' } },
        modify: { type: 'array', items: { type: 'object' } },
        delete: { type: 'array', items: { type: 'object' } },
      },
    },
    componentTree: { type: 'array', description: '组件树结构' },
    stateOwnership: { type: 'array', description: '状态归属决策' },
    dataFlow: { type: 'string', description: '数据流设计' },
    apiContracts: { type: 'array', description: '接口契约定义' },
    routing: { type: 'array', description: '路由设计' },
    risks: { type: 'array', description: '风险识别' },
    alternatives: { type: 'array', description: '方案取舍' },
    taskCards: { type: 'array', description: '任务卡' },
    requirementIssues: { type: 'array', description: '需求不足项' },
  },
  required: ['overview', 'fileList'],
}

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
// 用户直接输入 /fe-architecture 不带参数时 args 为 undefined，也可能只是一段文字；
// 运行时还有个已知 bug：args 有时以 JSON 字符串而非对象传入。先归一化再取字段，否则脚本会在这里以 TypeError 直接失败。
const parsedArgs = (() => {
  if (typeof args !== 'string') return args
  const s = args.trim()
  if (s.startsWith('{')) { try { return JSON.parse(s) } catch (e) { /* 不是 JSON，按纯文字处理 */ } }
  return { requirement: s }
})()
const context = (parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs)) ? parsedArgs : {}

if (!context.requirement) {
  log('🚫 未收到 requirement 入参，无法设计方案')
  return {
    design: {},
    report: '# 架构设计方案\n\n🚫 调用 fe-architecture 时未传入 requirement，未执行任何设计。请由编排方读取 triage 产物后重新调用。',
    status: 'invalid_args',
    missing: ['requirement'],
    nextStep: 'resolve_block',
    message: '缺少 requirement 入参：请传入需求描述（建议同时传 requirementAnalysis 与 projectContext）后重新调用',
  }
}

log(`📋 需求: ${context.requirement}`)
log('📖 读取项目规范...')
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

const designResult = (await agent(designPrompt, {
  label: 'architecture-design',
  phase: '方案设计',
  schema: ARCHITECTURE_SCHEMA,
})) || { requirementIssues: ['架构 agent 未返回结构化结果'] }

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
| 设计时间 | ${context.timestamp || '（由编排方落盘时填写）'} |
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
    : '架构设计完成，请与用户确认后再进入方案评审阶段',
}
