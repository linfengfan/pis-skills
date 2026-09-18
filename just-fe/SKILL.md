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
- 七维度并行打分：逻辑正确性 25 / 健壮性 20 / 架构 15 / 类型安全 10 / 规范 10 / 安全与可访问性 10 / 爆炸半径 10
- **<80分 → 打回开发agent重新做**
- **任一 🔴 致命问题 → 一票否决，不看总分**（97 分带一个密钥硬编码也不予通过）

## Workflow 脚本清单

| 流程 | 脚本 | 作用 |
|------|------|------|
| 需求分诊 | `scripts/triage-workflow.js` | 需求分析 + 歧义拆解 |
| 架构生成 | `scripts/architecture-workflow.js` | 技术方案 + 任务卡 |
| 方案评审 | `scripts/architecture-review-workflow.js` | 六维度打分，80分红线 |
| 页面UI开发 | `scripts/ui-implementation-workflow.js` | 基于Figma开发UI |
| 接口联调 | `scripts/api-integration-workflow.js` | 产出清单 + 联调开发 |
| 代码架构Review | `scripts/code-arch-review-workflow.js` | 七维度并行打分，80分红线 + 致命一票否决 |
| 测试评估 | `scripts/test-assessment-workflow.js` | 五维度打分，80分红线 |

每个脚本都是**自包含单文件**：Workflow 运行时在隔离环境执行，不提供文件系统访问，因此脚本内不能出现 `import`，prompt 与 schema 一律内联。新增或修改脚本时必须守住这条，否则装到 `~/.claude/workflows/` 后会在模块解析阶段直接失败。

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
- 代码架构Review 出现任一 🔴 致命问题 → **一票否决，与总分无关**
- 测试评估 < 80分 → 打回架构和开发（最多2轮）

打分口径统一见 `templates/评分协议.md`。反向铁律同样成立：**找不到真实问题时必须如实给高分**，禁止为了显得严格而编造扣分项。

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
| ⑦测试评估 | ⑥代码Review必须 ≥80分**且无 🔴 致命问题** |
| ⑧完成 | ⑦测试评估必须 ≥80分 |

---

## Workflow 编排入口

**没有总编排脚本。** 编排由本 Skill（即你，读到这里的模型）承担：按阶段顺序依次调用下表的 7 个 Workflow，每次调用前从磁盘读取上游产物作为入参，调用后把产物落盘。Workflow 之间不能互相调用，所以串联、打回重试、轮次计数都由你在阶段之间完成。

### 阶段编排表

| 阶段 | Workflow 名称 | 关键入参 | 返回值判读 |
|------|---------------|----------|-----------|
| ①需求梳理 | `fe-triage` | `requirement`, `projectContext` | `status==='blocked'` 则停止并向用户提问 |
| ②方案架构 | `fe-architecture` | `requirement`, `requirementAnalysis`, `projectContext` | `status==='needs_clarification'` 则回①补齐 |
| ③方案评审 | `fe-architecture-review` | `architecture`, `profile`, `round` | `passed===false` 则带 `issues` 回②重写，`round+1` |
| ④UI开发 | `fe-ui-implementation` | `requirement`, `figmaUrl`, `taskCards` | `blockReason` 非空则停止 |
| ⑤接口联调 | `fe-api-integration` | `requirement`, `architecture`, `uiCompleted` | `status==='awaiting_apis'` 则等接口就绪 |
| ⑥代码Review | `fe-code-arch-review` | `requirement`, `changeScope`, `projectContext`, `round` | `passed===false` 则带 `criticalIssues` 回④⑤，`round+1` |
| ⑦测试评估 | `fe-test-assessment` | `requirement`, `acceptanceCriteria`, `changeScope`, `round` | `passed===false` 则回②④⑤，`round+1` |

单阶段调用形态：

```javascript
const result = await workflow('fe-architecture-review', {
  architecture: '<architecture-{日期}.md 全文>',
  profile: '<.claude/fe-profile.md 全文>',
  round: 1,
})
// result.passed / result.finalScore / result.issues / result.report
```

### 完整流程的编排步骤

1. 读 `.claude/fe-profile.md`；不存在则先按 `references/项目画像初始化.md` 生成，产出格式见 `templates/项目画像模板.md`
2. 在 `fe-reports/{需求}/` 下用 `MEMORY.md` 建流程状态（模板即本目录的 `MEMORY.md`）
3. 依次执行①~⑦，**每个阶段结束立刻把 `result.report` 落盘并更新 `MEMORY.md`**
4. 遇到 `passed===false`：把 `issues` / `criticalIssues` 原文带回打回目标阶段，轮次 +1；达轮次上限则停下来交人工
5. ⑦通过后按 `templates/变更日志模板.md` 写 `change-{日期}.md`，再 commit

### 续接与断点恢复

同样没有 resume 脚本，按以下步骤手工续接：

1. 读 `fe-reports/{需求}/MEMORY.md` 定位中断阶段与已完成轮次
2. 按「产物查找规则」表逐个确认前置产物是否存在且完整
3. 把已有产物读成字符串，作为目标阶段 Workflow 的入参
4. 从目标阶段继续执行，不重跑已通过的阶段，不重问已澄清的维度

```
/just-fe --from=⑥                    # 读①~⑤产物 → 直接调 fe-code-arch-review
/just-fe --from=⑤ --需求="商品详情页"   # 读①~④产物 → 直接调 fe-api-integration
/just-fe --resume                    # 读 MEMORY.md 定位断点后按上述步骤续接
```

---

## 配套资源

阶段执行时按需读取，不要凭记忆编造格式：

| 资源 | 何时读 |
|------|--------|
| `templates/项目画像模板.md` | 生成 `.claude/fe-profile.md` 时 |
| `templates/需求梳理报告模板.md` | ①落盘 `triage-{日期}.md` 时 |
| `templates/架构方案模板.md` | ②落盘 `architecture-{日期}.md` 时 |
| `templates/评分协议.md` | ③⑥⑦打分前，统一扣分口径 |
| `templates/变更日志模板.md` | ⑧落盘 `change-{日期}.md` 时 |
| `references/项目画像初始化.md` | 项目画像缺失，需要探测技术栈与门禁命令时 |
| `references/需求分诊.md` | ①需要六维度澄清清单与六关筛选口径时 |
| `references/前端功能团队.md` | 中大型改动想用四角色并行分析加强②时（可选增强） |
