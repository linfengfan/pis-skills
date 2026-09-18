/**
 * 代码架构Review Workflow
 * 基于代码审核者的精华 prompt
 * 七维度并行打分，80分红线；出现任一 🔴 致命问题一律不通过
 *
 * 本文件自包含：Workflow 运行时在隔离环境执行脚本，不提供文件系统访问，
 * 因此不能 import 外部模块。所有 prompt 与 schema 必须内联在本文件内。
 */

export const meta = {
  name: 'fe-code-arch-review',
  description: '代码架构Review：代码审核者标准，七维度并行打分，80分红线，致命问题一票否决',
  phases: [
    { title: '锁定边界', detail: '确定变更范围' },
    { title: '分级审查', detail: '七维度并行审查：逻辑→健壮性→类型→架构→规范→安全→回归' },
    { title: '评分结论', detail: '加权汇总，输出评分与合并/打回结论' },
  ],
}

// ============================================================
// 内联 Schema
// ============================================================

const CODE_DIMENSION_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    score: { type: 'number' },
    maxScore: { type: 'number' },
    findings: { type: 'array', items: { type: 'string' }, description: '本维度的审查发现' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['critical', 'minor', 'tip'], description: 'critical=🔴致命 minor=🟡异味 tip=🟢提示' },
          location: { type: 'string', description: '文件:行号，必须具体到行' },
          issue: { type: 'string', description: '问题本质' },
          consequence: { type: 'string', description: '会导致什么现象或数据问题；critical 必填' },
          fix: { type: 'string', description: '具体修法' },
        },
        required: ['level', 'location', 'issue'],
      },
    },
    pendingConfirmations: { type: 'array', items: { type: 'string' }, description: '无法判定、需人工确认的点' },
    changeSummary: { type: 'string', description: '仅回归维度需填：一句话概括本次改动干了什么' },
    blastRadius: { type: 'array', items: { type: 'string' }, description: '仅回归维度需填：会波及的模块与回归点' },
    verificationPoints: { type: 'array', items: { type: 'string' }, description: '仅回归维度需填：必须人工验证的操作路径' },
    recommendation: { type: 'string' },
  },
  required: ['dimension', 'score', 'maxScore'],
}

// ============================================================
// 共用审查纪律（每个维度 prompt 都会带上）
// ============================================================

const REVIEW_DISCIPLINE = `你是代码评审终审官，只负责**一个指定维度**。

你捍卫代码库的长期可维护性。丢弃礼貌与迎合，只做纯工程判断：指出问题、给出修法、下结论。**你不改代码**。

## 锁定变更边界（先做这一步）
- 用 git status/git diff 确定本次改动的**确切范围**，只审查变更内容及其直接影响面
- **必须同时审查删除与修改的行**，不能只看新增
- 读 CLAUDE.md/AGENTS.md 提取项目强制规范，**以项目规范为唯一评判基准**
- 变更超过 15 个文件时，按模块分组审查

## 问题分级
- \`critical\` 🔴 **致命**：必须修复才能合并。每条必须能指到具体行**并说明后果**（会导致什么现象/数据问题）
- \`minor\` 🟡 **异味**：应修复或明确记录取舍
- \`tip\` 🟢 **提示**：可选优化

## 铁律
- **只审查，不落盘修改**
- 只报你负责的维度，别的维度交给别的评审员，不要越界
- 找不到真实问题时，如实给高分并说明「本维度未发现问题」——**严禁为了压分编造问题**
- 无法判定的地方写进 pendingConfirmations，不要伪装成结论
- 输出用中文`

// ============================================================
// 七维度定义（配分合计 100）
// ============================================================

const REVIEW_DIMENSIONS = {
  'logic-correctness': {
    maxScore: 25,
    prompt: `你评审「逻辑正确性」维度（25分）——**这是最高优先级维度**。

评分标准：
- 25分: 逻辑严密，边界处理准确，与需求完全一致
- 20分: 逻辑正确，有极小的可读性隐患
- 15分: 存在 1 个非致命逻辑瑕疵
- 10分: 存在会在特定路径下出错的逻辑缺陷
- <10分: 存在必然出错的逻辑错误

必须逐项检查：
1. 条件判断方向写反、边界取值差一（> 与 >=、分页 offset）
2. 异步顺序错误：依赖未就绪就读取、await 遗漏、并发请求结果被错误顺序覆盖
3. 状态更新遗漏或不同步：改了 A 忘了联动 B、缓存未失效
4. 副作用重复触发：watch 与生命周期钩子重复执行、请求发两次
5. 与需求/方案不符：实现了但和验收标准有偏差`,
  },

  'robustness': {
    maxScore: 20,
    prompt: `你评审「健壮性与异常流」维度（20分）。

评分标准：
- 20分: 全部异常路径都有落点，错误可见可恢复
- 16分: 主要异常路径覆盖，个别极值未处理
- 12分: 覆盖不全，缺 2~3 类异常处理
- <12分: 只写了正向路径

必须逐项检查：
1. Loading / 失败（超时、无权限、服务端异常）/ 空数据 / 极值 / 竞态与重复提交，是否都有落点
2. 错误被静默吞掉（catch 里既不反馈也不上报）
3. 深层取值无兜底（缺 ?. 与 ??）
4. 未清理的 Timer、全局事件监听、watch 停止句柄——**内存泄漏一律记 critical**`,
  },

  'architecture': {
    maxScore: 15,
    prompt: `你评审「架构与可维护性」维度（15分）。

评分标准：
- 15分: 职责边界清晰，无重复实现，完全复用既有能力
- 12分: 结构合理，有小的耦合
- 8分: 存在职责混杂或重复实现
- <8分: 结构失控

必须逐项检查：
1. 单文件超项目阈值未拆分；逻辑容器与展示组件职责混杂
2. 局部状态被误放全局 store
3. 可复用逻辑重复实现——**必须指出已有实现的位置（文件:行号）**
4. 绕过项目统一请求封装；硬编码域名/环境值
5. 新增依赖是否必要（能否用现有依赖实现）`,
  },

  'type-safety': {
    maxScore: 10,
    prompt: `你评审「类型安全与契约」维度（10分）。

评分标准：
- 10分: 对外契约全部显式类型，无逃逸
- 8分: 有个别可推断的隐式类型
- 5分: 存在 any 或断言掩盖问题
- <5分: 类型系统被大面积绕过

必须逐项检查：
1. Props/Emits/对外暴露方法/接口 I/O/store state 是否显式类型
2. 隐式 any、@ts-ignore、as 强制断言是否在掩盖真实问题
3. 接口响应字段可空性是否如实反映在类型里
4. 枚举/状态码是否用类型或常量约束，而非裸字符串`,
  },

  'convention': {
    maxScore: 10,
    prompt: `你评审「规范一致性」维度（10分）。

项目规范（唯一评判基准，为空则按同目录既有代码的写法推断）：
{profile}

评分标准：
- 10分: 完全符合项目规范
- 8分: 基本符合，有合理例外
- 5分: 部分偏离规范
- <5分: 严重偏离规范

必须逐项检查：
1. 组件写法、命名、目录归属、导入方式是否符合项目规范
2. 样式：硬编码色值、未使用项目语义 token/变量、作用域泄漏
3. 国际化：用户可见文案硬编码；多语言包未同步
4. 魔术值：状态码/枚举/固定配置是否抽为常量`,
  },

  'security-a11y': {
    maxScore: 10,
    prompt: `你评审「安全与可访问性」维度（10分）。

评分标准：
- 10分: 无安全问题，交互可键盘完成
- 8分: 无安全问题，可访问性有小瑕疵
- 5分: 存在可访问性缺失或轻度信息暴露
- <5分: 存在安全问题——**密钥硬编码、未转义注入、越权入口一律记 critical**

必须逐项检查：
1. 密钥/token 硬编码；日志或错误信息泄漏敏感数据
2. 未转义的富文本注入（v-html / dangerouslySetInnerHTML）
3. 越权可见的入口：前端隐藏但接口未校验
4. 交互元素键盘不可达、焦点管理缺失、图标按钮无可读名称`,
  },

  'blast-radius': {
    maxScore: 10,
    prompt: `你评审「爆炸半径与回归风险」维度（10分），并额外产出本次变更的架构级判断。

评分标准：
- 10分: 影响面收敛且已被覆盖，回归点明确
- 8分: 影响面清晰，回归点需人工补充
- 5分: 触及公共区域但未评估影响
- <5分: 改动公共能力且存在未被察觉的调用方

必须逐项检查：
1. 被修改文件的调用方有哪些，是否都仍然成立
2. 公共组件/工具/类型改动的波及范围
3. 接口契约变更对其他页面的影响
4. 变更是否有对应测试

**除打分外，必须填写这三个字段**：
- changeSummary: 一句话概括这次改动干了什么
- blastRadius: 会波及哪些模块，可能引发的回归点与副作用
- verificationPoints: 必须人工验证的操作路径清单`,
  },
}

// ============================================================
// 主流程
// ============================================================

phase('锁定边界')
const context = args
log(`📋 评审需求: ${context.requirement}`)
log(`📁 代码范围: ${context.changeScope || '全部变更'}`)
log(`🔁 评审轮次: 第${context.round || 1}轮`)

const changeScope = context.changeScope || '请用 git diff 自行确定全部变更范围'
const profile = context.projectContext || '（未提供项目画像，请按同目录既有代码的写法推断项目规范）'

// 阶段2: 七维度并行审查
phase('分级审查')

const dimensionKeys = Object.keys(REVIEW_DIMENSIONS)
log(`🔍 启动${dimensionKeys.length}维度并行审查...`)

const dimensionResults = await parallel(
  dimensionKeys.map(key => async () => {
    const dim = REVIEW_DIMENSIONS[key]
    const prompt = `${REVIEW_DISCIPLINE}

---

${dim.prompt.replace('{profile}', profile)}

---

## 待评审需求
${context.requirement}

## 变更范围
${changeScope}

## 本维度满分
${dim.maxScore} 分

输出 JSON：dimension 固定填 "${key}"，maxScore 固定填 ${dim.maxScore}，score 为你给出的得分。`

    const result = await agent(prompt, {
      label: key,
      phase: '分级审查',
      schema: CODE_DIMENSION_SCHEMA,
    })

    // agent 可能不返回或漏填 dimension/maxScore，这里补齐，避免汇总时错位
    if (!result) return null
    return {
      ...result,
      dimension: result.dimension || key,
      maxScore: result.maxScore || dim.maxScore,
      score: typeof result.score === 'number' ? result.score : 0,
    }
  })
)

const returned = dimensionResults.filter(Boolean)
if (returned.length < dimensionKeys.length) {
  log(`⚠️ ${dimensionKeys.length - returned.length}个维度未返回结果，其配分按 0 计入，结论会偏保守`)
}

// 阶段3: 加权汇总
phase('评分结论')

let totalScore = 0
const maxTotalScore = dimensionKeys.reduce((sum, key) => sum + REVIEW_DIMENSIONS[key].maxScore, 0)

const DIMENSION_LABELS = {
  'logic-correctness': '逻辑正确性',
  'robustness': '健壮性与异常流',
  'architecture': '架构与可维护性',
  'type-safety': '类型安全与契约',
  'convention': '规范一致性',
  'security-a11y': '安全与可访问性',
  'blast-radius': '爆炸半径与回归风险',
}

const scoringTable = []
const criticalIssues = []
const minorIssues = []
const tips = []
const pendingConfirmations = []

let changeSummary = ''
const blastRadius = []
const verificationPoints = []

for (const key of dimensionKeys) {
  const result = returned.find(r => r.dimension === key)
  const maxScore = REVIEW_DIMENSIONS[key].maxScore
  const score = result ? Math.min(result.score, maxScore) : 0

  totalScore += score
  scoringTable.push({
    dimension: key,
    label: DIMENSION_LABELS[key],
    score,
    maxScore,
    percentage: Math.round((score / maxScore) * 100),
    returned: Boolean(result),
  })

  log(`📊 ${DIMENSION_LABELS[key]}: ${score}/${maxScore}${result ? '' : '（未返回）'}`)

  if (!result) continue

  for (const issue of result.issues || []) {
    const entry = { ...issue, dimension: DIMENSION_LABELS[key] }
    if (issue.level === 'critical') criticalIssues.push(entry)
    else if (issue.level === 'minor') minorIssues.push(entry)
    else tips.push(entry)
  }

  for (const p of result.pendingConfirmations || []) {
    pendingConfirmations.push(`[${DIMENSION_LABELS[key]}] ${p}`)
  }

  if (result.changeSummary && !changeSummary) changeSummary = result.changeSummary
  blastRadius.push(...(result.blastRadius || []))
  verificationPoints.push(...(result.verificationPoints || []))
}

const finalScore = Math.round((totalScore / maxTotalScore) * 100)

log(`━━━━━━━━━━━━━━━━━━━━`)
log(`📈 代码审查总分: ${finalScore}/100`)
log(`🔴 致命 ${criticalIssues.length} · 🟡 异味 ${minorIssues.length} · 🟢 提示 ${tips.length}`)
log(`━━━━━━━━━━━━━━━━━━━━`)

// 判定：致命问题一票否决，不看分数
const hasCritical = criticalIssues.length > 0
const passed = finalScore >= 80 && !hasCritical

let verdict
if (hasCritical) {
  verdict = finalScore < 60 ? 'rewrite' : 'reject'
} else if (finalScore >= 90) {
  verdict = 'merge'
} else if (finalScore >= 80) {
  verdict = 'conditional'
} else if (finalScore >= 60) {
  verdict = 'reject'
} else {
  verdict = 'rewrite'
}

const verdictLabels = {
  merge: '✅ 可直接合并',
  conditional: '🟡 有条件合并',
  reject: '🔴 拦截，必须重构',
  rewrite: '🔴 打回重写',
}

const verdictReason = hasCritical
  ? `存在 ${criticalIssues.length} 个致命问题，无论总分多少一律不予通过`
  : passed
    ? `无致命问题且总分 ${finalScore} ≥ 80`
    : `总分 ${finalScore} < 80`

log(`🎯 评审结论: ${verdictLabels[verdict]} —— ${verdictReason}`)

// 生成审查报告
const report = `# 代码架构Review报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 评审类型 | 代码架构Review（七维度并行） |
| 评审轮次 | 第${context.round || 1}轮 |
| 变更范围 | ${changeScope} |
| 评审时间 | ${new Date().toISOString()} |
| **总分** | **${finalScore}/100** |
| **结论** | **${verdictLabels[verdict]}** |
| 判定依据 | ${verdictReason} |

## 变更本质
${changeSummary || '无'}

## 分项评分

| 维度 | 得分 | 满分 | 占比 | 状态 |
|------|------|------|------|------|
${scoringTable.map(s =>
`| ${s.label} | ${s.score} | ${s.maxScore} | ${s.percentage}% | ${!s.returned ? '⚠️ 未返回' : s.percentage >= 80 ? '✅' : s.percentage >= 60 ? '🟡' : '🔴'} |`
).join('\n')}

**总计**: ${totalScore}/${maxTotalScore} = ${finalScore}分

## 问题清单

### 🔴 致命问题（必须修复才能合并）
${criticalIssues.length > 0 ? `| # | 维度 | 位置 | 问题 | 后果 | 修法 |
|---|------|------|------|------|------|
${criticalIssues.map((i, idx) => `| ${idx + 1} | ${i.dimension} | \`${i.location}\` | ${i.issue} | ${i.consequence || '未说明'} | ${i.fix || '未给出'} |`).join('\n')}` : '无'}

### 🟡 架构异味（应修复或记录取舍）
${minorIssues.length > 0 ? `| # | 维度 | 位置 | 问题 | 建议 |
|---|------|------|------|------|
${minorIssues.map((i, idx) => `| ${idx + 1} | ${i.dimension} | \`${i.location}\` | ${i.issue} | ${i.fix || '—'} |`).join('\n')}` : '无'}

### 🟢 规范提示（可选优化）
${tips.length > 0 ? tips.map((t, idx) => `${idx + 1}. [${t.dimension}] \`${t.location}\` ${t.issue}`).join('\n') : '无'}

${pendingConfirmations.length > 0 ? `### ⏳ 待确认（评审员无法判定）
${pendingConfirmations.map((p, idx) => `${idx + 1}. ${p}`).join('\n')}
` : ''}

## 爆炸半径与回归点
${blastRadius.length > 0 ? blastRadius.map(b => `- ${b}`).join('\n') : '无'}

## 必须人工验证的操作路径
${verificationPoints.length > 0 ? verificationPoints.map(v => `- ${v}`).join('\n') : '无'}

## 评审结论

${passed ?
`## ✅ 通过 (${finalScore}分 ≥ 80分，且无致命问题)

代码符合架构要求，可以进入测试评估阶段。
${minorIssues.length > 0 ? `
⚠️ 仍有 ${minorIssues.length} 个 🟡 异味未修，请在合并前修复或在变更说明中记录取舍。` : ''}
` :
`## ❌ 打回开发agent重新做

**判定依据**: ${verdictReason}

${hasCritical ? `### 🔴 必须修复的致命问题
${criticalIssues.map((i, idx) => `${idx + 1}. **\`${i.location}\`** ${i.issue}
   - 后果: ${i.consequence || '未说明'}
   - 修法: ${i.fix || '未给出'}`).join('\n')}
` : ''}
${minorIssues.length > 0 ? `### 🟡 建议一并修复
${minorIssues.map((i, idx) => `${idx + 1}. **\`${i.location}\`** ${i.issue}`).join('\n')}
` : ''}

### 剩余重试次数
- 当前轮次: 第${context.round || 1}轮
- 最大轮次: 2轮
${(context.round || 1) >= 2 ? '⚠️ 已达最大轮次限制，请人工介入评估' : `剩余重试次数: ${2 - (context.round || 1)}`}
`}

---

**审查标准**: 七维度加权满分 100（逻辑正确性 25 / 健壮性 20 / 架构 15 / 类型安全 10 / 规范 10 / 安全与可访问性 10 / 爆炸半径 10）。80分红线，且**任一 🔴 致命问题一票否决**。
`

log('📝 审查报告已生成')

return {
  score: finalScore,
  finalScore,
  totalScore,
  maxTotalScore,
  dimensionResults: scoringTable,
  passed,
  hasCritical,
  verdict,
  verdictReason,
  changeSummary,
  criticalIssues,
  minorIssues,
  tips,
  pendingConfirmations,
  blastRadius,
  verificationPoints,
  report,
  round: context.round || 1,
  maxRounds: 2,
  nextAction: passed ? 'proceed_to_test' : 'escalate_to_development',
  message: passed
    ? `代码架构Review通过（${finalScore}分），可以进入测试评估阶段`
    : `代码架构Review未通过（${verdictReason}），需要打回开发agent重新做`,
}
