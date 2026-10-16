# 阶段 ④-FE · UI 开发（dev-ui-implementation）

> 子 agent 调用约定见 `references/运行时排错.md`。**人设不在本卡**：读 `roles/fe-dev.md` 全文，原样放在 prompt 开头（⑤ 也引用同一份，不要复制副本）。

## 入参

| 入参 | 必填 | 来源 | 说明 |
|------|------|------|------|
| `requirement` | ✅ | MEMORY / ① | |
| `designUrl` 或 `noDesignReason` | ✅ 二选一 | 设计稿闸门 | Figma / 蓝湖 / MasterGo / 在线原型 URL / 截图路径；或用户原话「没有设计稿，按现有风格」。两个都缺 → 返回 `needs_design`，**不派 agent** |
| `taskCards` | 推荐 | ②-FE 的任务卡 | 其文件清单即「需求涉及文件」基准 |
| `contract` | 有接口时必填 | `contract-v{N}.md` 全文 | Mock 按 `json contract` 块生成 |
| `mockPlan` | 推荐 | ②-FE 方案的 Mock 方案 | |
| `prototypeInteractions` | 有原型时推荐 | `prototype-interactions-{日期}.md` 全文 | 交互真源 |
| `projectContext` | 推荐 | fe-profile 全文 | |

## 前置判定（都不派 agent）

- `requirement` 空 → `invalid_args`
- `designUrl` 与 `noDesignReason` 都空 → `status=needs_design`，`nextStep=ask_user_for_design`。编排者不该走到这里——按 SKILL.md 设计稿闸门，调用前就该问过用户

## 子 agent ×1（必须有写权限）

label `ui-development`。prompt = `roles/fe-dev.md` 全文 + `---` + 以下各节 + 「请执行 UI 开发，产出生产级代码，并输出结构化报告。」+ `UI_DEV_SCHEMA` 尾注

```
## 待开发需求
{requirement}

## 设计稿 / 原型
{有 designUrl 时：
  {designUrl}
  - 若是 Figma 且当前环境有 Figma MCP / 设计稿读取工具，先读取设计上下文（布局、间距、颜色 token、组件层级）再动手。
  - 若是在线原型 URL：先用浏览器工具打开走查，必要时下载原型源码到 report_dir 的 `_proto/` 下阅读交互逻辑；编排方若已提供原型走查文档，以它为交互真源。
  - 读不到时如实在 issues 里记录，并按需求描述 + 项目既有组件风格实现，不凭想象补视觉细节。
无 designUrl 时：
  无设计稿。用户已确认：「{noDesignReason}」
  按同类既有页面的风格、间距与组件库用法实现，不自行发明视觉规范。}

## 原型走查文档（交互真源，如有）
{prototypeInteractions}

## 任务卡（其文件清单即为「需求涉及文件」的基准，只许改这些）
{taskCards JSON}

## 契约文档（接口唯一真源；TS 类型从字段表推导）
{contract 全文}

## Mock 方案（来自架构方案）
{mockPlan}

## 数据来源
本阶段使用 Mock 完成 UI：**Mock 数据必须按契约的 `json contract` 块生成**（字段名、类型、可空、枚举值一致，含错误码分支的样例）。接口在联调阶段接入真实环境后整体移除 Mock。

## 项目画像
{projectContext}
```

## UI_DEV_SCHEMA

```json
{
  "type": "object",
  "properties": {
    "completedFiles": { "type": "array", "items": { "type": "string" }, "description": "实际改动的全部文件（与 git status 一致）" },
    "newComponents": { "type": "array", "items": { "type": "string" } },
    "modifiedComponents": { "type": "array", "items": { "type": "string" } },
    "mockFiles": { "type": "array", "items": { "type": "string" }, "description": "Mock 相关文件，联调时整体移除" },
    "outOfScopeChanges": { "type": "array", "items": { "type": "object", "properties": { "file": { "type": "string" }, "reason": { "type": "string" } }, "required": ["file", "reason"] } },
    "defensiveMeasures": { "type": "array", "items": { "type": "string" } },
    "commandsRun": { "type": "array", "items": { "type": "object", "properties": { "command": { "type": "string" }, "exitCode": { "type": "number" }, "summary": { "type": "string" } }, "required": ["command"] } },
    "issues": { "type": "array", "items": { "type": "string" } },
    "blockReason": { "type": "string" },
    "quality": { "type": "string", "enum": ["high", "medium", "low"] }
  }
}
```

## 汇总与判定

- agent 未返回结构化结果 → 按空对象处理（报告各段写「无」）
- `blockReason` 非空 → `status=blocked`
- `outOfScopeChanges` 非空 → 闸门汇报时点出，⑥ 复核
- `completedFiles` 与 `mockFiles` 写进 MEMORY fe 仓「需求涉及文件」

## 报告模板（落盘 `<report_dir>/fe/ui-{日期}.md`）

```markdown
# 页面 UI 开发报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 需求 | {requirement} |
| 设计稿 / 原型 | {designUrl 或「无（用户确认：…）」} |
| 契约 | {已按契约生成 Mock / ⚠️ 无契约，Mock 字段为推测} |
| 开发时间 | {timestamp} |
| 质量评估 | {quality} |

## 🚫 逻辑死锁（如有）
{blockReason}

## 完成文件
### 实际改动文件（应与 git status 一致）
{completedFiles 逐条}
### ➕ 新增组件
### 🔄 修改组件
### 🧪 Mock 文件（联调时整体移除）
{mockFiles 逐条}
### ⚠️ 需求清单外被触碰的文件
| 文件 | 理由 |
|------|------|

## 防御措施
## 自验收命令
{commandsRun 逐条：- `cmd` → exit N；summary}
## 问题记录
## 下一步
{blocked：存在逻辑死锁，需解决后再继续
 否则：UI 开发完成。请编排方向用户确认本阶段是否还有调整；fullstack 时等待后端泳道完成并部署后进入联调}
```

## 返回对象（写进 MEMORY）

`completedFiles, newComponents, modifiedComponents, mockFiles, outOfScopeChanges, defensiveMeasures, commandsRun, issues, blockReason, quality, design, report, status(completed/blocked/needs_design/invalid_args), nextStep(deploy_gate_or_integration / resolve_block / ask_user_for_design)`
