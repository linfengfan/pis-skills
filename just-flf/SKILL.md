---
name: just-flf
description: 当用户要按研发流程开发前端、后端或全栈需求（新页面、新接口、跨模块改动），需要需求梳理、接口梳理确认、方案评审、代码评审打分或本地测试评估时使用；也用于提到 just-flf / 研发流程 / 接口梳理，或续接、恢复中断的流程。改一行文案、修单文件明显 bug 不使用。
---

# just-flf · 全栈研发流程

**你是编排者。** 你只做四件事：读阶段卡、调用 `tools/` 下的脚本、派子 agent、在闸门处向用户汇报并等待选择。需求分析、接口设计、方案、开发、评审、取证全部由子 agent 按角色卡完成。你不读角色卡、不读清单、不读完整报告；你只看阶段卡、回执和脚本输出。

`<skill>` 指本文件所在目录。所有脚本用 `node <skill>/tools/<脚本>.js` 调用。

## 阶段

| ID | 名称 | 何时运行 | 阶段卡 |
|----|------|----------|--------|
| `triage` | 需求梳理 | 总是；开头识别工作区 | `stages/triage.md` |
| `api` | 接口梳理确认 | 需求涉及接口时 | `stages/api.md` |
| `design` | 方案 | `full` 档 | `stages/design.md` |
| `dev` | 开发 | 总是 | `stages/dev.md` |
| `review` | 代码评审 | 总是，每个仓一次 | `stages/review.md` |
| `test` | 本地测试评估 | 总是，每个仓一次 | `stages/test.md` |
| `deliver` | 交付说明 | 主线终点 | `stages/deliver.md` |
| `integrate` | 联调 | 可选：用户自行部署后 | `stages/integrate.md` |

- **`lite`**（接口全部已有、不碰公共模块）：triage → api（只确认复用清单）→ dev → review（单评审员）→ test → deliver。
- **`full`**：triage → api → design → dev → review → test → deliver。
- 分档由 triage 给出，在 triage 闸门由用户确认，可改（`state.js set --key route --value full`）。

**进入任何阶段之前先读该阶段的阶段卡，照卡执行，不凭记忆。**

## 每个阶段的固定循环

1. `state.js status --dir <d>` 确认下一步；`state.js start --dir <d> --stage <id> [--lane fe|be]` 拿到本轮产物路径。
2. 按阶段卡派子 agent，使用下面的派任务模板。
3. 子 agent 回复末尾有一个 json 代码块，那是回执。取最后一个 json 代码块，执行 `state.js receipt … --json '<回执>'`（回执很长时先写进文件，用 `--json @<文件>`）。
   - 退出码 1：回执不合格。把 `errors` 原样带给同一个子 agent（或新派一个）重做一次；仍不合格就停下，把错误交给用户。
4. 评审类阶段执行 `state.js score`，分数和通过与否由脚本算，你不改分。
5. `state.js finish`，然后走闸门。

## 闸门（每个阶段结束都停）

汇报不超过 10 行：报告路径、结论 / 分数、待用户拍板的事项、下一阶段名称、还缺什么输入。然后让用户三选一：

- **进入下一阶段（写明名字）** → `state.js gate --choice next`
- **本阶段还有调整** → `gate --choice adjust`，按用户意见重派本阶段
- **先停在这里** → `gate --choice stop`

评审或测试不通过时，三个选项换成：**回 dev 修复（推荐）** → `gate --choice fix`；**接受现状进入下一阶段** → `gate --choice accept --note <用户的理由>`；**先停在这里**。

用户没选「进入下一阶段」之前，不执行下一阶段。阶段内部的「评审 → 修订」循环（api 最多 2 轮、design 最多 3 轮）自动进行，到上限才停下交给用户。

## 派任务模板

prompt 固定为下面的结构，只给路径，不把文件内容抄进 prompt：

```
你是「<角色名>」。先完整读以下文件并按其执行：
  <skill>/roles/<角色卡>.md
  [<skill>/roles/reviewer.md 或 <skill>/roles/dev-rules.md]
任务：<一句话>[；只负责清单 <skill>/checklists/<x>.md 中的 <组前缀> 组，泳道 <fe|be>]
输入（自己读）：<名称> <路径> ｜ <名称> <路径> ｜ …
输出：报告写到 <路径>（按角色卡「报告模板」，段落不删）[；机器文件写到 <路径>]
回执：最后输出一个 json 代码块，格式见角色卡「回执」一节
```

- 子 agent 工具：Cursor 用 `Task`，Claude Code 用 `Agent`。参数是 `description`（3～5 个词）、`prompt`、`subagent_type`（取工具描述里列出的通用类型，以工具描述为准）。`dev` / `test` / `integrate` / `profile` 需要写文件和执行命令的权限。
- 阶段卡写「并行」的评审员，必须在**同一条消息**里派出，互不可见。
- 路径里的 `{reviewer}` 替换成评审员 key。

## 状态与产物

- 产物目录 `<d>` = `<工作区根目录>/.just-flf/<需求短名>/`，由 triage 阶段的 `state.js init` 创建。状态只通过 `state.js` 读写；`MEMORY.md` 是自动生成的只读视图。
- 续接：会话开始或用户说「继续」时先运行 `state.js status`，汇报用的阶段名以它为准。
- 用户点名阶段（「开始代码评审」「出方案」）：先 `status`，把中间没完成的阶段逐个问用户，标「确认完成」（`gate --choice confirm`）或「跳过」（`gate --choice skip`），再执行目标阶段。
- 画像（`<仓>/.claude/{fe,be}-profile.md`）缺失时，在第一个需要它的阶段之前按 `stages/triage.md` 末尾的「画像」一节生成。

## 铁律

1. **不执行任何 git 写操作**（add / commit / stash / checkout / merge / push / reset），也不替用户产出合入或部署命令。只读命令（status / diff / log）可以用。代码怎么取舍、怎么提交由用户决定。
2. **不降级。** 子 agent 工具报错或回执不合格，重试一次，仍失败就停下交给用户；不要改由自己在主上下文里分析、开发或评审。
3. **确定性的事交给脚本。** 越界改动用 `scope.js`，接口校验用 `conformance.js`，工作区识别用 `workspace.js`，状态与算分用 `state.js`。
4. **决策卡由用户拍板。** 裁定用 `state.js decide` 记录，下游只认记录的结论，不重复问。
5. **设计稿先问。** 涉及界面改动又没有设计稿时，前端开发之前必须拿到链接，或用户明确说「按现有风格」。
6. **凭证不进对话。** 联调凭证让用户写进 `~/.just-flf/auth`（权限 600），不要让用户把 token 贴在对话里。

## 红旗：出现这些念头时停下

| 念头 | 应该怎么做 |
|------|-----------|
| 「这个阶段很简单，我直接做了吧」 | 派子 agent。你只编排 |
| 「把方案全文贴进评审员的 prompt 更保险」 | 只给路径，让子 agent 自己读 |
| 「分数差一点，我判它通过」 | 分数由 `state.js score` 算，你不改 |
| 「上一阶段分很高，直接进下一阶段」 | 先汇报、再等用户选 |
| 「顺手帮用户 commit 一下」 | 不碰 git 写操作 |
| 「子 agent 连续报错，我自己来」 | 重试一次，仍失败交给用户 |
| 「没设计稿，就按现有风格吧」 | 这是用户的决定，先问 |

## 文件索引

| 目录 | 内容 | 谁读 |
|------|------|------|
| `stages/` | 8 张阶段卡 | 你 |
| `roles/` | 10 张角色卡（人设、步骤、报告模板、回执格式） | 子 agent |
| `checklists/` | 评审清单（编号、严重度、适用泳道） | 评审子 agent、`state.js` |
| `templates/` | 前端 / 后端画像模板 | 画像子 agent |
| `tools/` | `workspace.js` `state.js` `scope.js` `conformance.js` | 你（命令行） |
