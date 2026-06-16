# 阶段 B 起源流程提交审核报告

**审核时间**：2026-06-16  
**提交哈希**：`e3e8d28`  
**提交信息**：feat: 阶段B起源流程——arch/blueprint SSE端点 + M0立项页  
**审核结论**：✅ **通过** —— 代码质量优秀，架构清晰，测试完备

---

## 一、提交概览

### 变更统计
- **12 个文件**变更，**991 行新增**，30 行删除
- **新增文件**：4 个（creation.ts、creation.ts、parse.ts、index.tsx、parse-smoke.mts）
- **修改文件**：8 个（文档、路由注册、prompt 资产）

### 变更分布
| 模块 | 文件 | 新增行 |
|------|------|--------|
| 后端路由 | `server/src/routes/creation.ts` | 111 |
| 前端页面 | `frontend/src/pages/m0-architecture/index.tsx` | 415 |
| 解析逻辑 | `frontend/src/pages/m0-architecture/parse.ts` | 160 |
| 前端服务 | `frontend/src/services/real/creation.ts` | 100 |
| 测试脚本 | `frontend/scripts/parse-smoke.mts` | 95 |
| Prompt | `server/src/prompts.ts` | 63 |
| 文档 | HANDOFF.md / CLAUDE.md | 少量 |

---

## 二、代码质量审核

### ✅ 架构设计（优秀）

**1. 后端路由设计（`server/src/routes/creation.ts`）**
- ✅ **复用成熟范式**：SSE 流式处理完全复刻 `routes/llm.ts` 的 `/api/llm/clean` 经验
- ✅ **断连陷阱处理**：注释清晰说明 `reply.raw.on('close')` vs `req.raw.on('close')` 陷阱（第 16-19 行）
- ✅ **错误处理完整**：参数校验 → AbortController → chatStream 异常捕获 → 输出过短判定（与 clean 端点对齐）
- ✅ **代码复用**：`streamChat` 辅助函数提取公共逻辑，arch/blueprint 两端点仅差 user prompt 组装
- ✅ **输入验证**：类型定义 `ArchBody` / `BlueprintBody`，必填字段清晰（baseURL/model/topic，baseURL/model/architecture）

**2. 前端服务层（`frontend/src/services/real/creation.ts`）**
- ✅ **SSE 解析复用**：`streamSSE` 通用函数与 `real/llm.ts` 的 `streamSingleChapter` 同构（reader/decoder/event 解析）
- ✅ **错误传播**：HTTP 错误、响应体缺失、流式意外结束三类异常明确抛出
- ✅ **AbortSignal 传递**：支持外部取消（虽当前未用到，但架构完整）
- ✅ **函数签名清晰**：`generateArch` / `generateBlueprint` 语义化包装，参数类型化

**3. 解析逻辑（`frontend/src/pages/m0-architecture/parse.ts`）**
- ✅ **纯函数设计**：无副作用，输入输出清晰，可单测（22 项单测全过）
- ✅ **容错性强**：
  - 标题别名映射（`ARCH_SECTION_MAP`：核心种子/种子、世界观/世界构建）
  - 无分区时整体塞 seed（避免内容丢失）
  - 中文章号转数字（`cn2num` 支持"第十章"）
  - 标题分隔符变体（支持 `- ` `: ` `、` 等）
  - 颠覆度解析兼容星号与纯数字
- ✅ **注释充分**：每个函数头部说明预期格式与容错策略

**4. 前端页面（`frontend/src/pages/m0-architecture/index.tsx`）**
- ✅ **状态管理清晰**：架构区 6 状态、蓝图区 4 状态，命名语义化
- ✅ **节点选择逻辑**：`resolveArchNode` / `resolveBpNode` 优先级（moduleMapping → 首个 enabled）
- ✅ **交互流程完整**：输入 → 生成（流式）→ 编辑 → 采纳（建书/写大纲）→ 继续生成（追加）
- ✅ **错误提示**：空主题、无节点、大纲非空冲突均有友好提示
- ✅ **数据完整性**：采纳架构时同步创建 Book + NovelArchitecture + 设 currentBookId

### ✅ Prompt 内化（优秀）

**`server/src/prompts.ts` 新增内容审核**
- ✅ **方法论保留**：`ARCH_SYSTEM_PROMPT` 完整保留雪花法四步（核心种子公式、角色动力学三角、世界观三维、三幕式情节）
- ✅ **输出格式强制**：固定 `## 核心种子` 等四个二级标题，便于程序解析
- ✅ **Blueprint 节奏原则**：单元划分、过山车效应、结局保护、严守架构、续写连贯五原则明确
- ✅ **字段行格式固定**：定位/核心作用/悬念密度/伏笔/认知颠覆/简述六字段，避免自由格式难解析
- ✅ **去 subagent 痕迹**：无 Python sidecar、无落盘指令，纯 LLM prompt
- ✅ **20 章限制**：Blueprint 单次不超过 20 章（prompt 与后端 `end = Math.min(begin + 19, total)` 对齐）

### ✅ 测试覆盖（完备）

**`frontend/scripts/parse-smoke.mts` 审核**
- ✅ **22 项断言全过**：架构 8 项（分区/别名/无分区/串台）+ 蓝图 14 项（章号/字段/星号/变体/空输入）
- ✅ **边界覆盖**：空输入、无分区、标题变体、中文章号、五星颠覆
- ✅ **实际运行验证**：`node --experimental-strip-types scripts/parse-smoke.mts` 全部通过
- ✅ **不回归**：smoke(13) / ruleclean-smoke(43) 全过，证明新增代码未破坏既有功能

### ✅ 类型安全（严格）

**后端**
- ✅ `npm run typecheck` 通过，无类型错误
- ✅ 新增类型 `ArchBody` / `BlueprintBody` 明确可选字段

**前端**
- ✅ `npm run build`（tsc + vite）通过
- ✅ 新增接口 `ParsedArchitecture` / `ParsedBlueprintChapter` 字段完整
- ✅ `CreationProvider` / `ArchParams` / `BlueprintParams` 复用与扩展清晰

---

## 三、发现的问题与建议

### 🟡 轻微问题（非阻塞）

**1. 前端页面体积**
- **现象**：`index.tsx` 415 行，单文件承载输入表单 + 架构编辑 + 流式输出 + 蓝图表格
- **影响**：可读性尚可，但若后续新增「批量生成」「架构历史版本」等功能，单文件会膨胀
- **建议**：当前可接受，若突破 600 行再考虑拆分子组件（`ArchForm` / `BlueprintTable`）

**2. 错误信息国际化缺失**
- **现象**：所有用户提示均硬编码中文（`'请先填写主题'` / `'缺少 baseURL / model / topic'`）
- **影响**：当前项目定位单用户中文，无影响；若未来多语言需要重构
- **建议**：已知约束，无需改动

**3. Magic Number**
- **现象**：
  - `parseBlueprint` 中 `chapters && chapters > 0 ? chapters : 30`（默认 30 章）
  - `Math.min(begin + 19, total)`（单次 20 章上限）
  - `full.trim().length < 10`（输出过短判定 10 字符）
- **影响**：含义需阅读代码理解
- **建议**：考虑提取常量（`DEFAULT_CHAPTER_COUNT = 30` / `BLUEPRINT_BATCH_SIZE = 20`）

### 🟢 优点总结

**1. 代码复用做得好**
- SSE 范式完全对齐 `routes/llm.ts`
- 前端 `streamSSE` 提取公共逻辑，避免 arch/blueprint 重复

**2. 容错性设计充分**
- 标题别名映射、中文章号、分隔符变体、无分区兜底
- 证明对真实 LLM 输出变体有充分预判

**3. 测试先行**
- parse.ts 纯函数 + 22 项单测，保证解析逻辑可靠
- 提交前验证全过（typecheck / build / lint / smoke），质量把控严格

**4. 文档同步及时**
- `CLAUDE.md` / `HANDOFF.md` 同步更新阶段 B 状态
- 提交信息结构化清晰（后端/前端/测试/文档四块）

---

## 四、安全性审核

### ✅ 无安全隐患

**1. 输入校验**
- ✅ 后端必填字段检查（baseURL/model/topic 等）
- ✅ 章节数上限保护（`Math.min(begin + 19, total)`）
- ✅ 无 SQL 注入风险（无直接数据库操作）

**2. AbortController 使用**
- ✅ `reply.raw.on('close')` 正确绑定响应流断连
- ✅ `ac.signal.aborted` 检查避免重复发送错误

**3. 错误传播**
- ✅ `chatStream` 异常被 catch 并转 SSE error 事件
- ✅ 前端 `streamSSE` 异常向上抛出，不会静默失败

**4. API Key 处理**
- ✅ `apiKey?.trim() || undefined` 保证空字符串不传递
- ✅ 无 console.log 泄露敏感信息

---

## 五、性能审核

### ✅ 无性能瓶颈

**1. 流式处理**
- ✅ SSE 逐 delta 回调，不阻塞主线程
- ✅ 前端 `streamSSE` 使用 ReadableStream reader，内存友好

**2. 解析效率**
- ✅ `parseArchitecture` / `parseBlueprint` 单次遍历，O(n) 复杂度
- ✅ 正则匹配简单（`/^#{1,3}\s*(.+)/`），无回溯风险

**3. React 渲染**
- ✅ `useMemo` 包裹 `enabledNodes` 计算，避免重复过滤
- ✅ 流式更新通过 `setGenArchText(acc)` 单向数据流，无冗余渲染

---

## 六、验证清单

### ✅ 所有验证项通过

| 验证项 | 结果 | 证据 |
|--------|------|------|
| 后端类型检查 | ✅ | `npm run typecheck` 无错误输出 |
| 前端构建 | ✅ | `npm run build` 成功，dist/ 生成 |
| 前端 Lint | ✅ | `eslint .` 无错误 |
| Parse 单测 | ✅ | parse-smoke.mts 22 项全过 |
| Smoke 不回归 | ✅ | smoke.mts 13 项全过 |
| RuleClean 不回归 | ✅ | ruleclean-smoke.mts 43 项全过 |
| Git 提交信息 | ✅ | 结构化清晰，范围明确 |
| 文档同步 | ✅ | CLAUDE.md / HANDOFF.md 已更新 |

---

## 七、审核结论

### ✅ **批准合并**

**总体评价**：阶段 B 起源流程实现质量**优秀**，完全符合生产标准。

**亮点**：
1. **架构清晰**：后端 SSE 范式复用、前端服务层抽象、纯函数解析分离，各层职责明确
2. **容错充分**：解析逻辑对 LLM 输出变体有全面预判（标题别名、中文章号、分隔符变体）
3. **测试完备**：22 项单测覆盖边界 + 既有 smoke 不回归，质量有保障
4. **注释到位**：SSE 断连陷阱、prompt 方法论、解析策略均有清晰说明
5. **类型安全**：前后端 TypeScript 严格模式通过，无类型漏洞

**建议**：
- 当前代码无需修改，可直接合并
- 后续若 `index.tsx` 突破 600 行再考虑拆分子组件
- Magic Number 可在重构时提取常量（非必需）

**下一步**：
1. 用户实机试跑真实 LLM endpoint（arch/blueprint 流式生成 → 采纳 → 蓝图写入大纲）
2. 前端新增 architectures 数据的持久化刷新验证（触发一次 architectures 变更，观察 `/api/store` 写入）
3. 可进入**阶段 C**（M4 生成 + M5 一致性真实化）或**阶段 D**（批量生成）

---

**审核人**：Claude Code  
**日期**：2026-06-16  
**状态**：✅ 审核通过，建议合并
