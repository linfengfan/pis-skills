/**
 * 共享 Schema 定义
 * 所有 Workflow 共用的 JSON Schema
 */

// ============================================================
// 需求梳理 Schema
// ============================================================

export const REQUIREMENT_SCHEMA = {
  type: 'object',
  properties: {
    oneSentenceGoal: { type: 'string', description: '一句话目标' },
    scope: {
      type: 'object',
      properties: {
        include: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
      },
    },
    userStories: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    exceptionFlows: { type: 'array', items: { type: 'string' } },
    apiRequirements: { type: 'array', items: { type: 'string' } },
    nonFunctionalConstraints: { type: 'array', items: { type: 'string' } },
    impactScope: { type: 'array', items: { type: 'string' } },
    pendingQuestions: { type: 'array', items: { type: 'string' } },
    splittingSuggestions: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    blockReason: { type: 'string', description: '如果有逻辑死锁，说明原因' },
  },
  required: ['oneSentenceGoal', 'scope'],
}

// ============================================================
// 架构设计 Schema
// ============================================================

export const ARCHITECTURE_SCHEMA = {
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

// ============================================================
// UI开发 Schema
// ============================================================

export const UI_DEV_SCHEMA = {
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

// ============================================================
// 接口联调 Schema
// ============================================================

export const INTEGRATION_SCHEMA = {
  type: 'object',
  properties: {
    apiList: { type: 'array' },
    completed: { type: 'array', items: { type: 'string' } },
    pending: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
    integrationStatus: { type: 'string', enum: ['complete', 'partial', 'blocked'] },
  },
}

// ============================================================
// 代码审核 Schema
// ============================================================

export const CODE_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    changeSummary: { type: 'string', description: '变更本质一句话' },
    blastRadius: { type: 'array', description: '爆炸半径' },
    verificationPoints: { type: 'array', description: '验证点' },
    criticalIssues: { type: 'array', description: '🔴 致命问题' },
    minorIssues: { type: 'array', description: '🟡 异味' },
    tips: { type: 'array', description: '🟢 提示' },
    pendingConfirmations: { type: 'array', description: '待确认项' },
    score: { type: 'number', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: ['merge', 'conditional', 'reject', 'rewrite'] },
    verdictReason: { type: 'string', description: '结论原因' },
  },
  required: ['score', 'verdict', 'changeSummary'],
}

// ============================================================
// 测试评估 Schema
// ============================================================

export const TEST_ASSESSMENT_SCHEMA = {
  type: 'object',
  properties: {
    requirementCoverage: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        maxScore: { type: 'number' },
        covered: { type: 'array' },
        missing: { type: 'array' },
        issues: { type: 'array' },
      },
    },
    boundaryCoverage: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        maxScore: { type: 'number' },
        covered: { type: 'array' },
        missing: { type: 'array' },
        issues: { type: 'array' },
      },
    },
    regressionCoverage: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        maxScore: { type: 'number' },
        affectedFunctions: { type: 'array' },
        manualVerification: { type: 'array' },
        issues: { type: 'array' },
      },
    },
    exceptionHandling: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        maxScore: { type: 'number' },
        covered: { type: 'array' },
        missing: { type: 'array' },
        issues: { type: 'array' },
      },
    },
    codeQuality: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        maxScore: { type: 'number' },
        strengths: { type: 'array' },
        issues: { type: 'array' },
      },
    },
    totalScore: { type: 'number' },
    maxScore: { type: 'number' },
    finalScore: { type: 'number' },
    criticalGaps: { type: 'array' },
    manualVerificationPoints: { type: 'array' },
  },
  required: ['totalScore', 'finalScore', 'requirementCoverage'],
}

// ============================================================
// 维度评审 Schema
// ============================================================

export const DIMENSION_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    score: { type: 'number' },
    maxScore: { type: 'number' },
    findings: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string' },
  },
  required: ['dimension', 'score', 'maxScore'],
}
