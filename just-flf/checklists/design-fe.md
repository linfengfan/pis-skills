# 清单 · 前端方案评审

评审对象：前端方案与 `files.txt`。三个评审员分别负责 `COVER,FEAS`、`STRUCT,STATE`、`RISK,CONV`。

| ID | 组 | 检查项 | 严重度 | 适用 |
|----|----|--------|--------|------|
| COVER-01 | COVER | 每条验收标准在方案里都有落点（哪个组件或哪条数据流负责） | critical | all |
| COVER-02 | COVER | 需求梳理的范围边界被尊重，没有越界设计 | major | all |
| COVER-03 | COVER | 异常流与边界（空、失败、极值、竞态）都有处理设计 | major | all |
| COVER-04 | COVER | 已裁定的决策卡按裁定设计，未裁定的没有被方案擅自决定 | major | all |
| FEAS-01 | FEAS | 用到的框架特性、库、API 在项目当前版本中存在 | critical | all |
| FEAS-02 | FEAS | 新增依赖必要，并说明了现有依赖为何不能实现 | major | all |
| FEAS-03 | FEAS | 引用的接口 id 都存在于接口定义，没有自行发明接口 | critical | all |
| STRUCT-01 | STRUCT | 文件清单完整（新增、修改、删除），路径符合项目目录约定，与 files.txt 一致 | major | all |
| STRUCT-02 | STRUCT | 组件树的逻辑容器与纯展示组件划分清晰，Props 与 Emits 写了类型签名 | major | all |
| STRUCT-03 | STRUCT | 复用了既有组件、composable 与工具，新建的说明了不能复用的理由 | major | all |
| STRUCT-04 | STRUCT | 没有循环依赖或跨模块越界引用，单文件体量不会超项目阈值 | minor | all |
| STATE-01 | STATE | 本地状态、全局 store、URL 的划分恰当，写了为什么不放全局 | major | all |
| STATE-02 | STATE | 请求时机、缓存与失效策略明确 | major | all |
| STATE-03 | STATE | 竞态（旧响应覆盖新响应）与重复提交有处理方案 | critical | all |
| STATE-04 | STATE | 可空字段到视图模型的规整层位置明确 | minor | all |
| STATE-05 | STATE | Mock 方案按接口定义生成，联调时能整体移除 | major | all |
| RISK-01 | RISK | 识别了技术风险（性能、兼容、构建体积、内存泄漏点） | major | all |
| RISK-02 | RISK | 爆炸半径：改动的公共组件、store、请求层波及哪些页面，回归点已列出 | major | all |
| RISK-03 | RISK | 缓解措施可执行，不是「注意」「加强」之类的空话 | minor | all |
| RISK-04 | RISK | 给出至少一个备选方案并说明选择理由 | minor | all |
| CONV-01 | CONV | 组件写法、命名、目录归属、路由注册方式符合项目约定 | major | all |
| CONV-02 | CONV | 样式用语义 token 与变量，i18n 的 key 命名空间与语言包同步已规划 | major | all |
| CONV-03 | CONV | 请求层与 store 写法沿用项目既定模式，偏离处写了理由 | minor | all |
| CONV-04 | CONV | 任务卡有序、可独立验证，每张有目标、涉及文件、完成判定 | minor | all |
