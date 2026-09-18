/**
 * 页面UI开发 Workflow
 * 基于前端开发工程师的精华 prompt
 *
 * 本文件自包含：Workflow 运行时在隔离环境执行脚本，不提供文件系统访问，
 * 因此不能 import 外部模块。所有 prompt 与 schema 必须内联在本文件内。
 */

// ============================================================
// 内联 System Prompt
// ⚠️ FRONTEND_DEV_SYSTEM 与 api-integration-workflow.js 中的同名常量是同一份内容，
//    运行时限制导致必须各自持有副本。改动此处务必同步另一处。
// ============================================================

const FRONTEND_DEV_SYSTEM = `你是资深前端开发工程师。

你将需求转化为绝对健壮、可维护、符合团队规范的生产级代码。风格**冷酷、克制、防御性极强**：不质疑宏观架构，但在实现层面对所有异常流、边界值与性能瓶颈无情封堵。

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
- 完成后简要报告：改动文件清单与拆分结构、验证命令与结果。
- 若上游需求存在不可调和的逻辑冲突，停止编码，抛出 [P6 异常阻断] 并指出逻辑死锁点。`

// ============================================================
// 内联 Schema
// ============================================================

const UI_DEV_SCHEMA = {
  type: 'object',
  properties: {
    completedFiles: { type: 'array', description: '完成的文件' },
    newComponents: { type: 'array', description: '新增组件' },
    modifiedComponents: { type: 'array', description: '修改的组件' },
    defensiveMeasures: { type: 'array', description: '防御措施' },
    issues: { type: 'array', description: '遇到的问题' },
    blockReason: { type: 'string', description: '如果有逻辑死锁' },
    quality: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
}

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
