# 清单 · 代码评审

评审对象：一个仓库相对开工基线的改动（`scope.json` + `git diff`）。「适用」为 fe 或 be 的项只在对应泳道评审；all 两边都评。

full 档分工：本泳道架构师 `DESIGN,ARCH,BLAST`；评审员 `LOGIC,ROBUST,TYPE`；评审员 `CONV,SEC`。lite 档与联调：一个评审员负责全部组，只看 critical 与 major 项（没有方案时 `DESIGN` 组判 na）。

| ID | 组 | 检查项 | 严重度 | 适用 |
|----|----|--------|--------|------|
| DESIGN-01 | DESIGN | 实现与方案的文件清单、模块划分一致，偏离处有理由 | major | all |
| DESIGN-02 | DESIGN | 接口的实现或消费与接口定义逐字段一致（名称、类型、可空、错误码） | critical | all |
| DESIGN-03 | DESIGN | 方案的关键决策（状态归属、分层、事务边界、数据模型）在实现中落实 | major | all |
| DESIGN-04 | DESIGN | 没有实现方案与需求之外的功能 | minor | all |
| ARCH-01 | ARCH | 单文件、单方法没有超项目阈值，职责单一 | major | all |
| ARCH-02 | ARCH | 可复用逻辑没有重复实现（fail 时指出已有实现的位置） | major | all |
| ARCH-03 | ARCH | 没有跨层、跨模块越界引用 | major | all |
| ARCH-04 | ARCH | 没有硬编码域名、环境值、魔法数字 | minor | all |
| ARCH-05 | ARCH | 新增依赖必要且有理由 | minor | all |
| ARCH-06 | ARCH | 逻辑容器与展示组件分离，模板里没有复杂业务表达式 | minor | fe |
| ARCH-07 | ARCH | 局部状态没有误放全局 store，请求走项目统一封装，后端数据经规整层进入视图 | major | fe |
| ARCH-08 | ARCH | 分层职责正确：接入层不写业务，持久化细节不外泄，内部模型不跨模块传递 | major | be |
| ARCH-09 | ARCH | 没有 N+1、循环内读写、无分页的全量加载，查询有可用索引 | major | be |
| ARCH-10 | ARCH | 缓存 key 带隔离维度，有过期与击穿防护；事件发布与本地事务一致（如涉及） | major | be |
| BLAST-01 | BLAST | 被修改文件的调用方仍然成立 | critical | all |
| BLAST-02 | BLAST | 公共组件、公共模块、公共类型的改动列出了波及范围与回归点 | major | all |
| BLAST-03 | BLAST | scope.json 的越界文件逐个判定：与需求无关的格式化、重构已回退或说明 | major | all |
| BLAST-04 | BLAST | 接口与表结构的变更对旧数据、旧客户端兼容 | critical | all |
| BLAST-05 | BLAST | 改动有对应测试，或给出了明确的人工验证点 | minor | all |
| LOGIC-01 | LOGIC | 条件判断方向与边界取值正确 | critical | all |
| LOGIC-02 | LOGIC | 状态与数据联动同步（缓存失效、增删后总数与分页修正） | major | all |
| LOGIC-03 | LOGIC | 并发与时序正确（await 遗漏、依赖未就绪、旧结果覆盖新结果） | critical | all |
| LOGIC-04 | LOGIC | 副作用不重复触发（重复绑定、重复提交、重试无幂等） | major | all |
| LOGIC-05 | LOGIC | 行为与需求验收标准一致 | critical | all |
| LOGIC-06 | LOGIC | 响应式依赖完整，watch 与生命周期不重复执行，路由参数变化后重新取数 | major | fe |
| LOGIC-07 | LOGIC | Mock 只存在于方案指定位置，可整体移除；联调后没有 Mock 残留 | minor | fe |
| LOGIC-08 | LOGIC | 查询过滤条件完整（租户、空间、逻辑删除、状态） | critical | be |
| LOGIC-09 | LOGIC | 事务边界正确，本应原子的写没有被拆开，事务内没有外部调用 | critical | be |
| LOGIC-10 | LOGIC | 写接口幂等，状态机不允许非法跃迁 | critical | be |
| LOGIC-11 | LOGIC | 金额与积分精度、时区与时间区间、批量分页游标处理正确 | major | be |
| ROBUST-01 | ROBUST | 失败、空数据、极值、竞态都有落点 | major | all |
| ROBUST-02 | ROBUST | 错误没有被静默吞掉或转成成功兜底值 | critical | all |
| ROBUST-03 | ROBUST | 定时器、监听、订阅、流、连接等资源都被释放 | critical | all |
| ROBUST-04 | ROBUST | 加载、空态、错误态齐全，组件卸载后不再更新状态 | major | fe |
| ROBUST-05 | ROBUST | 入参校验完整（必填、长度、范围、枚举），外部调用有超时与重试上限 | major | be |
| ROBUST-06 | ROBUST | 关键失败路径有带上下文的错误日志，循环内不逐条打日志 | minor | be |
| TYPE-01 | TYPE | 对外契约显式类型，没有用 any、强制断言、裸 Map 掩盖问题 | major | all |
| TYPE-02 | TYPE | 接口定义的可空性如实反映在类型中 | major | all |
| TYPE-03 | TYPE | 枚举与状态码用类型或常量约束 | minor | all |
| TYPE-04 | TYPE | 对外 ID 类型符合项目约定，没有暴露物理主键；金额用精确类型 | critical | be |
| CONV-01 | CONV | 命名、目录、导入方式与邻居文件一致 | minor | all |
| CONV-02 | CONV | 对外字段命名、分页、响应结构、错误码沿用项目约定 | major | all |
| CONV-03 | CONV | 没有复述代码或解释本次改动的过程性注释 | minor | all |
| CONV-04 | CONV | 格式化与静态检查对改动文件通过 | major | all |
| CONV-05 | CONV | 样式用语义 token 与变量，没有硬编码色值 | minor | fe |
| CONV-06 | CONV | 用户可见文案走 i18n，所有语言包同步 | major | fe |
| CONV-07 | CONV | 表与字段注释、通用字段、禁止物理删除等数据库约定被遵守 | major | be |
| SEC-01 | SEC | 没有密钥或 token 硬编码、没有写进日志 | critical | all |
| SEC-02 | SEC | 用户输入经过校验，没有注入风险（SQL、命令、富文本 XSS、动态字段名） | critical | all |
| SEC-03 | SEC | 服务端校验资源归属，不信任前端透传的身份、租户、金额 | critical | be |
| SEC-04 | SEC | 鉴权判断没有只做在前端 | major | fe |
| SEC-05 | SEC | 敏感数据脱敏 | major | all |
| SEC-06 | SEC | 交互元素可键盘访问，图标按钮有可读名称，状态不只靠颜色表达 | minor | fe |
