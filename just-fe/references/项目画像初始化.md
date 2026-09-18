# 前端项目画像初始化

探测当前前端项目的结构与约定，生成 `.claude/fe-profile.md`。

## 触发条件

- 项目根目录无 `.claude/fe-profile.md`
- 用户主动要求 `/fe-profile-init`
- fe-guild 入口检查发现画像缺失

## 探测清单

### 1. 技术栈识别

**操作**: 读 `package.json`

**识别内容**:
- 框架: Vue2/Vue3/React/Angular/...
- UI库: Element UI/Ant Design/Tailwind/...
- 语言: TypeScript/JavaScript
- 构建: Vite/Webpack/Vue CLI/Create React App/...
- 测试: Jest/Vitest/React Testing Library/Playwright/...
- 状态管理: Vuex/Pinia/Redux/Zustand/...
- Node版本: `.nvmrc`/engines字段

**关联文件**: 读 `CLAUDE.md`/README 提取已声明规范

### 2. 门禁命令

**操作**: 读 `package.json` scripts

| 用途 | 识别目标 | 缺失时 |
|------|----------|--------|
| lint | lint:check / eslint | 询问是否配置 |
| format | format:check / prettier --check | 可省略 |
| test | test / test:unit | 标注"无自动化测试" |
| build | build | 标注构建耗时量级 |

**标注**: 每个命令的耗时量级（快<30s / 中30-120s / 慢>120s）

### 3. 接口层

**操作**: 搜索HTTP封装文件

**搜索位置**: `src/api/` `src/services/` `src/request*/` `src/http/`

**记录内容**:
- 接口文件清单
- 请求风格 (Promise/async-await/回调)
- 响应码约定
- 错误处理模式
- 鉴权方式
- 环境切换逻辑

**样例**: 找一个近期接口函数作为新增接口模板

### 4. 路由与页面

**操作**: 定位路由定义

**记录内容**:
- 路由定义位置 (vue-router/react-router/craco路由配置)
- 注册模式 (集中式/模块化/懒加载)
- 路由与页面目录映射规则
- 新增页面标准步骤 (1-2-3步)

### 5. 状态管理

**操作**: 定位store目录

**记录内容**:
- 全局store位置
- 模块划分模式
- 组合式响应式store (若有)
- 视图级store惯例

**判断规则**: 什么进全局/什么留视图级

### 6. 公共/高风险区域

**操作**: 引用计数分析

**识别**: 被大量引用的文件
- 公共组件
- 工具函数
- 基类
- 请求层封装

**输出**: Top 5 高风险区域清单

### 7. 参考实现

**操作**: 按类型选取近期良好实现

| 类型 | 选择标准 |
|------|----------|
| 复杂页面 | 多模块/状态管理/接口调用 |
| 简单页面 | 单组件/无状态 |
| 表单页 | 表单验证/提交处理 |
| 列表页 | 分页/搜索/批量操作 |

### 8. 环境与工具

**检查项**:
- `.codegraph/` 索引是否存在
- 知识库是否存在
- 报告输出目录 (默认 `fe-reports/`)

---

## 流程

1. 按清单逐项探测
2. 整理画像草稿
3. 展示关键决策点（门禁命令取舍/高风险区域/参考实现）
4. 用户确认后写入 `.claude/fe-profile.md`

---

## 纪律

1. **探测不到的标注"未探测到"**——禁止用通用常识填充
2. **耗时量级用真实计时**——不猜
3. **用户手工补充内容重跑时不得删除**

---

## 产物

生成 `.claude/fe-profile.md`，格式见 `../templates/profile-template.md`
