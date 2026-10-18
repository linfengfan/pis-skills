# 清单 · 接口评审

评审对象：接口定义 `api-v<N>.md` 与 `api-v<N>.json`。严重度：critical 3 分、major 2 分、minor 1 分；分数 = 通过项权重 ÷ 适用项权重。≥ 80 且无 critical 不通过才算通过。

- `CONSUME`：前端架构师，站在消费方看
- `IMPL`：后端架构师，站在提供方看
- `DOC`：通用评审员，看定义本身的精确与一致

| ID | 组 | 检查项 | 严重度 | 适用 |
|----|----|--------|--------|------|
| CONSUME-01 | CONSUME | 响应字段足够渲染需求里的每个页面状态，前端不需要再拼接或二次请求才能展示 | critical | all |
| CONSUME-02 | CONSUME | 每个可空字段都标明了可空，并说明为空时的含义 | major | all |
| CONSUME-03 | CONSUME | 每个错误码都写了前端应有表现（提示、跳转、置灰、静默重试） | major | all |
| CONSUME-04 | CONSUME | 分页、排序、筛选参数与返回结构可直接驱动列表组件 | major | all |
| CONSUME-05 | CONSUME | 枚举值与状态流转能直接映射到界面文案和交互，没有前端无法判断的状态 | minor | all |
| IMPL-01 | IMPL | 路径风格、入站类型、身份来源符合后端接口约定 | major | all |
| IMPL-02 | IMPL | 对外只用项目规定的业务主键，没有暴露数据库物理主键 | critical | all |
| IMPL-03 | IMPL | 统一响应体与成功码符合项目约定，错误码引用既有体系，新增的标了【新增约定】并有理由 | major | all |
| IMPL-04 | IMPL | 每个写接口写明幂等键来源与重复提交的预期行为 | critical | all |
| IMPL-05 | IMPL | 变更接口保证旧客户端不被破坏（新增字段可空、不删字段、不改语义），否则给出过渡方案 | critical | all |
| IMPL-06 | IMPL | 能在现有分层与数据模型上实现，需要新增网关路由的已标注 | major | all |
| DOC-01 | DOC | 每个字段都有类型、是否必填、可空、校验规则、说明、示例，嵌套对象逐层展开 | major | all |
| DOC-02 | DOC | api JSON 与字段表逐字段一致（名称、类型、required、nullable），type 取自封闭集合 | critical | all |
| DOC-03 | DOC | 请求侧每个路径参数与必填字段都有 example | major | all |
| DOC-04 | DOC | 关键标识来源辨析覆盖所有同名不同义的 ID，每个接口入参的 ID 标明从哪里取 | critical | all |
| DOC-05 | DOC | 已有接口都有可定位的证据位置；变更接口写了与现状的差异和存量消费方处置 | major | all |
| DOC-06 | DOC | 需求梳理的边界六扫（空、失败、无权限、不存在、并发、降级）在接口上都有错误码或明确的成功兜底 | major | all |
| DOC-07 | DOC | 可勾选验收包含反向条目（不应出现什么） | minor | all |
