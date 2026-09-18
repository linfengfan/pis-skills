---
name: just-fe
description: 当用户要开发前端功能、进行需求分析、方案评审，或提到"前端工作流/just-fe/研发流程"时使用。完整流程：需求分析→方案架构→方案评审→UI开发→接口联调→代码Review→测试评估。核心特性：80分红线、低于80分打回重做、产物落盘机制。支持完整流程或从任意阶段续接。项目无关。
---

# 前端研发工作流

需求梳理 → 方案架构 → 方案评审 → 页面UI开发 → 接口联调 → 代码架构Review → 测试评估 → 完成

## 两种使用模式

### 模式一：完整流程（推荐）
用户输入完整需求文档，自动走完整流程：
```
输入需求文档 → ①需求梳理 → ②方案架构 → ③方案评审 → ④UI开发 → ⑤接口联调 → ⑥代码Review → ⑦测试评估 → 完成
```

### 模式二：续接流程
用户选择从某个阶段开始，自动继承之前阶段的产物：
```
/just-fe --from=⑥  从代码Review开始，继承①②③④⑤的产物
/just-fe --from=⑤  从接口联调开始，继承①②③④的产物
/just-fe --resume   恢复上次中断的流程
```

## 核心流程

```
[入口] 需求输入/续接指令
   │
   ▼
① 需求梳理（triage）
   │
   ▼
② 方案架构（architecture）
   │
   ▼
③ 方案评审打分 ──────────────┐
   │ <80分 → 打回重写        │ 最多3轮
   │ ≥80分                   │
   ▼                         │
④ 页面UI开发                  │
   │ 产出: UI页面（Mock数据）   │
   ▼                         │
⑤ 接口联调 ──────────────────┐│
   │ 产出: 接口清单            ││
   │ 先产出清单，有清单后联调    ││
   ▼                         ││
⑥ 代码架构Review打分 ─────────┐││
   │ <80分 → 打回开发agent     │││ 最多2轮
   │ ≥80分                    │││
   ▼                          │││
⑦ 测试评估打分 ───────────────┐│││
   │ <80分 → 打回架构+开发     ││││ 最多2轮
   │ ≥80分                    ││││
   ▼                          ││││
⑧ 完成                        ││││
   │                          ▼▼▼▼
   └──> 变更说明 → commit ◄─────┘
```

## 续接协议

### 产物查找规则
当用户指定 `--from=阶段` 时，按以下顺序查找产物：

| 阶段 | 产物路径 |
|------|----------|
| ②方案架构 | `fe-reports/{需求}/architecture-{日期}.md` |
| ③方案评审 | `fe-reports/{需求}/arch-review-{日期}.md` |
| ④UI开发 | `fe-reports/{需求}/ui-{日期}.md` |
| ⑤接口联调 | `fe-reports/{需求}/api-list-{日期}.md` |
| ⑥代码Review | `fe-reports/{需求}/code-arch-review-{日期}.md` |
| ⑦测试评估 | `fe-reports/{需求}/test-assessment-{日期}.md` |

### 续接判断
- 产物存在且完整 → 直接进入该阶段
- 产物存在但不完整 → 从该阶段重新开始
- 产物不存在 → 回溯到前置阶段

### 续接示例
```
# 从方案评审开始
/just-fe --from=③ --需求="商品详情页"
→ 查找①②产物 → 确认完整 → 进入③方案评审

# 从接口联调开始
/just-fe --from=⑤ --需求="商品详情页"
→ 查找①②③④产物 → 确认UI开发产物完整 → 进入⑤接口联调

# 恢复中断
/just-fe --resume
→ 读取 fe-reports/{需求}/MEMORY.md → 定位中断点 → 继续
```

## 关键设计

### UI开发
- 输入: Figma设计稿链接（可后续补充）
- 产出: UI页面（使用Mock数据）

### 接口联调
- 先产出**前端依赖接口清单**
- 有清单后进行联调开发

### 代码架构Review
- 对开发完成代码进行架构Review
- 七维度打分
- **<80分 → 打回开发agent重新做**

## Workflow 脚本清单

| 流程 | 脚本 | 作用 |
|------|------|------|
| 需求分诊 | `scripts/triage-workflow.js` | 需求分析 + 歧义拆解 |
| 架构生成 | `scripts/architecture-workflow.js` | 技术方案 + 任务卡 |
| 方案评审 | `scripts/architecture-review-workflow.js` | 六维度打分，80分红线 |
| 页面UI开发 | `scripts/ui-implementation-workflow.js` | 基于Figma开发UI |
| 接口联调 | `scripts/api-integration-workflow.js` | 产出清单 + 联调开发 |
| 代码架构Review | `scripts/code-arch-review-workflow.js` | 七维度打分，80分红线 |
| 测试评估 | `scripts/test-assessment-workflow.js` | 五维度打分，80分红线 |

## 产物落盘

每个阶段完成后必须落盘到 `fe-reports/{需求}/`：

```
fe-reports/{需求}/
├── MEMORY.md                    # 流程状态记忆
├── triage-{日期}.md             # 需求梳理结果
├── architecture-{日期}.md        # 架构方案
├── arch-review-{日期}.md        # 方案评审报告
├── ui-{日期}.md                 # UI开发报告
├── api-list-{日期}.md          # 接口清单
├── integration-{日期}.md         # 联调报告
├── code-arch-review-{日期}.md   # 代码Review报告
├── test-assessment-{日期}.md    # 测试评估报告
└── change-{日期}.md            # 最终变更说明
```

## 评分铁律

**铁律**:
- 方案评审 < 80分 → 打回重写（最多3轮）
- 代码架构Review < 80分 → 打回开发agent（最多2轮）
- 测试评估 < 80分 → 打回架构和开发（最多2轮）

## 编排纪律

1. **入口不干活** —— 只路由和协调，实现/评审在各 Workflow 执行
2. **产物落盘先行** —— 每个阶段输出必须落盘
3. **不重复澄清** —— 已澄清维度引用记录，不重问
4. **评分铁律** —— <80分必须打回，不允许妥协
5. **清单先行** —— 接口联调必须先产出清单，有了清单再开发
6. **续接优先** —— 指定 `--from` 时，优先加载已有产物

## 阶段准入条件

| 下一阶段 | 前置要求 |
|----------|----------|
| ②方案架构 | ①需求梳理必须通过（无 blockReason） |
| ③方案评审 | ②方案架构产物必须存在 |
| ④UI开发 | ③方案评审必须 ≥80分 |
| ⑤接口联调 | ④UI开发必须完成 |
| ⑥代码Review | ⑤接口联调必须完成 |
| ⑦测试评估 | ⑥代码Review必须 ≥80分 |
| ⑧完成 | ⑦测试评估必须 ≥80分 |

---

## Workflow 编排入口

### 完整流程编排

```javascript
// 完整流程：从需求到完成
const result = await workflow('just-fe-main', {
  requirement: '需求描述',
  projectPath: '/path/to/project',  // 可选
  figmaUrl: 'https://figma.com/...', // 可选
})
```

### 阶段编排

| 阶段 | Workflow 名称 | 输入 | 输出 |
|------|---------------|------|------|
| ①需求梳理 | `fe-triage` | requirement, projectPath | triage report |
| ②方案架构 | `fe-architecture` | requirement, triageResult | architecture report |
| ③方案评审 | `fe-architecture-review` | architecture, round | review report |
| ④UI开发 | `fe-ui-implementation` | requirement, figmaUrl, taskCards | UI report |
| ⑤接口联调 | `fe-api-integration` | requirement, uiCompleted | api list + integration report |
| ⑥代码Review | `fe-code-arch-review` | requirement, changeScope | review report |
| ⑦测试评估 | `fe-test-assessment` | requirement, changeScope | assessment report |

### 续接编排

```javascript
// 从指定阶段续接
const result = await workflow('just-fe-resume', {
  from: ⑤,  // 从接口联调开始
  requirement: '商品详情页',
  projectPath: '/path/to/project',
})
```

### 断点恢复

```javascript
// 恢复中断的流程
const result = await workflow('just-fe-resume', {
  resume: true,
  projectPath: '/path/to/project',
})
```
