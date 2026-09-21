/**
 * 页面UI开发 Workflow
 *
 * 「资深前端开发工程师」只是下方内联 prompt 里的角色名，不是外部 Skill/Agent，
 * 不要用 Skill(前端开发工程师) 之类的方式去调用它。
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

// ============================================================
// 内联 Schema
// ============================================================

const UI_DEV_SCHEMA = {
  type: 'object',
  properties: {
    completedFiles: { type: 'array', items: { type: 'string' }, description: '实际改动的全部文件（与 git status 一致）' },
    newComponents: { type: 'array', description: '新增组件' },
    modifiedComponents: { type: 'array', description: '修改的组件' },
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
      description: '任务卡/方案文件清单之外被触碰的文件；没有则为空数组',
    },
    defensiveMeasures: { type: 'array', description: '防御措施' },
    issues: { type: 'array', description: '遇到的问题、发现但未修的需求外问题' },
    blockReason: { type: 'string', description: '如果有逻辑死锁' },
    quality: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
}

export const meta = {
  name: 'fe-ui-implementation',
  description: '前端UI开发：基于设计稿开发页面UI（Mock 数据）',
  phases: [
    { title: '准入检查', detail: '确认需求与设计稿输入齐全' },
    { title: '组件开发', detail: '防御扫描、强契约、职责单一、状态收敛' },
    { title: '开发报告', detail: '改动清单、越界自查、下一步' },
  ],
}

// ============================================================
// 主流程
// ============================================================

phase('准入检查')
// 用户直接输入 /fe-ui-implementation 不带参数时 args 为 undefined，也可能只是一段文字；
// 先归一化再取字段，否则脚本会在这里以 TypeError 直接失败。
const context = typeof args === 'string'
  ? { requirement: args }
  : (args && typeof args === 'object' && !Array.isArray(args)) ? args : {}

const hasFigma = typeof context.figmaUrl === 'string' && context.figmaUrl.trim().length > 0
const noDesignReason = typeof context.noDesignReason === 'string' ? context.noDesignReason.trim() : ''

log(`📋 需求: ${context.requirement || '（未提供）'}`)
log(`🎨 设计稿: ${hasFigma ? context.figmaUrl : noDesignReason ? `无设计稿（用户确认：${noDesignReason}）` : '未提供'}`)

// 准入 1：没有需求描述就没法开发，直接返回让编排方补齐
if (!context.requirement) {
  log('🚫 未收到 requirement 入参，无法开始 UI 开发')
  return {
    status: 'invalid_args',
    missing: ['requirement'],
    blockReason: '缺少需求描述',
    report: '# 页面UI开发报告\n\n🚫 调用 fe-ui-implementation 时未传入 requirement，未执行任何开发。请由编排方读取 triage/architecture 产物后重新调用。',
    nextStep: 'resolve_block',
    message: '缺少 requirement 入参：请传入需求描述（以及 figmaUrl 或 noDesignReason）后重新调用',
  }
}

// 准入 2：Workflow 运行中无法向用户提问，所以「要设计稿」这一步只能发生在调用之前。
// 既没有设计稿链接、也没有用户明确确认「无设计稿按现有风格」时，这里直接返回，
// 由编排方（主 agent）去问用户，而不是让开发 agent 凭想象画界面。
if (!hasFigma && !noDesignReason) {
  log('🎨 缺少设计稿输入，UI 开发未启动，请编排方先向用户索取设计稿链接')
  return {
    status: 'needs_design',
    missing: ['figmaUrl | noDesignReason'],
    blockReason: '缺少设计稿：未提供 figmaUrl，也没有用户确认的 noDesignReason',
    report: `# 页面UI开发报告

## 🎨 等待设计稿

本次需求涉及页面/组件改动，但调用时既没有设计稿链接（figmaUrl），也没有用户明确确认「无设计稿，按现有风格实现」（noDesignReason）。

UI 开发未启动。请编排方向用户确认以下任一项后重新调用：
1. 设计稿链接（Figma / 蓝湖 / MasterGo / 截图路径均可）
2. 明确回复「没有设计稿，按现有页面风格实现」——并把这句话作为 noDesignReason 传入

需求：${context.requirement}
`,
    nextStep: 'ask_user_for_design',
    message: '缺少设计稿：请向用户索取设计稿链接，或让用户明确确认无设计稿后以 noDesignReason 传入，再重新调用',
  }
}

// 组件开发（防御扫描 → 契约 → 规范 → 性能，都在同一个开发 agent 内完成）
phase('组件开发')
log('🎨 开始UI组件开发...')

const designSection = hasFigma
  ? `${context.figmaUrl}
若当前环境有 Figma MCP / 设计稿读取工具，先读取设计上下文（布局、间距、颜色 token、组件层级）再动手；读不到时如实在 issues 里记录，并按需求描述 + 项目既有组件风格实现。`
  : `无设计稿。用户已确认：「${noDesignReason}」
按同类既有页面的风格、间距与组件库用法实现，不自行发明视觉规范。`

const developmentPrompt = `${FRONTEND_DEV_SYSTEM}

---

## 待开发需求
${context.requirement}

## 设计稿
${designSection}

## 任务卡（如有，其文件清单即为「需求涉及文件」的基准）
${context.taskCards ? JSON.stringify(context.taskCards, null, 2) : '无'}

## 数据来源
本阶段使用 Mock 数据完成 UI，接口在下一阶段联调；Mock 要放在项目约定的位置，便于联调时整体移除。

请执行UI开发，产出生产级代码。`

const devResult = await agent(developmentPrompt, {
  label: 'ui-development',
  phase: '组件开发',
  schema: UI_DEV_SCHEMA,
})

// agent 可能不返回结构化结果，后面全部按空对象处理
const dev = devResult || {}

// 检查逻辑死锁
if (dev.blockReason) {
  log(`🚫 检测到逻辑死锁: ${dev.blockReason}`)
}

const outOfScope = Array.isArray(dev.outOfScopeChanges) ? dev.outOfScopeChanges : []
if (outOfScope.length > 0) {
  log(`⚠️ 触碰了 ${outOfScope.length} 个需求清单外的文件，已要求逐个说明理由，Review 阶段会复核`)
}

phase('开发报告')

// 生成开发报告
const report = `# 页面UI开发报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 需求 | ${context.requirement} |
| 设计稿 | ${hasFigma ? context.figmaUrl : `无（用户确认：${noDesignReason}）`} |
| 开发时间 | ${new Date().toISOString()} |
| 质量评估 | ${dev.quality || 'medium'} |

${dev.blockReason ? `
## 🚫 逻辑死锁
${dev.blockReason}
` : ''}

## 完成文件

### 实际改动文件（应与 git status 一致）
${(dev.completedFiles || []).map(f => `- \`${f}\``).join('\n') || '无'}

### ➕ 新增组件
${(dev.newComponents || []).map(c => `- \`${c}\``).join('\n') || '无'}

### 🔄 修改组件
${(dev.modifiedComponents || []).map(c => `- \`${c}\``).join('\n') || '无'}

### ⚠️ 需求清单外被触碰的文件
${outOfScope.length > 0
  ? `| 文件 | 理由 |\n|------|------|\n${outOfScope.map(o => `| \`${o.file}\` | ${o.reason || '未说明'} |`).join('\n')}`
  : '无'}

## 防御措施
${(dev.defensiveMeasures || []).map(m => `- ${m}`).join('\n') || '无'}

## 问题记录
${(dev.issues || []).map(i => `- ${i}`).join('\n') || '无'}

## 下一步
${dev.blockReason ? '存在逻辑死锁，需解决后再继续' : 'UI开发完成。请编排方向用户确认本阶段是否还有调整，再进入接口联调阶段'}
`

log('📝 UI开发报告已生成')

return {
  completedFiles: dev.completedFiles || [],
  newComponents: dev.newComponents || [],
  modifiedComponents: dev.modifiedComponents || [],
  outOfScopeChanges: outOfScope,
  defensiveMeasures: dev.defensiveMeasures || [],
  issues: dev.issues || [],
  blockReason: dev.blockReason,
  quality: dev.quality || 'medium',
  design: hasFigma ? { figmaUrl: context.figmaUrl } : { noDesignReason },
  report,
  status: dev.blockReason ? 'blocked' : 'completed',
  nextStep: dev.blockReason ? 'resolve_block' : 'api-integration',
  message: dev.blockReason
    ? `存在逻辑死锁: ${dev.blockReason}`
    : 'UI开发完成，请与用户确认后再进入接口联调阶段',
}
