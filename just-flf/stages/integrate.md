# 阶段卡 · integrate 联调（可选）

## 何时运行

用户自行部署后端到联调环境，并说「已部署」和网关地址时。流程从不替用户部署，也不产出部署命令。只做前端泳道的接入；没有前端泳道时只跑第 2 步的契约校验。

## 前置

- 有接口定义 `api-v<N>.json`。
- 凭证：请用户把请求头写进 `~/.just-flf/auth`（每行一个 `Header: value`，执行 `chmod 600 ~/.just-flf/auth`）。**不要让用户把 token 贴进对话。** 不需要鉴权的环境可以不建这个文件。
- 记录：`state.js set --dir <d> --key integrate.gatewayUrl --value '"<网关地址>"'`。

## 步骤

### 1. 开始并拍联调前基线

```bash
node <skill>/tools/state.js start --dir <d> --stage integrate
node <skill>/tools/scope.js baseline --repo <前端仓库根> --out <paths.baseline>
```

### 2. 契约校验（脚本，不是子 agent）

响应体格式取自前端画像（`state.js get --dir <d> --key repos.fe.envelope`，没有就用脚本默认值）：

```bash
node <skill>/tools/conformance.js --api <d>/api-v<N>.json --base-url <网关地址> \
  [--auth-file ~/.just-flf/auth] [--code-field <f> --success-codes <a,b> --data-field <f> --auth-codes <a,b>] \
  --out <paths.conformance>
```

- 默认只发送 GET / HEAD。写接口想要校验，必须先问用户、得到明确同意后再加 `--allow-write <接口 id,…>`（会在联调环境真实写入数据）。
- 退出码 1 表示有 FAIL；2 表示参数或接口定义有问题（把报错交给用户或回到 api 阶段修订）。
- 全部 UNVERIFIED 通常是网关不可达或鉴权缺失，提醒用户检查。

### 3. 前端接入（有前端泳道时）

- 角色卡：`roles/fe-developer.md`（按其中「联调」一节执行）+ `roles/dev-rules.md`
- 输入：校验结果 `paths.conformance`、接口定义、前端开发报告、前端画像、前端仓路径、网关地址。
- 输出：`paths.report`。

```bash
node <skill>/tools/state.js receipt --dir <d> --stage integrate --role fe-developer --json '<回执>'
```

### 4. 联调改动评审（1 个评审员）

```bash
node <skill>/tools/scope.js diff --repo <前端仓库根> --baseline <paths.baseline> --out <paths.scope>
```

派 `roles/reviewer.md`，key `all`，负责 `checklists/code.md` 的全部组并加 `--min-severity major`，泳道 `fe`。输入：`paths.scope`、前端仓路径、校验结果、接口定义、画像。输出：`paths.review`（`{reviewer}` 换成 `all`）及 `.items.json`。

```bash
node <skill>/tools/state.js receipt --dir <d> --stage integrate --role reviewer --reviewer all --lane fe \
  --checklist checklists/code.md --groups DESIGN,ARCH,BLAST,LOGIC,ROBUST,TYPE,CONV,SEC --min-severity major --json '<回执>'
node <skill>/tools/state.js score --dir <d> --stage integrate --expect all
node <skill>/tools/state.js deliver --dir <d>
```

最后一条把联调结果追加进交付说明。

## 闸门

`state.js finish --dir <d> --stage integrate`，汇报：校验结果（PASS / PARTIAL / FAIL / UNVERIFIED 数量）、FAIL 的接口与差异、接入情况、评审分数、交付说明路径。

- 有 FAIL：前端保留这些接口的 Mock，不做兼容补丁。下一步由用户决定：后端修实现后重新部署再跑本阶段，或回到 api 升版本。
- 评审不通过：`gate --choice fix` 后重派前端接入，再评审。
