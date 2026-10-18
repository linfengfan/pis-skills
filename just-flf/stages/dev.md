# 阶段卡 · dev 开发

## 何时运行

每个启用泳道各一次，可以并行（两个仓互不影响）。review 或 test 闸门选择「回 dev 修复」后再次运行。

## 前置

- 该泳道有画像。
- **前端泳道的设计稿闸门**：triage 判定涉及界面改动（`state.json` 的 `triage.uiChange`）时，`design.url` 与 `design.noDesignReason` 至少一个有值。都没有就先问用户：要设计稿 / 原型链接，或用户明确说「没有设计稿，按现有风格」。记录：
  - `state.js set --dir <d> --key design.url --value '"<链接>"'`
  - 或 `state.js set --dir <d> --key design.noDesignReason --value '"<用户原话>"'`

## 每条泳道的步骤

### 1. 开始并拍基线

```bash
node <skill>/tools/state.js start --dir <d> --stage dev --lane <l>
```

**仅在该泳道第一次开发时**（`round` 为 1 且 `paths.baseline` 不存在）拍基线：

```bash
node <skill>/tools/scope.js baseline --repo <该泳道仓库根> --out <paths.baseline>
```

之后的修复轮次沿用同一份基线，这样越界检测覆盖整个需求的全部改动。

### 2. 派本泳道开发（1 个）

- 角色卡：`roles/fe-developer.md` 或 `roles/be-developer.md`，加 `roles/dev-rules.md`
- 输入：需求梳理报告；接口定义 `api-v<N>.md` 与 `.json`（有则给）；方案与需求涉及文件清单（`full` 档的 design 产物；`lite` 档没有）；本泳道画像；仓库路径；前端再给设计稿链接或「无设计稿」原话。修复轮次再给：上一轮代码评审汇总或测试评估汇总的路径（只修其中的不通过项）。
- 输出：`paths.report`。

```bash
node <skill>/tools/state.js receipt --dir <d> --stage dev --lane <l> --role <fe-developer|be-developer> --json '<回执>'
```

### 3. 判读

- `status=blocked`：实现阻断（方案或接口有死锁），把阻断点交给用户。
- 回执 `hints` 提示自验收命令未通过：把失败命令带回同一个开发子 agent 修复后重新回执；仍失败就停下交给用户。
- 后端回执 `contractTests.written < contractTests.expected` 或 `passed < written`：同上处理，契约测试缺失或失败不能进入 review。
- `outOfScopeClaimed` 非空：闸门汇报时点出，review 阶段会复核。

## 闸门

`state.js finish --dir <d> --stage dev`（或带 `--lane` 分别结束），汇报：开发报告路径、改动文件数、自验收命令结果、契约测试情况（后端）、清单外文件。用户确认后 `gate --stage dev --choice next`。
