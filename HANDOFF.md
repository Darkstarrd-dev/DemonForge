# HANDOFF.md — 项目进展与任务交接

> **用途**：用户在两个办公场所之间通过 git 手动同步本项目。本文档是任一场所
> 拉取代码后**恢复工作的唯一入口**——新会话从这里了解进展、接续任务。
> **约定**：每完成一项任务即更新本文档（勾选 checklist、更新快照与交接备注），
> 之后由用户手动执行 git 同步。

## 快速恢复（新会话从这里开始）

1. **阅读顺序**：`CLAUDE.md`（工程约束与已确认决策）→ 本文档（进展与下一步）→
   `DESIGN.md`（总体设计）→ 当前任务涉及的 `docs/*.md`。
2. **当前阶段**：正式开发启动——后端 `server/`（Fastify 最小 LLM 网关）已建；
   M1 清理与设置页接真实 LLM，其余模块（M2–M5）暂仍 mock。
   **【最新】已完成 Electron 框架迁移**——支持打包为可执行文件，Electron 主进程管理前后端服务器。
3. **当前任务焦点**：① **novel-generator 集成·阶段 A~D 全部完成并通过审核**（数据模型 + sqlite-vec RAG 检索层 + Context Assembler + 起源流程 + 生成管理 + 批量生产）；
    ② **Electron 迁移已完成**——开发/生产模式、进程管理、打包配置就绪，待用户测试验证；
    ③ **3D Demo WASM 崩溃已修复** + **全局 Error Boundary 已添加**——animate 循环异常安全、init 单例化、ErrorBoundary 兜底白屏。
    ④ 文生图 Demo 完善 ModelScope 服务——可选参数全链路透传 + 调试信息区，用户实机测试通过。
    ⑤ 系统设置·节点池增强 6 项功能 + 入库小说数据恢复（sqlite3 .recover）。
    ⑥ **【最新】数据持久化全面加固 + 设置/备份导入导出**——从根上修复"反复数据丢失"的 6 个缺陷（syncAll 改纯 upsert 永不删除 / settings.json 原子写入+.bak / assetDir 启动缓存 / readAll 逐行容错 / 启动日志增强 / 显式 DELETE 端点），并新增设置导入导出 + 完整备份恢复（版本化 bundle、向后兼容、脱敏选项）作为人工兜底。详见 FIXES.md「2026-06-20」。
         ⑦ M1 Step3 文本清理流水线重构
     ⑧ M1 处理范围语义重构 + 节点溯源标签 + 审核批量操作
     ⑨ **【本次】数值输入卡顿修复 + 调度器 per-node 重构 + 工作节点分进程显示 + 拒绝节点去重**——按用户实机反馈做四项整改：① **Tabs 四标签可切换列表**（待处理/完成/工作节点/节点任务，按批次会话跟踪节点接手数/完成数，修复 CSS 强制 tabpane `display:flex` 导致点 tab 不切换的真因）；② **节点级熔断**（连续 3 次 5xx/网络错误自动 `onNodeDisabled` + UI 同步关闭，不再对坏节点无限重试；全节点熔断时剩余任务判错退出不死循环）；③ **批处理可观测性 + 失败隔离**（每条请求日志带实际 batchSize；batch 失败后重试避开该节点 `chapterAvoidNodes`，不再饥饿重拉 9 章；成功响应不再记录流式正文 responseBody）；④ **统一设置改部分应用**（原必须三字段全填才生效的静默 bug，现仅填的生效）+ **cleanNodeOverrides 持久化到 settings.json**（原 useState 重挂载丢失 → 回退默认 batchSize=1，是"100 章发 100 请求"的配置层根因）。新增 `scripts/smoke-batch.mts`（16 项批处理+熔断回归测试，实证 100 章/batchSize 20 = 5 请求）。

## 项目状态快照

- **最后更新**：2026-06-20（第三十七次会话·**数值输入卡顿修复 + 调度器 per-node 重构 + 工作节点分进程显示 + 拒绝节点去重**）
- **阶段**：正式开发——M1 AI 清理端到端跑通；**novel-generator 集成阶段 A~D 全部完成**；**Electron 迁移完成**；M2–M5 仍 mock；业务数据 SQLite 资产库（可配置资产目录），Provider/密钥等设置存用户数据目录
- **新增**：**M1 Step3 文本清理流水线重构**——按用户实机反馈做四项整改：
  ① **Tabs 四标签可切换列表**（`Step3Clean.tsx`）：原单一活跃列表 → `Tabs`（待处理/完成/工作节点/节点任务）。节点按**批次会话**生命周期跟踪（`nodeSessions` + `chapterNode` ref）：分配时创建/追加，本批全完成置 idle 变灰，下次再分配替换，运行结束清理。**修复 Tabs 无法切换的真因**——`index.css` 给 `.ant-tabs-tabpane` 强制 `display:flex` 覆盖了 antd 非活动面板的 `display:none`，四面板同时渲染。移除该规则后面板靠 antd 自身 `.ant-tabs-tabpane-active` 显隐。
  ② **节点级熔断**（`llm.ts`）：`nodeConsecFails` 计连续失败，网关/网络类错误（HTTP 5xx / fetch 失败 / SSE error）累加、成功归零；达 `NODE_FAIL_LIMIT=3` 加入 `disabledNodes`，`pickCandidate` 永久跳过，触发新回调 `onNodeDisabled(nodeId,name,reason)` → UI 把参与开关切关闭 + 红色提示。用户手动重新开启 → `updateNodes` 清熔断状态（手动恢复）。**全节点熔断时**剩余任务一次性判错退出（否则死循环，有回归测试）。
  ③ **批处理可观测性 + 失败隔离**（`llm.ts`）：每条请求 debug 事件带实际 `batchSize`（顶层 + requestBody，日志每条 REQ 直接看出走单章还是批量）；batch 失败后用 `chapterAvoidNodes` 让该章重试时 `pickCandidate(avoid)` 优先避开坏节点（不再饥饿重拉 9 章）；重试上限对熔断中节点放宽到 `MAX_RETRIES+2`。成功响应不再记录流式正文 `responseBody`（保留诊断字段）；错误路径 rawChunks 保留。
  ④ **统一设置改部分应用 + 持久化**：`applyBulkToAll` 原必须三字段全填才生效（静默 bug）→ 改为仅已填字段生效；`cleanNodeOverrides` 从 useState 迁到 store（落 `settings.json`），解决重挂载/步骤切换丢设置 → 回退默认 batchSize=1（"100 章发 100 请求"的配置层根因）。后端 settings 路由透传任意键，无需改后端。
   **新增回归测试** `scripts/smoke-batch.mts`（16 项，node --experimental-strip-types）：实证 100 章/batchSize 20 = **5 请求**（非 100）、10 节点场景同样 5、整除/非整除、单章；熔断场景（坏节点恰在第 3 次 502 后停分配、健康节点接管、单坏节点熔断后判失败不死循环）。
   **本轮新增（第三十六次会话·处理范围 + 节点溯源 + 审核批量）**：
   - ① **处理范围语义重构**（`Step3Clean.tsx`）：范围从绝对章号改为**相对待处理列表**索引（`pendingNotProcessing`，不含 processing）。起止输入框均可清空（null=默认），实时钳制 `起始 ≤ 结束 ≤ 待处理数量`。`max` 属性动态跟随待处理数量缩水。删除 onFinish 里 rangeStart 自动前移逻辑。`retryFailed` 改为新范围语义。信息行改为 `共N · 已处理N · 待处理N · 活跃N`。
   - ② **节点溯源标签**（`types.ts` + `Step3Clean.tsx` + `Step4Review.tsx`）：`ImportChapter` 加 `processedByNode?: { nodeId, nodeName }`——onStart 写入，供完成列表与审核页标注每章由哪个节点处理（紫色 Tag）。skipClean 卷章不标注。
    - ③ **审核页批量操作**（`Step4Review.tsx`）：「全部入库」右侧新增三个按钮——全部接受（completed → accepted + finalText）、全部拒绝（completed → rejected）、拒绝指定节点（Modal + Checkbox 列出章节中出现的节点及章数，勾选后该节点的 completed 章置 rejected）。三者均只作用于 completed（待审核）状态，已 accepted/rejected 的保持不动。
    **本轮新增（第三十七次会话·数值输入去卡顿 + per-node 调度器 + 分进程显示 + 去重）**：
    - ① **DebouncedInputNumber**（`Step3Clean.tsx`）：所有 9 个 InputNumber（3 批量 + N×3 每节点 + 2 范围）统一换防抖输入组件——本地 state 即时显示，失焦才 `onCommit` 父组件。`key={String(value)}` 自动同步外部值变更。消除每按键写 zustand store / 全组件重渲染的 lag。
    - ② **调度器 per-node-per-slot 专用 worker**（`llm.ts`）：从匿名 worker 免费竞争模型改为每节点每并发槽位一个专用 worker（round-robin 创建：slot0→N1#1, N2#1, N3#1; slot1→N1#2, N2#2, N3#2）。worker 绑定节点 `await` 执行，全 batch 原子取队。删 `pickCandidate`；新增 `executeBatch`（接收预成型 batch + `workerId`）和 `workerLoopForNode`（node 禁用/删除→break；并发降低→多余 worker 退出；全退出→drain 队列判错）。`onStart` 签名 +`workerId`。per-node 下 avoid-set 检查移除（由 circuit breaker 自然处理）。
    - ③ **工作节点分进程显示**（`Step3Clean.tsx`）：`NodeSession` 加 `workerId`，以 workerId 为键独立展示，每进程单独条目。`chapterNode` ref 改 `Map<chapterId, workerId>`。「工作节点」Tab 显示「节点名 #1」「节点名 #2」等，每进程独立统计接手/完成/进行中。
    - ④ **拒绝节点去重 fix**（`Step4Review.tsx`）：`filter`/`map` 链 with `seen` Set 经典 bug（filter 执行时 seen 恒空→全过）→ pre-compute `useMemo` + `Map` 去重；移除 `（N 章）` 后缀。
- **摘要**：在 mock 前端基础上**进入实现阶段**。
  运行方式（三选一）：
  - **【推荐】Electron 模式**：双击 `start-electron.bat`（开发模式）或 `npm run dev`，Electron 窗口自动管理前后端；关窗即自动清理进程
  - Chrome 应用模式：双击 `start.vbs`（隐藏启动后端 :8787 + 前端 :5173，Chrome `--app` 应用模式独立窗口；看门狗清理后台进程）
  - 打包版本：运行 `build-electron.bat` 或 `npm run dist`，生成安装包和便携版（`release/` 目录）
  退出：Electron 模式直接关窗或点「退出系统」；Chrome 模式点侧边栏底部「退出系统」。
  **M1 第三步**：AI 路径真实流式已跑通；节点选择 & 并发参数（最大并发/单次章节数/请求间隔）在 Step3 控制栏。
    自动化验证全过：后端 typecheck、前端 eslint/build(tsc+vite)。
    **本轮新增（第十六次会话·阶段 B 起源流程）**：
    - ① 后端：`prompts.ts` 新增 `ARCHITECTURE_PROMPT` / `BLUEPRINT_PROMPT`；`routes/creation.ts` 新建 `/api/llm/{arch,blueprint}` SSE 端点；`index.ts` 注册
    - ② 前端：`services/real/creation.ts`（`streamArch` / `streamBlueprint`）；`api.ts` 导出；`pages/m0-architecture/parse.ts`（22 项单测全过）；`pages/m0-architecture/index.tsx`（架构区/蓝图区全流程）；`main.tsx` 路由 + `AppLayout.tsx` 菜单
    - ③ 验证全过：backend typecheck ✅、前端 build(tsc+vite) ✅、lint ✅、parse-smoke(22) ✅、smoke(13) 不回归 ✅、ruleclean-smoke(43) 不回归 ✅
    **本轮新增（第八次会话·多节点并行 + batch 多章合并）**：
   - ① batchSize 生效：多章合并一次请求，用 `<<<|||CHAPTER_SEP|||>>>` 分隔 + `===CHAPTER_ID:id===` 标记，
     流式中间按 SEP 实时拆章回填；batchSize=1 退化为原单章行为（`real/llm.ts:streamBatch`）
   - ② 多节点中央调度器：节点 = CPU，maxConcurrency = 核心数，章节 = 共享任务队列；
     调度器按"最久未用 → 最少连接"动态分配空闲节点取章，fire-and-forget 异步并发
   - ③ 运行中热调：`CleanQueueHandle.updateNodes()` 即时更新节点池配置（增删节点/调参），
     worker 每轮读最新配置即时生效
   - ④ 重试队列：失败章节入 retryQueue 头部重试（最多 3 次），超限标记 failed
   - ⑤ Step3 UI 重构：节点卡片列表（每节点独立参与开关 + 核心数/批次/间隔可编辑），
     运行中变更即时推送调度器；提示词 TextArea 首次自动填入内置默认
   - ⑥ ProviderNode 扩展：新增 `maxConcurrency`(默认2)/`batchSize`(默认1)/`intervalSec`(默认0)；
     设置页节点编辑 Modal 新增三字段；旧数据 `normalizeProvider()` 补默认值
   - ⑦ `server/src/prompts.ts`：导出 `CHAPTER_SEP` 常量 + `batchInstruction(n)`（保留供后续服务端批量端点）
    - 验证：后端 typecheck ✅、前端 eslint ✅、前端 build(tsc+vite) ✅
   **本轮新增（第九次会话·batch 流式分章 + 颜色编码 + 模型切换）**：
   - ① batch 流式分章显示：`tryFlushCompleted` 重写——`acc.split(SEP)` 取最后一截只传当前章纯文本给 `onChunk`，每章字数从 0 独立增长，实时窗口左右栏均为当前章节内容
   - ② 活跃任务列表滚动 + 左右栏等高等宽（440px），无空白不均
   - ③ 批次颜色编码：`onStart(chapterId, nodeName, batchId?)` 接收 batchId，batch=随机 `hsl(hue,40%,82%)` 左边框
   - ④ 模型切换按钮：每批 anchor 章右侧 `SwapOutlined` Dropdown → `switchBatchNode(batchId, newNodeId)` → abort + re-enqueue + nodeOverrides 锁定
   - ⑤ `executeTask` 重构：batchId 生成、`activeBatches` Map 跟踪 AbortController、失败时 batch 内全章重试
   - 验证：后端 typecheck ✅、前端 eslint ✅、前端 build(tsc+vite) ✅
   **本轮新增（第七次会话·四项增强）**：
  - ① 请求/响应日志增强（过滤/清空/输入输出字数/首字节延迟/耗时/响应体展示）
  - ② 节点下拉默认选设置页「M1 文本清理」映射节点
  - ③ 清理提示词双面板：设置页持久化默认 + Step3 单次覆盖（优先级：本次 > 设置页默认 > 后端内置）
  - ④ 模块→模型映射去除「模型名」输入框，模型名从节点池读取（只读展示）
  - 修复项：`server/src/routes/llm.ts` 新增 `GET /api/llm/prompt`；`services/real/llm.ts` 新增 `getDefaultPrompt` + `systemPrompt` 透传 + `outputLength`/`firstBytesAt` 字段；store 新增 `m1SystemPrompt` 持久化
  - **历史修复（第六次会话）**：
    - ✅ **`/api/llm/clean` 空响应 bug 已定位并修复**：根因是 SSE 客户端断连检测挂在了**错误的信号源**
      （详见下方「AI 对接排障记录」）。经真实端点（`deepseek/deepseek-v4-flash`）端到端验证：SSE 正常转发、
      广告删除 + 人名复原 + 正文保留均符合 §3.7 v2 prompt 预期。
    - 历史新增项：设置页服务端持久化、布局修复、Step3 调试面板、baseURL 归一化（均沿用）

## Checklist

### 已完成

- [x] 项目初始化：`CLAUDE.md`（阶段约束、工作方式、已确认决策）
- [x] `DESIGN.md` 总体设计 v0.1：五模块设计、素材库/作品库分离数据模型、技术架构、P0–P5 阶段规划
- [x] 关键决策确认：Node.js + React + Vite、SQLite（含向量检索）、Provider 抽象（本地+云端）、两库分离、按依赖链 M1→M5 开发
- [x] 待讨论问题 1：分析原型 `10_novel_cleaner.html` → 产出 `docs/M1_text_cleaning.md`（M1 详细设计，含原型缺陷修复清单）；建立 `docs/M1_raw_features.md` 模板
- [x] 建立本交接文档
- [x] mock 前端决策确认：正式前端起点 / Ant Design / 全流程六页（2026-06-12 用户拍板）
- [x] **mock 前端 v0.1 落地**（`frontend/`，详见 `docs/frontend_mock.md`）：
  - 脚手架：Vite + React 19 + TS + antd v6 + zustand(persist) + 路由 + 种子数据（两本假书全链路数据）
  - M1 四步流水线：上传/演示文本、真编码检测与切分、mock 并发清理（流式监控）、双栏对齐 diff + 行级决策、应用决策入库（修复原型缺陷 §6.1）
  - M2 卡片库：筛选/详情/出处回溯/编辑、mock 提取（伪规则提取器）、合并裁决
  - M3 推演：场景管理、上下文组装预览、双候选流式、场景序列编排
  - M4 生成：大纲节点 + 片段硬约束 + 假流式草稿 → 存 draft
  - M5 管理：状态流转、定稿自动+手动一致性检查（含「已死角色出场」真规则）、报告处理、状态时间线
  - 设置页：Provider 节点池 CRUD/测试、模块→模型映射、重置演示数据
  - 验证：`npm run build` 与 eslint 通过；`scripts/smoke.mts` 13 项核心逻辑断言全过；dev server 冒烟正常
- [x] 文档同步：CLAUDE.md（阶段约束+决策表+文档结构）、DESIGN.md §5（前端选型与演进策略）、新建 `docs/frontend_mock.md`
- [x] **raw 特征样本整理与 M1 规则细化**（2026-06-12 第三次会话）：
  - `docs/M1_raw_features - raw.md`（原件保留）→ 归类填充 `docs/M1_raw_features.md` v0.1：
    标题变体（前导零/纯数字行/标题内穿插乱码）、广告四类、正文穿插乱码五类
    （数字碎片直插/变体字混淆字符表/行首竖排藏号/不可见字符+符号杂讯/编码损坏段 mojibake）、
    格式问题、易误删清单；不可见零宽字符已用正则实证、文件无 U+FFFD
  - `M1_text_cleaning.md` 细化：§3.2 样本驱动调整（行首空白容差、纯数字标题预设、
    章节号连续性检查）、新增 §3.9 确定性预清理（不可见字符/HTML 标签剥离）、
    §3.10 清理 prompt 特征追加规则
  - DESIGN.md §7 新增问题 6（mojibake 处理策略）、问题 7（作者求票/请假去留），
    拍板前默认均保留不删
- [x] **M1 特征识别完善：清理 prompt v2 + 非 LLM 规则清理引擎**（2026-06-12 第三次会话·续）：
  - 关键洞察入档：广告混淆针对 TTS（谐音字会被念出、零宽符不会，目的是让听书用户
    听到群号）→ `M1_raw_features.md` §4 机制分析；推论"群号必在文件内明文出现"
    即规则引擎的**自锚定原理**
  - `M1_text_cleaning.md`：§3.7 清理 prompt v2（TTS 机制说明 + 默读测试 + 词语复原 +
    保留红线，v1 存档）；§3.9 规则清理引擎完整设计（块级广告→自锚定载荷提取→数字
    影子序列匹配→变体字噪声段→行首藏号→自指语料复原验证；通用性三层论证 + 实测局限）；
    §3.10 噪声库与 prompt 动态注入（规则层提取的群号喂给 LLM，两层协同）
  - **原型实证**：`frontend/src/utils/ruleClean.ts`（纯 TS 零依赖，噪声库表可配置）+
    `frontend/scripts/ruleclean-smoke.mts`——真实 raw 样本 43 项断言全过（载荷提取
    5/5 无污染、删除 75 处、低置信仅标记 18 处、人名/真实数字/mojibake/作者 ps 零误删）；
    既有 smoke、eslint、build 全过
- [x] **进入正式开发：最小 LLM 网关后端 + M1/设置页真实化**（2026-06-13 第四次会话）：
  - 用户拍板进入实现阶段、后端框架 **Fastify**、本轮范围 **最小 LLM 网关**（无状态、不引入 SQLite）
  - 新增 `server/`：`src/index.ts`（Fastify，:8787）、`src/llmClient.ts`（Provider 抽象，
    OpenAI 兼容 listModels + chatStream，baseURL 规范化）、`src/routes/llm.ts`
    （`/api/llm/test` GET models；`/api/llm/clean` 单章单请求 SSE，§3.8 输出过短判失败；
    预留 `/embed`）、`src/prompts.ts`（内置 §3.7 v2 清理 prompt）
  - 前端：`vite.config.ts` proxy `/api`→8787；新增 `services/real/llm.ts`（testProvider + 真实
    startCleanQueue，保留 worker 并发/暂停/停止骨架、SSE 解析、新增 onError）；`api.ts` 切换；
    `Step3Clean.tsx` 加「AI 路径 / 规则路径」Segmented（规则路径调 `ruleClean` 瞬时 + 统计）；
    `settings` 真实测试反馈（模型列表一键填入 / 错误详情）
   - 验证：后端 typecheck、前端 eslint/build、smoke(13)/ruleclean-smoke(43)、后端 health 与
     test 错误路径全过（真实 endpoint 端到端待用户试）
- [x] **M1 Step3 交互重构 + 一键启动/退出**（2026-06-15 第五次会话）：
  - M1 第三步移除「AI 路径 / 规则路径」Segmented 切换，仅保留 AI 路径（规则路径效果不佳移除）；
    `ruleClean.ts` 工具/测试保留不动
  - 并发参数（最大并发 / 单次章节数 / 请求间隔）从设置页「节点池编辑」移至 Step3 控制栏；
    `ProviderNode` 类型移除 `maxConcurrency`/`batchSize`/`intervalSec`；后端 `startCleanQueue`
    改为 opts 对象入参、worker 循环实现 `intervalSec` 延迟
  - Step3 新增节点下拉选择（替代设置页 moduleMapping.m1Clean 固定节点）
  - **一键启动**：新增根目录 `start.bat`（双击启动后端+前端两个 cmd 窗口，自动打开浏览器）
  - **一键退出**：侧边栏底部「退出系统」按钮 → `POST /api/shutdown`（后端三级退避 kill：PID 文件 /
    窗口标题 / Get-CimInstance 杀 node 进程）→ `window.close()`
   - 前端 `package.json` 新增 `tsx` devDependency（修复 smoke 测试运行依赖）
- [x] **设置持久化 + 布局修复 + Step3 调试面板**（2026-06-15 第五次会话·续）：
  - 设置数据自动同步到 `server/data/settings.json`：新增 `server/src/routes/settings.ts`（GET/POST `/api/settings`），
    store 启动时从服务端拉取优先于 localStorage，`setState` 变更 debounce 1s 写回；`settings.json` 纳入 `.gitignore`
  - AppLayout 高度修复：外层 `height: '100%'`→`'100vh'`，内层加 `overflow: 'hidden'`
  - M1 Step3 文字修正：`"AI / 规则双路径"`→`"AI"`
  - Step3 可折叠调试面板（`Collapse`）：实时记录每次请求（时间戳/节点/模型/章节/原文长度）与响应（chunks 数/状态/错误），
    不重复实时窗口已有内容
  - Sider 退出按钮对齐修复（`height: '100%'`）
  - 调试日志增强：REQ 显示脱敏请求体（`{baseURL, model, apiKey}` JSON）/ RES 显示 HTTP 状态码 + chunks 数 / ERR 显示
     状态码 + 服务端原始响应体前 2000 字 + 已接收 SSE 原始数据；修复 SSE error 双重日志 bug
- [x] **baseURL 智能归一化 + 读取循环修复 + Fastify body 解析修复**（2026-06-15 第五次会话·再续）：
  - `server/src/llmClient.ts` `normalizeBase`：`URL.origin` 提取域名+端口统一拼 `/v1`（覆盖纯域名/带v1/带完整路径三种输入）
  - `frontend/src/services/real/llm.ts` `streamClean`：读取循环从「先判 done→后累积」改为「先累积→处理 SSE→最后判 done」，确保服务端返回的任意文本都进入 rawChunks 供调试面板展示
  - `server/src/routes/llm.ts` `/api/llm/clean`：handler 从同步改为 `async`，**body 验证移到 `reply.hijack()` 之前**（Fastify 对 hijacked handler 的 body 解析有同步/异步差异，与正常工作的 `/api/llm/test` 对齐）
- [x] **✅ M1 AI 清理流程端到端打通**（2026-06-15 第六次会话）：
  - **定位真正根因**：`/api/llm/clean` 空响应不是 body 解析问题，而是**客户端断连检测挂错信号源**——
    `req.raw.on('close')` 在请求体读取完毕后**立即触发**（这是 HTTP 正常行为，不代表客户端断开），
    从而在 chatStream 收到首个 delta 前（实测 ~24ms）就 `ac.abort()`，取消上游 fetch → 空响应。
    上一会话误判为 body 解析问题，async 改造并未解决。
  - **修复**（`server/src/routes/llm.ts`）：断连检测改挂到 **`reply.raw`（响应流）的 `close`** 事件——
    响应流只在客户端真正断开或响应结束时 close（probe 实证：req.raw close 在首数据后即触发，
    而 reply.raw close 在 end() 后才触发）。注释已写入此陷阱。
  - **真实端点端到端验证通过**（deepseek/deepseek-v4-flash via `https://runanytime.hxi.me`）：
    - `/api/llm/test` → 正常返回 17 个模型列表（baseURL 归一化生效）
    - `/api/llm/clean` → SSE 正常流式（21 delta + 1 done，730 字节）
    - 清理效果：微信公众号广告行整段删除；TTS 谐音片段 `毛小説羣89利兰`→`毛利兰`（变体字+数字删除+人名复原）；正文零误删

### 进行中 / 等待用户

- [x] **M1 Step3 清理节点池 UX 三项增强 + 实时窗口高度修复 + Step2 数字冒号模式**（2026-06-20 第三十四次会话·**已实施，用户实机测试通过**）
  - [x] **节点池可折叠**（`Step3Clean.tsx`）：原 `<div>` + `Typography.Title` 的「清理节点池」区块改写为 `<Collapse defaultActiveKey={['nodes']}>`（默认展开，保留原可视性；可手动折叠腾空间）。折叠头带计数提示「（N 个节点，参选 M）」。
  - [x] **统一设置所有节点三参数**（`Step3Clean.tsx`）：折叠面板顶部新增「统一设置所有节点」行——三个 `InputNumber`（进程 1–32 / 章节 1–20 / 间隔 0–60s）+ 「统一设置」按钮（三框都填了才可用）。点击调 `applyBulkToAll()` 把三值一次性写入**全部已启用节点**的 `overrides`（与每张卡片单独调参走同一套机制），所以**统一设置后仍可逐节点单独覆盖**；运行中改动还会热推送给调度器（`hotUpdateNodes`）。
  - [x] **文案改名**（`Step3Clean.tsx`）：统一设置行的三个标签 + 每张节点卡片的标签 **核心→进程**、**批次→章节**（间隔不变）；摘要 Tag 单位后缀同步 `核→进程`。
  - [x] **实时窗口高度修复**（`Step3Clean.tsx`）：用户反馈「未启动任务时高度正常，启动任务后实时窗口被流式文本撑高，不再与左侧活跃任务列表等高」。根因是 **flexbox `min-height:auto`**——flex 子项默认不收缩到内容尺寸以下，内层 `<Row flex:1>`（含两块 stream-pane）一旦 `acc`/章节原文变长就按内容撑开突破 440px。修复：给实时窗口内层 `<Row style={{flex:1}}>` 与左侧活跃任务列表 `<div style={{flex:1,overflow:auto}}>` 都加 `minHeight:0`，让其可收缩到内容以下，内部 `height:100%+overflow:auto` 的滚动面板才能拿到有界高度、超出靠滚动条翻阅。启动任务后两栏固定与左侧等高。
  - [x] **Step2 数字冒号模式**（`split.ts` + `smoke.mts`）：`DEFAULT_SPLIT_PATTERNS` 新增 `maohao` 内置模式（`^(\\d{1,4}[:：].*)`，兼容全角「：」与半角「:」），适配 `001：标题` / `003: 标题` 这类编号+冒号章节行；`smoke.mts` +7 断言（检测推荐 maohao / 命中 3 处 / 切分 3 章 / 标题干净 / 「卷+数字冒号」混合机制：卷行旁路单独成章 + 编号标题切分）。
  - [x] **验证全过**：eslint ✅ / tsc --noEmit ✅（0 错误）/ vite build ✅（710–765ms，仅既有 chunk 体积警告）/ smoke ✅（含新增 7 断言）。
- [x] **数据持久化全面加固 + 设置/备份导入导出**（2026-06-20 第三十三次会话·**已实施，待用户实机验证**）
  - [x] **根因定位**：经三层调研（后端 SQLite/settings、前端 store 同步、类型与 UI）锁定"反复数据丢失"的 6 个相互放大的缺陷：① syncAll 全量删除（payload 没出现的 id 全删 → 前端内存空触发同步清库，106 章主书就此丢失）；② settings.json 非原子 writeFileSync（断电截断）；③ readSettings 静默吞错（损坏当首启）；④ getAssetDir 每次 DB 访问重读 settings.json（损坏级联路径漂移）；⑤ readAll 无逐行容错（一行坏整库 500）；⑥ 全代码库零版本字段。详见 FIXES.md「2026-06-20」根因表。
  - [x] **A1 syncAll 改纯 upsert**（`server/src/store/db.ts`）：删除"SELECT existing → DELETE missing"，只做 `INSERT … ON CONFLICT DO UPDATE`。**永不删除**——从根上消灭清库事故。
  - [x] **A2 显式 DELETE 端点**（`server/src/store/db.ts` + `routes/store.ts`）：新增 `deleteEntities`（表名+id 白名单精确删除）+ `clearAllBusinessData`（备份恢复用）+ `DELETE /api/store`（含 clearAll:true 分支）。前端 `appStore.ts` 的 `deleteBook`（收集级联 id）/`deleteImage`/`resetDemo` 改走 `pushDeleteNow`，不再依赖 syncAll 反推。
  - [x] **A3 settings.json 原子化 + .bak**（`server/src/routes/settings.ts`）：writeSettings 三步（copyFileSync 备份 .bak → 写 .tmp → renameSync 原子覆盖）；readSettings 失败回退 .bak（记 warn + `wasLastReadRecovered` 标记），都失败才返回 {}。
  - [x] **A4 getAssetDir 启动期缓存**（`server/src/store/db.ts`）：模块级 cachedAssetDir 首次计算缓存，避免热路径重读 settings.json；新增 invalidateAssetDir，POST /api/settings 检测 assetDir 变更触发重算。
  - [x] **A5 readAll 逐行容错**（`server/src/store/db.ts`）：循环 try/catch，单行坏跳过 + warn。
  - [x] **A6 启动日志增强**（`server/src/index.ts`）：[data-dir] 行加 settings 是否 .bak 恢复 + assetDir + 各表行数概览。db.ts 加 `PRAGMA busy_timeout = 5000`。
  - [x] **B1 backup.ts 纯函数模块**（`frontend/src/utils/backup.ts`）：BackupBundle 类型（version/exportedAt/app/kind/settings/business?）+ buildBundle/parseBundle/migrateBundle/summarizeBusiness/downloadBundle/readFileAsText/backupFilename。normalizeProvider 抽到 `frontend/src/utils/provider.ts`（无框架依赖，单测可纯 node 跑）。
  - [x] **B2/B3 设置/完整备份导入导出**（`frontend/src/pages/settings/index.tsx`）：两个新 Card——「设置导入/导出」（脱敏选项 Checkbox）+「完整备份/恢复」；导入走 Upload → parseBundle → 预览 Modal（兼容性警告列表 + 数据计数 + API Key 状态 + 合并/清空恢复双按钮，Popconfirm 二次确认）。
  - [x] **B4 向后兼容**（`frontend/src/utils/backup.ts` parseBundle）：非 JSON 才 fatal；缺 version 当 v0；裸 settings.json（无 bundle 包装）自动适配；providers 逐条 try/catch 坏条目跳过；moduleMapping 与 seedModuleMapping 合并补全新 ModuleKey；splitPatterns 确保 custom 永在；业务数据多余键忽略、单类非数组忽略。旧数据导入不报错。
  - [x] **验证全过**：后端 typecheck ✅ / 前端 tsc --noEmit ✅（0 错误）/ tsc -b + vite build ✅（723ms）/ eslint ✅ / **backup-smoke(39) ✅** / smoke(23)+parse(22)+ruleclean(43) 全不回归 ✅。**附**：顺带修复 batch-generate 既有隐式 any（callbacks 加 BatchGenCallbacks 类型标注，让 tsc -b 干净）。
  - [ ] **待用户实机验证**：① 设置导出 → corrupt settings.json → 重启确认日志"settings from .bak: YES"且配置在；② 完整备份 → 清库 → 导入 → 数据回归；③ 导入旧版裸 settings.json/缺字段文件不报错；④ deleteBook/deleteImage/resetDemo 正常删除
- [x] **问题1 入库持久化根因修复 + 数据目录单一真相源**（2026-06-19 第二十九次会话·**端到端验证通过**）
  - [x] **真正根因（终于定位）**：前几轮 `pushStoreNow` async 加固只动了"写入时机"，**没动到病根**。真根因是**数据目录在代码版本间漂移 → db 文件分裂散落**：① SQLite 初版（`3cf6618`）用 `REPO_ROOT = dirname×3(HERE)` 把库写到**项目根 `assets/`**；② Electron 迁移（`34405c3`）改 `paths.ts: join(__dirname,'..','data')` → tsx 跑 src 解析到 `server/src/data/`、node 跑 dist 解析到 `server/dist/data/`。**三个不同位置的 db 互相看不到对方数据**——入库写一处、重启读另一处 → 入库内容消失；某次后端解析到根目录（无 settings.json → `storeInitialized` 缺失 + 库空）→ bootstrap 走播种分支 → Mock 重现。
  - [x] **取证实证**（运行中后端实时探测）：POST 标记 `PROBE_*` 到 `/api/settings`，回查落点确认后端用 `server/src/data`；全表 dump 三个 db（根目录旧库全空/旧表结构无 `image_gallery`、`server/src/data` 含诊断脚本污染的 `test-node-book` 且 chapters=0、`server/dist/data` 不存在）；git 历史 confirm 路径逻辑演变。
  - [x] **修复·单一真相源**：① `electron/main.ts` spawn 后端时传 `NOVELHELPER_DATA_DIR`（dev=`ROOT/server/src/data`，prod=`~/.novelhelper`）+ import `homedir`；② `server/src/utils/paths.ts:getAppDataDir()` 优先读该环境变量（回退逻辑保留向后兼容）；③ `server/src/index.ts` 启动即打印 `[data-dir] settings/json at:` + `asset db dir:` 便于诊断。
  - [x] **清理**（全部确认无用户珍贵数据后删）：根目录 `assets/`（历史遗留空旧库 + 空 images）、`server/src/data/assets/novelhelper.db*`（诊断污染的 test-node-book + WAL）；**保留 `server/src/data/settings.json`** 用户 providers/API keys/moduleMapping 配置，仅清空 `currentBookId`（指向已删幽灵书）+ 删探测残留 `__probe`，`storeInitialized:true` 保持（空库不回填 Mock）。
  - [x] **重建编译**：`server/build`(tsc) ✅ + `build:electron`(dist-electron/main.js) ✅，验证新 dist 含 `imageRoutes`/`image_gallery` 表/`NOVELHELPER_DATA_DIR` 逻辑。
  - [x] **端到端验证（tsx src 模拟 Electron dev）**：传 `NOVELHELPER_DATA_DIR=server/src/data` 启动 → 入库（books=1/chapters=2 含中文）→ PowerShell 终止后端 → 同环境变量重启 → `GET /api/store` **books=1 chapters=2 完整存活**（含中文标题「第一章 开端/第二章 发展」）。启动日志确认数据目录锚定 `server/src/data`。测试数据已清，db 留空供 Electron 启动重建。
  - [ ] **待用户实机验证**：重启 `start-electron.bat` → M1 入库一本真书 → 完全退出 Electron 再进 → 确认入库内容仍在、书库无 Mock 演示书重现。
- [x] **问题1 真因二（body 超限误报成功）—— Fastify bodyLimit + 入库失败可见性**（2026-06-19 第三十次会话·**端到端验证通过**）
  - [x] **复现用户场景后定位真因**：用户实测"入库真书 → force reload/重启后消失"，但上一轮的"小测试书端到端"全过——差异在**数据量**。实证（用 Electron dev 同款 `NOVELHELPER_DATA_DIR` 启动后端）：① 后端层持久化**完全正常**（POST 小书→杀进程→直查磁盘 db→重启→GET，数据 100% 存活，db 路径单一锚定已生效）；② 经 vite proxy(5173) 转发也正常；③ **决定性发现**：POST **大 body**（1.1MB，模拟真书章节正文）→ 后端返回 **HTTP 413 `FST_ERR_CTP_BODY_TOO_LARGE`**——**Fastify 默认 `bodyLimit` 仅 1MB**。入库真书（章节正文大）整本 `syncAll` 一次性 POST 所有 books+chapters 轻松超 1MB → **413 被拒** → 前端 `pushStoreNow` 的 `.catch(() => {})` **静默吞错** → `message.success("已入库")` **误报成功** → 书只活在内存 → force reload/重启后消失。完美解释"小书测试过、真书消失"的全部现象。
  - [x] **修复① 后端提 bodyLimit**（`server/src/index.ts`）：`Fastify({ logger:true, bodyLimit: 50*1024*1024 })`（50MB，足够任何规模小说；百万字 UTF-8 ≈ 3MB）。
  - [x] **修复② 前端关键写入不吞错**（`appStore.ts`）：新增 `pushStoreNowChecked()`——与 `pushStoreNow` 同样绕防抖立即落库，但**失败抛错**（解析后端 413/5xx 的 `{message}` 附 HTTP 状态码），供 `await` + `try/catch`。保留 `pushStoreNow()`（fire-and-forget 安全，向后兼容 deleteBook/resetDemo 等）。
  - [x] **修复③ Step4 入库接入**（`Step4Review.tsx`）：`await pushStoreNowChecked()`，catch 块显示真实错误（含 HTTP 状态码 + 后端 message），并**撤回内存中的入库操作**（`setState({books, chapters:allChapters, importSession:session})` 回到入库前快照），杜绝"看似入库"假象。
  - [x] **验证全过**：后端 typecheck ✅ / 前端 eslint ✅ / build(tsc+vite) ✅ / **大书端到端**（1.1MB POST→200✓→杀进程→直查 db books=1/chapters=15→重启→GET books=1/chapters=15 完整存活，修复前同操作 413）✅。测试数据已清。
- [x] **文生图 Demo 完善 ModelScope 服务**（2026-06-19 第三十一次会话·**用户实机测试通过**）
  - [x] **新增可选参数全链路透传**：ModelScope 官方支持的 `negative_prompt`/`steps`/`guidance`/`seed` 四个可选参数，前端表单（折叠区，默认展开）→ `services/real/image.ts` `ImageGenParams` → 后端 `imageClient.ts` `ImageGenConfig` → `submitBody` 拼装（仅在有值时透传，留空用模型默认值）。参数随表单持久化到 `settings.json`。
  - [x] **分辨率改用 `size` 字符串格式**：原先透传 `width`/`height` 整数，改用 ModelScope 首选的 `size` 字符串（如 `"1024x1024"`，对齐官方 Python 示例）。`ImageGenConfig`/`ImageGenParams` 删除 width/height，新增 `size?`。历史项展示兼容旧 width/height 数据。
  - [x] **新增调试信息区（核心需求）**：新增 `debug` SSE 事件类型——后端 `imageClient.ts` 在提交(`submit`)/轮询(`poll`)/取图(`fetchImage`)三处回传「实际发给 ModelScope 的 payload」与「服务端原始响应体」（含 HTTP 错误码标记），经 `routes/image.ts` 转发；前端服务层解析 `debug` 事件回调上抛；文生图页面「本次生成」卡片下方新增独立「调试信息」Card——两个 monospace 只读文本框：①「后端发送的 Payload」显示实发 JSON；②「ModelScope 返回的响应」按时间顺序追加各阶段响应（提交 task_id、轮询 task_status、取图状态），带时间戳与 `⚠ HTTP xxx` 错误标记。排障时直接可见后端实发 JSON 与服务端原始响应，不再靠猜。
  - [x] **历史项记录生成参数**：`GeneratedImage` 类型扩展 `size`/`steps`/`guidance`/`seed`/`negativePrompt` 字段，生成图片落入历史库时一并记录（便于复现）。文档式 SQLite 表整存 JSON，无需迁移。
  - [x] **验证全过**：后端 typecheck ✅ / 前端 eslint ✅ / build(tsc+vite,14.9s) ✅ / smoke ✅ / parse-smoke ✅ / ruleclean-smoke ✅（全不回归）。**用户实机测试通过**。
- [x] **系统设置·节点池增强 6 项功能 + 入库数据恢复**（2026-06-19 第三十二次会话·**已提交推送 fc9582b**）
  - [x] **Tab 切换文本生成/文生图**：节点池标题右侧 `Segmented` 切 `nodeTypeFilter`，表格按类型过滤；原「类型」列删除；新增节点按当前 Tab 预设 `nodeType`
  - [x] **批量测试**：遍历当前 Tab 且 enabled 的节点，并发上限 4 调 `testProvider`，实时进度（`message.info` key 防抖）+ 结束汇总「x/y 正常」，更新每节点 `lastTestResult`
  - [x] **上移/下移调序**：操作列 ↑↓ 按钮（首行禁用↑、末行禁用↓），在 providers 全量数组交换两项位置，数组顺序即持久化（防抖回写 settings.json），重启保留
  - [x] **复制节点**：新 id，名称按同名编号递增（正则 `/^(.*)\s*\((\d+)\)$/` 取最大编号+1，`X`→`X (2)`→`X (3)`），`usageLeft` 不复制（新额度起始）
  - [x] **并发测试**（仅文本节点显示）：纯前端二分探测——`probeOnce` 经 `/api/llm/clean` 发极短内容（15s 超时），单发连通 + 单请求耗时；逐级 2→4→8→16，遇首个未全部成功的级别回退，取全部成功最大 N 为 `maxConcurrency`，单请求耗时/N 估算 `intervalSec`（min 0）；弹 Modal 展示探测日志 + 「应用推荐参数」写回
  - [x] **次数限制 + 每日刷新**：`ProviderNode` 加 `usageLimitEnabled`/`usageLimit`/`usageLeft`/`usageResetDate`（normalizeProvider 补默认值，向后兼容）；新增 store action `consumeProviderUsage(nodeId)`——未开启返回 true，跨本地自然日（`YYYY-MM-DD`）重置 `usageLeft=usageLimit`，到 0 返回 false（调度器跳过），否则递减写回；接入 `batch.ts`/`llm.ts` `pickCandidate` 经 `opts.isNodeAvailable` 钩子（由 Step3Clean/batch-generate 启动队列时传入）；编辑 Modal 加「次数限制」Switch + 条件「每日额度」InputNumber；表格加「次数(今日)」列展示 `剩余/额度`，用尽标红
  - [x] **入库数据恢复**：本次功能开发后发现书库为空——排查确认数据未真丢（SQLite 行 delete 但数据页未 VACUUM，残留 db 字节流）。清空发生在本次改动之前（db 22:10 被改写，早于 settings 22:58），与本次功能无关；根因是 `syncAll` 全量删除策略 + 前端内存为空触发同步。恢复过程：备份 db → 停后端 → `sqlite3 .recover` 重建 lost_and_found（处理跨页）+ db 字节流大括号配对（补 recover 漏的短 book 行）→ 直接 upsert 写回（纯插入/更新绝不删除）→ 补回被覆盖的 seed 书行（book-ref-1/book-proj-1）+ seed 大纲 → 修复 moduleMapping（prov-1/prov-2 → SenseNova）→ 重启后端。验证：3 本书/113 章/13 卡片/6 大纲，主书 106 章正文完整
  - [x] **验证全过**：tsc --noEmit ✅ / vite build ✅（构建期遇 rolldown 无法解析内联第 4 对象参数，已将 batch-generate 回调提取为具名 const `callbacks` 规避）
  - [ ] **待用户实机验证**：刷新前端页面（Ctrl+R）让内存 moduleMapping 从后端重拉（否则旧值防抖回写可能覆盖）；各新功能点（Tab/批量测试/上下移/复制/并发测试/次数限制）实机走一遍
  - [ ] **结构性风险待修（建议）**：`syncAll` 全量删除策略在「前端内存为空 + 触发同步」时会清库——建议加防护「payload.books 为空但库非空且 storeInitialized 时拒绝删除只 upsert」。本次未改，留待确认
- [x] **问题2 已解决 + 问题1 持久化加固 + 问题3 拆分后自动检测标题**（2026-06-19 第二十八次会话）
  - [x] **问题1 入库持久化**：`pushStoreNow` 返回 `Promise<void>`，`Step4.doStore` 改 `await pushStoreNow()`（写完才提示成功）。端到端诊断脚本 + 真机后端重启测试双重验证持久化链路正常（含后端重启存活）。**用户仍复现 → 硬刷新 Electron 窗口（Ctrl+Shift+R）/ 重启 start-electron.bat**（vite HMR 对 appStore.ts 模块级副作用热替换不稳定）
  - [x] **问题3 拆分后自动检测**：新增 `split.ts:detectLeadingChapterTitle(content, patterns)`（取首条非空行 stripDecor 后 findTitleInLine 测各内置模式，命中返回 `{title, content(剥首行)}`，无命中 null）；`Step2Split.splitAtCursor` 接入（标题优先级：用户输入 > 自动检测 > 「原标题（续）」）；UI 提示更新；smoke +4 断言
  - [x] **验证全过**：eslint ✅ / build(tsc+vite,725ms) ✅ / smoke(34) ✅ / ruleclean-smoke(43) ✅ / parse-smoke(22) ✅
- [x] **M1 入库持久化 + 书库阅读页 + Step2 光标拆分修复**（2026-06-19 第二十七次会话）
  - [x] **问题1 入库重启消失**：根因是 Step4 `doStore` 仅依赖 1s debounce 落库，关窗/重启竞态下后端可能读空 → bootstrap `else` 分支把内存业务数据清空为 `[]` → 订阅把空 POST 回后端反向删除刚入库的书。修复：① `appStore.pushStoreNow` 改 `export`；② `Step4.doStore` 入库即调 `pushStoreNow()`（绕 debounce 立即落库）；③ bootstrap `else` 分支清空内存前先 `storeReady=false` 再恢复，避免清空这一步本身触发订阅把空写回后端
  - [x] **问题3 Step2 光标拆分按钮缺失**：根因是 antd v6 的 `Input.TextArea` ref 暴露组件实例 `{ resizableTextArea: { textArea } }` 而非原生 `HTMLTextAreaElement`，`textareaRef.current.selectionStart` 恒 `undefined` → `pos=NaN` → `cursorPos` 永远 null → 按钮/输入框永不显示。修复：`getNativeTextArea()` 安全取原生节点；`handleSelectText` 用 `requestAnimationFrame` 等一帧读最新 `selectionStart`（点选瞬时浏览器选区可能未刷新）；ref 类型改联合类型去 `as never`
  - [x] **问题2 书库阅读/编辑页**：新增 `/book-reader?bookId=xxx` 页（`pages/book-reader/index.tsx`），沿用 M5 `viewing/editText/updateChapter` 范本——左侧章节列表（每章「编辑标题」受控 Input + 保存/取消）+ 右侧正文（只读 `prose-view` 展示，「编辑正文」切 TextArea，「保存」调 `updateChapter` + `pushStoreNow`）；书库概览表格「操作」列加「打开」按钮（primary ghost）+ 整行 `onRow.onClick` 也可打开（按钮区 `stopPropagation`）；`main.tsx` 注册路由
  - [x] **验证全过**：eslint ✅ / build(tsc+vite,772ms) ✅ / smoke(30) ✅ / ruleclean-smoke(43) ✅ / parse-smoke(22) ✅ / 后端 typecheck ✅
- [x] **M1 Step2 章节自动检测 + 卷/前缀处理 + 检测池可配置**（2026-06-19 第二十五次会话）
  - [x] **自动检测算法** `split.ts:detectChapterPattern`：逐行扫描，每行先 `stripDecor` 剥装饰前缀再对各模式（非 custom）测命中；`hitCount >= MIN_HITS(2)` 取最大者；卷模式（juan）仅无章类命中时兜底；confidence = best/(best+second)；返回 `{patternKey, hitCount, confidence, reason, sampledTitles(前5)}`
  - [x] **装饰前缀剥除** `stripDecor`：两类交替反复剥——① 成对符号包裹块 `[爱心]`/`【公告】`/`（注）`/`「」`等（内容可含中文，单轮剥一个块）② 散落单个装饰符号 + 空白；最多 10 轮
  - [x] **卷单独成章** `splitChapters`：内置 `VOLUME_REGEX` 旁路识别卷行（不依赖用户当前模式，且当前模式含「卷」字时不旁路），卷行单独成一章 `isVolume:true`，内容为卷行后到下一卷/章行前的文本；keepPrologue=false 时开头正文并入首个卷章
  - [x] **模式池可配置**：`SplitPattern` 类型（regex 字符串 + `flags?` + `builtin?`）存 `settings.json`；`DEFAULT_SPLIT_PATTERNS` 8 模式（章/回/卷/节、X章、Chapter N 带 `i` flag、数字+顿号、custom）；`compilePatterns` 编译为运行时 RegExp
  - [x] **appStore** `splitPatterns` 切片（settings 通道）：`settingsPayload` 统一构造（消除三处重复）；`setSplitPatterns`/`resetSplitPatterns` actions 用 `pushSettingsNow` 立即落库；bootstrap 合并补 custom 兜底
  - [x] **Step2Split**：进入页 lazy `useState` 初始化检测 + 推荐 patternKey（无 effect setState，lint 合规）；Radio 用 store 模式池；Alert 显示检测 reason + 抽样标题 Tag + 「重新检测」按钮；预览列表卷章显紫色「卷」Tag；applySplit 时 `isVolume→skipClean`
  - [x] **Step3Clean**：useEffect 把 `skipClean` 章自动置 `completed`+`cleanedContent=content`（原样保留，不调 LLM）；`rangeTargets` 排除 skipClean 双保险；状态列显「卷·跳过清理」紫 Tag
  - [x] **设置页**「章节检测模式池」Card：Table（名称/正则/内置标记/操作）+ 新增/编辑 Modal（regex 试编译校验）+ 删除（custom 不可删）+ 恢复默认
  - [x] **验证全过**：smoke(23：原 13 不回归 + 新增 10 检测/卷/前缀断言，demo 章数 7→9 含 2 卷) ✅ / 前端 eslint ✅ / build(tsc+vite,14s) ✅ / 后端 typecheck ✅
- [x] **M1 Step2 闭引号收尾修复 + 预览光标人工拆分**（2026-06-19 第二十六次会话）
  - [x] **句末标点护栏扩展** `split.ts:SENTENCE_END`：新增 `\u201D`（"中文右引号）和 `\u2019`（'中文右单引号）。修复对话 `…幸运观众～"第2章 名为日常的崩坏` 类粘连场景——原集合仅含 ASCII `"`（U+0022），中文闭引号未命中导致标题被判正文引用。开引号不加入（对话开头非章节边界）
  - [x] **预览光标人工拆分** `Step2Split.tsx`：展开章节文本改为可定位光标的 textarea（`onClick`/`onSelect`→`selectionStart` 反算 content 偏移）；显示光标偏移 + 新章标题输入框（默认 `原标题（续）`）+「在此拆分」按钮（`ScissorOutlined`）。点击拆分按光标偏移切当前章 content 为两段，前段留原章、后段插入为新章，章节数+1，列表实时更新
  - [x] **人工覆盖层** `manualOverrides`：拆分后预览改用人工结果，避免 regex 重算覆盖；切换模式/正则/序章选项时通过「渲染期签名对比」（`splitSignature` + `prevSignature`）自动清空（React 官方「adjusting state on prop change」模式，规避 `react-hooks/set-state-in-effect`）
  - [x] **smoke** +7 断言（闭引号收尾粘连检测/切分/标题干净/前置正文归序章/后续正文归新章），总计 smoke(30)
  - [x] **验证全过**：smoke(30) ✅ / eslint ✅ / tsc --noEmit ✅ / build(tsc+vite) ✅
- [x] **文生图 Demo 持久化 + 分辨率下拉**（2026-06-19 第二十四次会话）
  - [x] **持久化分工**：图片数组（大）→ SQLite `/api/store`（新增 `image_gallery` 文档表，随 syncAll/readAll 自动建表读写）；表单草稿 provider/nodeId/prompt/分辨率（小）→ JSON `/api/settings`。沿用 appStore 既有双通道，不引入第三种
  - [x] **appStore**：新增 `imageGallery: GeneratedImage[]` + `imageDemoForm` 两个切片 + `addImage(img)`（unshift 头部）/ `deleteImage(id)` actions（均 `pushStoreNow` 立即落库）；businessPayload / 两处 subscribe / bootstrapStore / reloadStoreFromBackend / flushStoreWrites 全部接入
  - [x] **页面重写** `pages/image-demo/index.tsx`：表单去掉 useState 改读写 store（切换页面/重启不丢）；生成成功除即时预览外 `addImage` 落库；结果区拆「本次生成」预览 +「生成历史」网格（每张 prompt 摘要/尺寸/模型 + 下载 + Popconfirm 删除 + 一键清空）
  - [x] **分辨率下拉**（仅 ModelScope）：5 预设 1024×1024/1280×720/720×1280/1024×768/768×1024；`parseRes` 解析 → 透传 `width`/`height` 经 `services/real/image.ts` → 后端 `imageClient.ts` 提交 body 追加（对齐 Z-Image-Turbo 官方 `height`/`width`）→ `routes/image.ts` 透传
  - [x] **类型**：`types.ts` 新增 `GeneratedImage`；`ImageGenParams`/`ImageGenConfig` 加可选 `width?`/`height?`（有值才传，向后兼容）
  - [x] **lint 修复**：`react-hooks/purity` 禁组件作用域调 `Date.now()` → 下载文件名改用图唯一 `img.id`（已含时间戳）
  - [x] **验证全过**：后端 typecheck ✅ / 前端 eslint ✅ / build(tsc+vite) ✅（797ms）/ smoke(13) 不回归 ✅
- [x] **文生图 Demo（ModelScope）**（2026-06-19 第二十三次会话·代码已在 497fde1）
  - [x] **节点池类型下拉**：ProviderNode 编辑表单加「类型」（文本生成/文生图），表格加类型列；模块映射下拉过滤掉文生图节点；`types.ts` 加 `ProviderNodeType='text'|'image'`
  - [x] **Demo 页** `/demo-image`：服务商（ModelScope）+ 文生图节点 + prompt → 生成图片，SSE 进度（submitted/polling/done）+ 内联展示 + 下载；左侧菜单新增入口
  - [x] **后端** `imageClient.ts`：ModelScope 异步任务协议（提交任务→轮询状态→取图转 base64 data URL），Python 官方示例转 TS；`/api/image/generate` SSE 路由（断连 abort，同 `/api/llm/clean` 风格）
  - [x] **前端服务层** `services/real/image.ts`：SSE 读取器，`api.ts` 导出 `generateImage`
- [x] **预设书删除后重现修复 + 进程清理**（2026-06-18 第二十二次会话·代码已在 067c1ad）
  - [x] `storeInitialized` flag：bootstrap 仅首次播种，用户删光全部书后不再回填预设（根因：每次 bootstrap 都播种导致删完重现）
  - [x] `pushStoreNow()`：删除/重置立即落库（绕过 1s debounce，避免"删完立刻关窗"竞态丢失写入）
  - [x] `flushStoreWrites()` + `beforeunload`/`pagehide`：关窗前冲刷未写数据（keepalive 续命）
  - [x] AppLayout 退出 handler：flush 后再后端 shutdown
  - [x] `cleanupProcessesSync()`：同步端口杀进程替代异步 spawn（修复每次重启残留 stale 进程）
  - [x] `start-electron.bat` 去掉 `pause`（CMD 窗口退出时自动关闭）
  - [x] HomePage 移除 mock demo 流程 Alert
- [x] **书库删除功能 + UI 清理 + M0 节点 fallback 修复**（2026-06-18 第二十三次会话）
  - [x] **书库概览页添加删除按钮**：每行「操作」列放删除按钮 → 弹出 Modal 列出该书的章节/卡片/场景数量等将删数据 → 底部 Checkbox「我已了解将删除以上全部数据」必须勾选后红色「确认删除」按钮才可用（未勾选 disabled）；`destroyOnClose` 每次打开重置勾选
  - [x] **`appStore.deleteBook(id)` 级联清理**：一次调用清理 books/chapters/cards/outline/architectures/scenes/fragments（按 sceneId 间接）/stateEvents/issues/mergeCandidates（按 cardId 间接）；删当前作品时 `currentBookId` 自动切到首个剩余 project，无则置空
  - [x] **移除 Header 右上角 mock 演示模式 Tag**：`AppLayout.tsx` 删除 `<Tag>` 及未用 import
  - [x] **修复 M0 立项「请选择生成节点」假报错**：根因是 Select 显示值用 `archNodeId ?? resolveArchNode()`（看着已选），但 `runArch` 实际调 `getProvider(archNodeId)` 时 state 仍为 null（用户走默认映射没手动改下拉）→ `getProvider(null)` 误报。修复：`runArch`/`runBlueprint` 均改用 `archNodeId ?? resolveArchNode()`，默认映射节点真正生效
  - [x] **验证全过**：前端 eslint ✅ / build(tsc+vite) ✅（16s）
- [x] **`start-electron.bat` 启动报错已修复**（2026-06-18 第二十二次会话）
  - [x] **根因**：`start-electron.bat` / `start.bat` 是 **UTF-8（无 BOM）+ LF** 保存，开头带中文 `rem` 注释。Windows CMD 用系统默认代码页 **GBK(936)** 读取 .bat 字节，中文注释被当 GBK 解码成乱码（`侊紙濡?"濡偓濞村鍩?...`），乱码字节错位破坏 `rem` 注释边界，把乱码片段拼上下一行 `chcp 65001 > nul` 当一条命令执行 → 报错；`UTF-8` 里的 `-8` 也被切出来当命令 → `'-8' 不是内部或外部命令`。**关键**：`chcp 65001` 写在 bat 里救不了 bat 自己——CMD 读 .bat 用系统代码页，在 chcp 执行之前完成，故「UTF-8 中文 bat + 开头 chcp 65001」是经典反模式
  - [x] **修复**：`start-electron.bat` / `start.bat` 的中文 `rem` 注释改纯英文；换行 LF → CRLF；保留 `chcp 65001`（它对 bat 之后 Node/Electron 的 UTF-8 输出仍有效）
  - [x] **验证**：`file` 报告 `ASCII text, with CRLF line terminators` ✅；全文非 ASCII 字节扫描 `no non-ASCII bytes found` ✅（`build-electron.bat`/`test-electron.bat`/`verify-electron.bat` 本就纯英文，无需改）
- [x] **3D Demo WASM 崩溃 + 全局白屏已修复**（2026-06-18 第二十一次会话）
  - [x] **根因**：① `requestAnimationFrame` 排在 `world.step()` 之前，异常后下一帧已入队无法取消 → WASM 堆无限异常循环彻底损坏；② `RAPIER.init()` 模块级 `rapierReady` 布尔标记在 StrictMode/HMR 下不可靠；③ 无 Error Boundary 兜底，WASM 异常穿透 React 树 → 白屏
  - [x] **修复 `demo-3d/index.tsx`**：init 单例化（`ensureRapierReady()` 全局 promise）；animate 整帧 try/catch + 任意异常立即 stop；`requestAnimationFrame` 移到 step 成功之后（不再先排下一帧再步进）；stop 幂等 + `world.free()` 包 try/catch；复位按钮 async 确保旧引擎完全销毁后再重启
  - [x] **新增全局 Error Boundary**（`frontend/src/components/ErrorBoundary.tsx`）：class 组件，`getDerivedStateFromError` + `componentDidCatch`，fallback UI 含「重置页面」+「返回首页」按钮，即使 WASM 异常穿透也不再白屏
  - [x] **`main.tsx` 路由层包 `<ErrorBoundary>`**：包住 `<Routes>`，layout 内外崩溃均兜住
  - [x] **验证**：`npm run build`（tsc + vite）✅ / `npm run lint` ✅
- [x] **Electron 框架迁移完成**（2026-06-18 第十九次会话）
  - [x] 创建 `electron/main.ts` 主进程（进程管理、窗口创建、资源清理）
  - [x] 配置打包工具 electron-builder（NSIS 安装包 + 便携版）
  - [x] 后端适配：启用编译输出（`server/dist/`）、移除 `.ts` 导入扩展名、动态数据目录（开发/生产模式）
  - [x] 创建 `server/src/utils/paths.ts`（数据目录策略：开发模式用项目目录，生产模式用 `~/.novelhelper/`）
  - [x] 修改 `server/src/routes/settings.ts` 和 `server/src/store/db.ts` 使用动态路径
  - [x] 创建启动脚本：`start-electron.bat`（开发）+ `build-electron.bat`（打包）
  - [x] 创建文档：`ELECTRON.md`（完整说明）+ `ELECTRON_CHECKLIST.md`（检查清单）
  - [x] 编译验证：后端 build ✅、Electron 主进程 build ✅、依赖安装 ✅
  - [ ] **待用户测试**：开发模式运行 + 窗口关闭清理 + 打包应用验证
- [ ] **用户补充 raw 特征余项并拍板新问题**：`M1_raw_features.md` §1 基本情况
      （编码/文件规模/是否一文件多本）与 §2（卷结构、序章番外）待确认；
      DESIGN.md §7 问题 6（mojibake 处理）、问题 7（作者求票去留）待拍板
- [ ] **用户试用 mock 前端**（`cd frontend && npm install && npm run dev`），反馈交互调整意见

### 待办（设计阶段）

- [~] **将 novel-generator skill 结合进项目**（2026-06-16 规划，详见 `docs/novel_generator_integration_plan.md`）：
      把 opencode 的 novel-generator skill（雪花法架构 / 三幕式 / 滚动摘要 / 角色状态 / RAG / 批量）
      **内化为项目原生功能**（后端网关端点 + SQLite 数据模型 + 前端流程页），而非运行 skill 本身。
      范围四块全做，分 A（地基）→ B（起源）→ C（生成/管理真实化）→ D（批量）四阶段。
      参考资料备份在 `ref/`（见 `ref/README.md`）。
  - [~] **阶段 A 地基**（2026-06-16 第十五次会话·代码已落地，**自动化验证待补**——本会话 auto-mode classifier 暂不可用无法跑 npm 命令）：
    - [x] 数据模型：`types.ts` 加 `NovelArchitecture`/`RagChunk`、扩 `Book.globalSummary`/`Chapter.summary`/`OutlineNode` 节奏字段、`ModuleKey` 加 `m0Arch`/`m0Blueprint`/`m5Finalize`；`seed.ts` 加 `seedArchitectures`(空) + 补 moduleMapping 三键；`appStore.ts` 加 `architectures` 切片（seedState/resetDemo/businessPayload/两订阅/bootstrap/reload）+ moduleMapping 合并补全；`settings/index.tsx` `MODULE_LABELS` 补三 label（自动出 UI 行）
    - [x] sqlite-vec：`server` 装 `sqlite-vec@0.1.9`（**已实机验证** Win 加载+vec0 建表+KNN 通）；`db.ts` ENTITIES 加 `architectures` 表 + `sqliteVec.load` + `chunk_meta` 表 + 导出 `getDb`
    - [x] embedding：`llmClient.embed()` + `/api/llm/embed` 实现（原 501 占位）
    - [x] RAG 检索层：新建 `server/src/store/vector.ts`（`splitText` 递归分块 + `ensureVecTable` 维度记录 + `addToVectorStore` + `queryVectorStore`）；`store.ts` 加 `/api/store/vector/{add,query}`；`settings.ts` 加内部 `updateSettings`
    - [x] Context Assembler 骨架：新建 `server/src/contextAssembler.ts`（`assembleContext` 收集架构/蓝图/摘要/角色态/RAG/已采纳片段，不拼 prompt，阶段 A 不被端点调用）
    - [x] **验证全过**（2026-06-16 第十五次会话尾·classifier 恢复后补跑）：后端 typecheck ✅；前端 build(tsc+vite) ✅、lint ✅；
      smoke(13) ✅、ruleclean ✅；RAG 直测（splitText 分块 + vec_chunks 建表/插入/KNN-join chunk_meta，BigInt rowid）✅；
      后端端点冒烟 ✅（health 200 / embed·vector/add·vector/query 缺参 400 / 空库 query 短路返回空 / store 返回含 architectures 键证明 sqlite-vec 真实加载）。
      **本轮修复 2 个真实 bug**：① `contextAssembler.ts` 闭包内 `chapterIndex` 未窄化（提局部 const）；
      ② `vector.ts` vec0 rowid 必须 BigInt（普通 number 入库即报错，直测发现）。
      仅真实 embedding endpoint 的 add→query 端到端 + 前端造 architectures 刷新持久化留待用户实机试（embed 为简单 HTTP 转发，SQL 已直测，剩余风险低）。
   - [x] **阶段 B 起源**（2026-06-16 第十六次会话·**代码已落地并验证全过**——见 `docs/phase_B_origin_plan.md`）：
     prompt 内化（ARCH/BLUEPRINT）+ 后端 `routes/creation.ts` 的 `/api/llm/{arch,blueprint}` SSE 端点 +
     前端「M0 立项·架构」页（点子→架构四步流式→采纳建新书→一键蓝图→写 OutlineNode）。
     已拍板：采纳架构时新建作品；蓝图仅当大纲为空时写入；架构四块分区可编辑。
     - [x] 后端：`prompts.ts` 新增 `ARCHITECTURE_PROMPT` / `BLUEPRINT_PROMPT`；`creation.ts` 新建 `/api/llm/arch` / `/api/llm/blueprint` SSE 端点；`index.ts` 注册
     - [x] 前端：`services/real/creation.ts`（SSE 解析 + `streamArch` / `streamBlueprint`）；`api.ts` 导出；`pages/m0-architecture/parse.ts`（`parseArchitecture` / `parseBlueprint` 纯函数 22 项单测全过）；`pages/m0-architecture/index.tsx`（架构区/蓝图区全流程）；`main.tsx` 路由 + `AppLayout.tsx` 菜单
     - [x] **验证全过**：后端 typecheck ✅ / 前端 build(tsc+vite) ✅ / lint ✅ / parse-smoke(22) ✅ / smoke(13) 不回归 ✅ / ruleclean-smoke(43) 不回归 ✅
     - [x] **提交审核通过**（2026-06-16 第十七次会话）：代码质量优秀，架构清晰，测试完备；详见 `docs/review_phase_B_commit.md`
   - [x] **阶段 C 生成/管理真实化**（2026-06-16 第十七次会话·**代码已落地并验证全过**）：
     draft/finalize/consistency prompt 内化 + 后端 3 个 SSE 端点 + Context Assembler 完善 +
     前端服务层（generateDraft/finalizeChapter/checkConsistencyReal）接入，保留 mock 版本兼容现有页面。
     - [x] Prompt 内化：`prompts.ts` 新增 `DRAFT_SYSTEM_PROMPT`（写作原则 + 保留已采纳片段）、`FINALIZE_SYSTEM_PROMPT`（摘要 + 状态事件 JSON）、`CONSISTENCY_SYSTEM_PROMPT`（三维度审校 JSON）
     - [x] Context Assembler：`contextAssembler.ts` 已完整实现 6 个组件（架构/蓝图/摘要/状态/RAG/片段）
     - [x] 后端端点：`routes/creation.ts` 新增 `/api/llm/draft`（接收 Context 组装结果）、`/api/llm/finalize`、`/api/llm/consistency`
     - [x] 前端服务层：`services/real/generation.ts`（generateDraft/finalizeChapter/checkConsistency）；`api.ts` 导出新接口（generateDraft/finalizeChapter/checkConsistencyReal），保留 mock 版本（generateChapterDraft/checkConsistency）供现有页面兼容
     - [x] **验证全过**：后端 typecheck ✅ / 前端 build(tsc+vite) ✅ / lint ✅ / smoke(13) 不回归 ✅ / ruleclean-smoke(43) 不回归 ✅ / parse-smoke(22) 不回归 ✅
   - [x] **阶段 D 批量生产**（2026-06-16 第十七次会话·**代码已落地并验证全过**）：
     批量章节生成调度器（复用 M1 架构）+ 批量生成 UI 面板。
     - [x] 调度器架构：`services/real/batch.ts` 的 `startBatchGenerate`（复用 M1 多节点池/并发/重试逻辑，改造为 draft→finalize 串行子流程）
     - [x] 失败策略：某章失败立即停止（避免剧情崩坏），已完成章节保留
     - [x] 批量面板：`pages/batch-generate/index.tsx`（章节范围选择 + 节点配置 + 进度监控 + 控制按钮）
     - [x] 路由菜单：`main.tsx` 路由 + `AppLayout.tsx` 菜单（RocketOutlined 图标）
     - [x] **验证全过**：前端 build(tsc+vite) ✅ / lint ✅ / smoke(13) + ruleclean-smoke(43) + parse-smoke(22) 全部不回归 ✅
  - [ ] 阶段 C 生成/管理真实化、阶段 D 批量（依赖阶段 B）
- [ ] 待讨论问题 2：M3 角色语言风格约束方式（卡片维护"风格描述 + 台词例句"是否足够）
      ——mock 已按"描述 + 例句"实装卡片与推演演示，可在试用后结合体感拍板
- [ ] 待讨论问题 3：一致性检查触发时机（定稿自动 / 手动）——mock 演示默认"定稿自动 + 随时手动、不阻断定稿"
- [ ] 待讨论问题 4：静态/动态设定分离建议是否采纳——mock 已演示 state_event 时间线的形态
- [x] ~~待讨论问题 5：后端框架 Fastify vs Express~~ → **已拍板 Fastify**（2026-06-13）
- [ ] 待讨论问题 6：M1 编码损坏段（mojibake）处理策略——LLM 重写修复 vs 仅标记人工（默认保留不动）
- [ ] 待讨论问题 7：M1 作者求票/请假内容去留（默认保留，可做成清理选项）
- [ ] 基于 mock 试用反馈迭代页面交互；沉淀确认后的交互到各模块详细设计
- [ ] M2 设定提取详细设计（实体合并策略、卡片字段、增量抽取）
- [ ] M3 单角色推演详细设计（上下文组装器、排练界面交互）
- [ ] M4 章节生成详细设计（片段硬约束 prompt 方案）
- [ ] M5 管理与一致性详细设计（状态时间线、检查规则）
- [x] ~~设计定稿评审 → 解除"后端不编码"约束，进入实现阶段~~ → **已解除**（2026-06-13，用户拍板从 M1/设置页切入正式开发）

### 待办（实现阶段，设计定稿后启动）

- [~] P0 基础设施：**Provider 抽象层 + 配置界面（设置页真实测试）已落地**（`server/src/llmClient.ts`）；
      后端骨架（Fastify）已建；**业务数据 SQLite 资产库已落地**（`server/src/store/db.ts`，可配置资产目录，文档式 9 表）；
      向量检索（embedding 表 / sqlite-vec）待 M2 真实化时接入
- [~] P1 = M1 文本预处理：**AI 路径（真实 LLM 流式）已落地并通过真实端点端到端验证**（规则路径已从 UI 移除）；
      编码检测/切分/审核入库沿用既有；切分 AI 兜底（`aiSplitChapter`）仍 mock、整本长任务队列/重试增强待后续
- [ ] P2 = M2 设定提取
- [ ] P3 = M3 单角色推演
- [ ] P4 = M4 章节生成
- [ ] P5 = M5 管理与一致性

## 交接备注（最近一次会话）

- **日期**：2026-06-20（第三十七次会话·**数值输入卡顿修复 + 调度器 per-node 重构 + 工作节点分进程显示 + 拒绝节点去重**）
- **本次起因**：用户反馈 4 个问题：① 所有数字输入框输入时有明显卡顿；② 工作节点合并显示（同节点多进程混为一条 20 章）；③ 任务分发非顺序（N1P2 接手 31~34,40~45 非连续）；④ 拒绝指定节点弹窗选项重复（每章一条而非每节点一条）。
- **本次完成**（4 项全部落地）：
  - **DebouncedInputNumber**（`Step3Clean.tsx`）：新建防抖输入组件——本地 state 即时显示，失焦才 `onCommit`。替换全部 9 个 InputNumber（3 批量 + N×3 每节点 + 2 范围）。根除每按键写 zustand store（per-node）/ 全组件重渲染（1099 行组件 diff）的 lag。
  - **调度器 per-node-per-slot 专用 worker**（`llm.ts`）：删 `pickCandidate`；新建 `workerLoopForNode(node, slot)` + `executeBatch(batch, node, workerId)`。worker 创建 round-robin：slot 0→N1#1,N2#1,N3#1; slot 1→N1#2,N2#2,N3#2（保证初始分配 N1P1→1-10, N2P1→11-20, ...）。worker 绑定节点、await 执行、全 batch 原子取队。per-node 下 avoid-set 检查移除（circuit breaker 自然处理重试）。全退出时 drain 队列判错。
  - **工作节点分进程显示**（`Step3Clean.tsx`）：`NodeSession` 加 `workerId`，以 workerId 为键独立展示每个进程。`chapterNode` ref 改 `Map<chapterId, workerId>`。显示「节点名 #1」「节点名 #2」。
  - **拒绝节点去重**（`Step4Review.tsx`）：`filter`/`map` with `seen` Set 经典 bug（filter 先执行→seen 恒空→全过）→ pre-compute `useMemo`+`Map` 去重；移除 `（N 章）` 后缀。
- **改动文件**（4 个）：
  - 前端：`frontend/src/services/real/llm.ts`（删 pickCandidate/executeTask/workerLoop/worker创建 → 新建 executeBatch/workerLoopForNode/round-robin创建/activeWorkers计数；onStart +workerId）、`frontend/src/pages/m1-import/Step3Clean.tsx`（新建 DebouncedInputNumber；替换全部 InputNumber；NodeSession 加 workerId/改键；trackAssign/trackComplete 按 workerId）、`frontend/src/pages/m1-import/Step4Review.tsx`（rejectNodeOptions useMemo+Map 去重）
  - 文档：`HANDOFF.md`
- **验证全过**：tsc 0 错误 / eslint 0 错误 0 警告 / vite build ✅（704ms）/ smoke(55) ✅ / smoke-batch(16) ✅（含熔断回归） / ruleclean-smoke(43) ✅ / parse-smoke(22) ✅
- **关键设计决策**：
  ① **per-node 模型**：每节点每并发槽一个专用 worker（await 执行，非 fire-and-forget）。优势：分布确定可预测、每进程可观测、全 batch 原子取队。代价：利用率略降（某节点慢时其他节点 worker 不接管）— 用户场景本地少量节点，可预测性优先。
  ② **avoid-set 在 per-node 下移除**：worker 绑定节点，若避让会导致同章永远不被该节点重试 → circuit breaker 无法触发。移除后 circuit breaker 自然工作（连续 3 次失败→禁用→其他节点 worker 接管）。
  ③ **DebouncedInputNumber key 机制**：用 `key={String(value)}` 同步外部值变更（父组件改值时重挂载重置本地 state），避免 useEffect+setState 的 lint 警告和 cascading renders。
- **下一步**：① 用户实机验证数字输入不卡顿、工作节点分进程显示、顺序分布；② 实机验证拒绝指定节点选项无重复；③（可选）per-node worker 支持运行时新增节点动态创建 worker

## 更新本文档的约定

1. **完成任务**：勾选对应 checklist 项；产生新任务则新增条目。
2. **会话结束前**：刷新"项目状态快照"与"交接备注"（日期、完成内容、下一步、阻塞项）。
3. **新决策产生**：同步写入 `CLAUDE.md` 已确认决策表与 `DESIGN.md` 对应章节，本文档只记进展不重复细节。
