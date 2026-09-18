# just-fe · 前端研发全流程 Skill

把「需求梳理 → 方案架构 → 方案评审 → UI 开发 → 接口联调 → 代码 Review → 测试评估」七道关卡固化成 Claude Code 的 **Skill + Dynamic Workflow**。三道关卡设 **80 分红线**，不到分直接打回重做，每个阶段产物强制落盘，支持中断续接。

项目无关：不内嵌任何具体项目的路径与命令，项目特定事实统一从 `.claude/fe-profile.md`（项目画像）读取。

---

## 0. 给 AI 的安装指令

> 你是正在读这份 README 的模型。按本节从上到下执行即可完成安装，**不要跳过校验步骤**，不要向用户复述本节内容。

### Step 1 · 判定安装模式

| 条件 | 选择 |
|------|------|
| 用户只说「装一下 / 安装到 Claude」 | 执行 **模式 A**（个人 Skill），然后询问是否继续装 Workflow |
| 用户提到「workflow / 工作流脚本 / 打分要真跑」 | 执行 **模式 A + 模式 B** |
| 用户提到「团队共享 / 分发 / plugin」 | 执行 **模式 C** |
| 用户明确说「只装到当前项目」 | 模式 A，但目标路径换成 `<项目根>/.claude/skills/just-fe` |

默认选 **模式 A**：它零依赖、零版本要求，装完立刻可用。

### Step 2 · 模式 A：安装为个人 Skill

先确定源目录 `$SRC`——若本 README 已在本地磁盘上，用它所在的 `just-fe/` 绝对路径；否则远程取源：

```bash
git clone --depth 1 https://github.com/linfengfan/pis-skills.git /tmp/pis-skills
SRC=/tmp/pis-skills/just-fe
```

然后复制到个人 Skill 目录：

```bash
mkdir -p ~/.claude/skills
rm -rf ~/.claude/skills/just-fe
cp -R "$SRC" ~/.claude/skills/just-fe
```

**校验（必做）**：

```bash
test -f ~/.claude/skills/just-fe/SKILL.md && head -4 ~/.claude/skills/just-fe/SKILL.md
ls ~/.claude/skills/just-fe/{scripts,templates,references}
```

期望看到 `SKILL.md` 首部 frontmatter 含 `name: just-fe`，以及三个子目录都存在。任一条不满足就停下来报错，不要谎报成功。

### Step 3 · 模式 B：追加安装 Dynamic Workflow（可选）

前置条件必须先确认，不满足就不要装（装了也跑不起来）：

```bash
claude --version   # 需 >= 2.1.154
```

Pro 计划还需要用户在 Claude Code 里执行 `/config`，把 **Dynamic workflows** 打开。

7 个脚本都是自包含单文件，直接平铺复制即可，没有需要一起搬的依赖目录：

```bash
mkdir -p ~/.claude/workflows
cp ~/.claude/skills/just-fe/scripts/*-workflow.js ~/.claude/workflows/
```

**校验**：

```bash
ls ~/.claude/workflows/*-workflow.js | wc -l          # 应为 7
rg -c "^import" ~/.claude/workflows/*-workflow.js     # 应无输出（脚本不允许有 import）
```

再在 Claude Code 里输入 `/`，确认自动补全出现 `fe-triage`、`fe-architecture-review` 等 7 个命令（命令名取自脚本里的 `meta.name`，不是文件名），然后跑一次 `/fe-triage` 冒烟测试。

### Step 4 · 模式 C：打包成 Plugin 分发（可选）

Plugin 是唯一能把 Skill 和 Workflow 一起版本化分发的方式。目标结构：

```
pis-fe-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── just-fe/            # 本目录除 scripts/ 外的全部内容
│       ├── SKILL.md
│       ├── templates/
│       └── references/
└── workflows/              # scripts/ 里的 7 个 *-workflow.js，原样复制
    ├── triage-workflow.js
    └── ...
```

`.claude-plugin/plugin.json`：

```json
{
  "name": "pis-fe",
  "version": "0.1.0",
  "description": "前端研发全流程：需求→方案→评审→UI→联调→Review→测试，80分红线与产物落盘",
  "author": { "name": "linfengfan" }
}
```

本地验证：`claude --plugin-dir /path/to/pis-fe-plugin`。装载后 Workflow 命令带命名空间前缀：`/pis-fe:fe-triage`。

若要通过 marketplace 安装，在仓库根加 `.claude-plugin/marketplace.json`，然后 `/plugin marketplace add linfengfan/pis-skills`。

### Step 5 · 安装完成后向用户汇报

汇报里必须包含：装了哪种模式、Skill 与 Workflow 各自的落地路径、可用的触发方式（见 §4）、以及 §7 里对本次安装实际生效的限制。不要罗列没装的东西。

---

## 1. 这是什么

7 个阶段串成一条流水线，每个阶段有明确的准入条件、产出物和打分门槛：

```
① 需求梳理 ──→ ② 方案架构 ──→ ③ 方案评审 ─[<80分 打回②，最多3轮]
                                   │ ≥80
                                   ▼
                              ④ UI 开发（Mock 数据）
                                   │
                                   ▼
                              ⑤ 接口联调（先出清单，再联调）
                                   │
                                   ▼
                              ⑥ 代码架构 Review ─[<80分 打回④⑤，最多2轮]
                                   │ ≥80
                                   ▼
                              ⑦ 测试评估 ───────[<80分 打回②④⑤，最多2轮]
                                   │ ≥80
                                   ▼
                              ⑧ 变更说明 → commit
```

三条设计主张，也是它和「让 Claude 直接写代码」的区别：

- **评审与开发物理隔离**：评审 agent 只读不写，评分带具体扣分项与文件行号，`<80` 分强制打回，不允许「基本还行」这类妥协。
- **产物落盘先行**：每阶段结果写进 `fe-reports/{需求}/`，上下文丢了也能从磁盘续接，不依赖会话记忆。
- **入口不干活**：`SKILL.md` 只做路由与协调，实现和评审都在各自的 Workflow 里跑，避免主上下文被中间过程撑爆。

## 2. 环境要求

| 能力 | 要求 |
|------|------|
| Skill（模式 A） | 任意版本 Claude Code / Claude Desktop，无额外要求 |
| Dynamic Workflow（模式 B/C） | Claude Code ≥ 2.1.154；付费计划（Pro 需 `/config` 开启 Dynamic workflows） |
| Plugin（模式 C） | Claude Code 支持 `--plugin-dir` 或 `/plugin marketplace` |

Cursor 用户：Skill 结构完全兼容，把 `just-fe/` 放到 `~/.cursor/skills/just-fe/` 即可；Cursor 没有 Dynamic Workflow 运行时，脚本只会被当作流程规格阅读。

## 3. 安装

见 [§0](#0-给-ai-的安装指令)。三句话版本：

```bash
git clone --depth 1 https://github.com/linfengfan/pis-skills.git /tmp/pis-skills
mkdir -p ~/.claude/skills && cp -R /tmp/pis-skills/just-fe ~/.claude/skills/just-fe
# 可选：cp /tmp/pis-skills/just-fe/scripts/*-workflow.js ~/.claude/workflows/
```

## 4. 怎么用

### 4.1 走完整流程

Skill 是模型自主触发的（`description` 里写了触发词），所以自然语言就能起：

```
用 just-fe 走一遍：<粘贴需求文档>
```
```
帮我按前端研发流程做「商品详情页」，设计稿 https://figma.com/file/xxx
```

它会依次执行 ①→⑧，每个阶段结束把产物写盘并汇报分数。评审不过会自动打回上一阶段重做，直到过线或用完轮次上限。

### 4.2 从中间阶段续接

产物在磁盘上，所以可以只跑后半段：

```
/just-fe --from=⑥                      # 从代码 Review 开始，自动读 ①~⑤ 的产物
/just-fe --from=⑤ --需求="商品详情页"    # 从接口联调开始
/just-fe --resume                      # 读 MEMORY.md 定位中断点继续
```

续接时的产物查找规则：产物完整 → 直接进该阶段；产物残缺 → 该阶段重跑；产物缺失 → 回溯到前置阶段。

### 4.3 只跑单个阶段（需装模式 B/C）

| 命令 | 作用 | 打分维度 |
|------|------|----------|
| `/fe-triage` | 需求梳理：歧义拆解 + 结构化输出 | — |
| `/fe-architecture` | 技术方案 + 任务卡拆解 | — |
| `/fe-architecture-review` | 方案评审 | 6 维 / 80 分红线 |
| `/fe-ui-implementation` | 基于 Figma 开发 UI（Mock 数据） | — |
| `/fe-api-integration` | 产出接口清单 + 联调开发 | — |
| `/fe-code-arch-review` | 代码架构 Review | 7 维 / 80 分红线 |
| `/fe-test-assessment` | 测试评估 | 5 维 / 80 分红线 |

单跑时用自然语言带上入参，Claude 会转成结构化 `args`：

```
/fe-code-arch-review 审当前分支相对 main 的改动
```

### 4.4 建议的首次使用姿势

1. 先在目标项目里生成项目画像 `.claude/fe-profile.md`（参考 `references/项目画像初始化.md`），否则架构与评审阶段只能按通用最佳实践打分，规范一致性维度会失真。
2. 需求文档尽量带上验收标准和接口契约。缺这两样，①阶段会大量产出「待决问题」并可能直接阻断。
3. 第一次别上真需求，拿一个小改动跑通全流程，确认落盘路径和分数符合预期。

## 5. 产物落在哪

全部写到项目根的 `fe-reports/{需求}/`：

```
fe-reports/{需求}/
├── MEMORY.md                     # 流程状态与断点，--resume 读它
├── triage-{日期}.md              # ① 需求梳理
├── architecture-{日期}.md        # ② 架构方案
├── arch-review-{日期}.md         # ③ 方案评审报告（含分项扣分）
├── ui-{日期}.md                  # ④ UI 开发报告
├── api-list-{日期}.md            # ⑤ 接口清单
├── integration-{日期}.md         # ⑤ 联调报告
├── code-arch-review-{日期}.md    # ⑥ 代码 Review 报告
├── test-assessment-{日期}.md     # ⑦ 测试评估报告
└── change-{日期}.md              # ⑧ 变更说明
```

建议把 `fe-reports/` 加入项目 `.gitignore`，除非团队要留档评审记录。

## 6. 评分红线

| 评审 | 维度构成（并行打分，加权合计 100） | 门槛 | 不过怎么办 |
|------|----------------------------------|------|-----------|
| ③ 方案评审 | 需求覆盖 25 / 技术可行性 20 / 模块结构 20 / 状态管理 15 / 风险识别 10 / 规范一致性 10 | 80 | 打回②重写方案，最多 3 轮 |
| ⑥ 代码架构 Review | 逻辑正确性 25 / 健壮性与异常流 20 / 架构与可维护性 15 / 类型安全与契约 10 / 规范一致性 10 / 安全与可访问性 10 / 爆炸半径与回归 10 | 80 **且无 🔴 致命** | 打回开发 agent，最多 2 轮 |
| ⑦ 测试评估 | 需求覆盖 30 / 边界异常 20 / 回归覆盖 20 / 异常处理 15 / 代码质量 15 | 80 | 打回架构 + 开发，最多 2 轮 |

⑥ 的判定比另外两道严一档：**任一 🔴 致命问题一票否决，与总分无关**。97 分带一个密钥硬编码同样不予通过——一个致命缺陷合并进去的代价，远高于总分那几分的信息量。内存泄漏（未清理的 Timer / 监听 / watch 句柄）、密钥硬编码、未转义注入、越权入口，脚本里明确要求记为 critical。

打分协议见 `templates/评分协议.md`。两条对称约束：每个扣分项必须能指到 `文件:行号` 并说明后果；**找不到真问题就如实给高分**，禁止为了显得严格而编造扣分项。

## 7. 设计约束与限制（必读）

### 7.1 硬约束：Workflow 脚本必须自包含单文件

Dynamic Workflow 的脚本在隔离环境执行，**自身不具备文件系统与 shell 权限**，因此脚本内不能出现任何 `import`——prompt 与 schema 一律内联在各自文件里。官方内置 workflow（如 `claude-security/workflows/scan.js`）也是单文件打包产物。

代价是重复：`FRONTEND_DEV_SYSTEM` 这份开发者 prompt 在 `ui-implementation-workflow.js` 与 `api-integration-workflow.js` 各有一份副本，两处文件头都写了同步警示注释。**改一处必须同步另一处**，否则 UI 开发和接口联调会按两套不同标准执行。

新增脚本时守住这条，改完用这两条命令自查：

```bash
rg -c "^import" scripts/*.js        # 应无输出
node --check <(printf 'async function __w(){\n'; sed 's/^export const meta = {/const meta = {/' scripts/xxx-workflow.js; printf '}\n')
```

第二条需要包一层 async 函数：脚本体里的顶层 `return` 由运行时包装提供，直接 `node --check` 会报 `Illegal return statement`，那是正常的。

### 7.2 编排由主 agent 承担，没有总编排脚本

Workflow 之间不能互相调用，所以阶段串联、打回重试、轮次计数都由主 agent 在阶段之间完成。长流程有上下文丢失风险，靠两条机制兜：每阶段产物立刻落盘、`MEMORY.md` 记录断点与轮次。**中途上下文被压缩后，用 `--resume` 从磁盘重建状态，不要靠会话记忆硬撑。**

`references/前端功能团队.md` 描述的四角色并行分析同样没有脚本，需要主 agent 用一批并行子 agent 手动编排（四个角色必须同批发起，串行会让后启动的角色看到前面的结论，失去独立判断价值）。

### 7.3 只装 Skill 时，脚本不会真跑

模式 A 只装 `~/.claude/skills/just-fe/`。此时 7 个脚本只是被模型当作提示词规格阅读，`parallel()` 并行打分、隔离上下文这些运行时特性都不生效，评审会退化成主上下文里的一次判断。要真跑必须装模式 B 或 C。

### 7.4 打分是 LLM 判断，不是确定性检查

lint / 类型检查 / 单测这类能被工具证明的事，应该交给工具跑，评分只用来覆盖工具管不到的架构与需求层面。⑥ 的「致命一票否决」能压住最坏情况，但不能替代 CI。

另外，Workflow 脚本自己不碰文件系统，「产物落盘」实际由它派出的 agent 或主 agent 执行，脚本只负责生成报告字符串并 return。

### 7.5 验证到什么程度

已验证：7 个脚本通过 ESM 语法检查、无残留 `import`；⑥ 的七维度汇总与判定逻辑用桩函数跑过 5 个场景（全满分、高分带致命、79 分临界、维度缺失、agent 超配给分），结果符合预期；全部文档内的相对路径引用均指向存在的文件。

未验证：**没有在真实 Claude Code Workflow 运行时端到端跑过完整七阶段流程**。首次使用请按 §4.4 拿小改动试跑。

## 8. 卸载

```bash
rm -rf ~/.claude/skills/just-fe
rm -f  ~/.claude/workflows/{triage,architecture,architecture-review,ui-implementation,api-integration,code-arch-review,test-assessment}-workflow.js
```

Plugin 模式：`/plugin uninstall pis-fe`。

## 9. 目录结构

```
just-fe/
├── SKILL.md                              # 入口：流程编排、续接协议、准入条件、评分铁律
├── MEMORY.md                             # 流程状态模板（复制到 fe-reports/{需求}/ 后使用）
├── README.md                             # 本文件
├── scripts/                              # 7 个 Dynamic Workflow 脚本，每个自包含（无 import，见 §7.1）
│   ├── triage-workflow.js                #   fe-triage
│   ├── architecture-workflow.js          #   fe-architecture
│   ├── architecture-review-workflow.js   #   fe-architecture-review（6 维并行打分）
│   ├── ui-implementation-workflow.js     #   fe-ui-implementation
│   ├── api-integration-workflow.js       #   fe-api-integration
│   ├── code-arch-review-workflow.js      #   fe-code-arch-review（7 维并行打分 + 致命一票否决）
│   └── test-assessment-workflow.js       #   fe-test-assessment（5 维打分）
├── templates/
│   ├── 项目画像模板.md                    # .claude/fe-profile.md 的格式
│   ├── 需求梳理报告模板.md
│   ├── 架构方案模板.md
│   ├── 评分协议.md                        # 打分原则与 80 分红线定义
│   └── 变更日志模板.md
└── references/
    ├── 项目画像初始化.md                  # 探测技术栈、门禁命令、目录约定
    ├── 需求分诊.md                        # 六关筛选与路由决策
    └── 前端功能团队.md                    # 四角色并行分析（提示词规格，由主 agent 编排，见 §7.2）
```
