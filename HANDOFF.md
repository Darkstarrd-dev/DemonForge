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
    ④ **【最新】问题1 入库持久化根因修复**——真正根因是**数据目录在代码版本间漂移导致 db 文件分裂**（初始版写项目根 `assets/`、Electron 迁移后写 `server/src/data/`，且 tsx-src 与 node-dist 解析到不同子目录）。已用 `NOVELHELPER_DATA_DIR` 环境变量作单一真相源、清理散落 db、重建 dist，端到端验证（入库→终止后端→重启→数据完整存活）通过。

## 项目状态快照

- **最后更新**：2026-06-19（第二十九次会话·**问题1 入库持久化根因修复 + 数据目录单一真相源**）
- **阶段**：正式开发——M1 AI 清理端到端跑通；**novel-generator 集成阶段 A~D 全部完成**；**Electron 迁移完成**；M2–M5 仍 mock；业务数据 SQLite 资产库（可配置资产目录），Provider/密钥等设置存用户数据目录
- **新增**：M1 Step2 章节分割由「纯手选模式」升级为「**进入页自动检测推荐 + 手选/正则兜底**」——`detectChapterPattern` 逐行扫描每个模式按命中数评分（MIN_HITS=2，卷模式仅在无章类命中时兜底），进入 Step2 即 lazy 初始化推荐模式 + 抽样标题提示（绿/黄按 confidence）；标题前装饰符号（`[爱心]`/`★`/`【】`等成对包裹块 + 散落符号）自动 `stripDecor` 剥除再匹配；**卷结构单独成章**（内置 `VOLUME_REGEX` 旁路识别，标记 `isVolume`，Step3 `skipClean` 跳过 LLM 原样保留）；**句末标点护栏扩展中文闭引号**（`\u201D` / `\u2019`，修复对话 `～"第2章` 粘连场景）；**预览光标人工拆分**（展开章节文本可定位光标，一键把光标后内容拆为新章，补偿自动切分遗漏）；检测模式池存 `settings.json`，设置页新增「章节检测模式池」Card 可增删改（内置 8 模式：第X章/回/卷/节、X章无「第」字、Chapter N 带 `i` flag、数字+顿号、custom）；`SplitPattern` 类型加 `flags?`/`builtin?`，`ImportChapter` 加 `skipClean?`
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

- [x] **问题1 入库持久化根因修复 + 数据目录单一真相源**（2026-06-19 第二十九次会话·**端到端验证通过**）
  - [x] **真正根因（终于定位）**：前几轮 `pushStoreNow` async 加固只动了"写入时机"，**没动到病根**。真根因是**数据目录在代码版本间漂移 → db 文件分裂散落**：① SQLite 初版（`3cf6618`）用 `REPO_ROOT = dirname×3(HERE)` 把库写到**项目根 `assets/`**；② Electron 迁移（`34405c3`）改 `paths.ts: join(__dirname,'..','data')` → tsx 跑 src 解析到 `server/src/data/`、node 跑 dist 解析到 `server/dist/data/`。**三个不同位置的 db 互相看不到对方数据**——入库写一处、重启读另一处 → 入库内容消失；某次后端解析到根目录（无 settings.json → `storeInitialized` 缺失 + 库空）→ bootstrap 走播种分支 → Mock 重现。
  - [x] **取证实证**（运行中后端实时探测）：POST 标记 `PROBE_*` 到 `/api/settings`，回查落点确认后端用 `server/src/data`；全表 dump 三个 db（根目录旧库全空/旧表结构无 `image_gallery`、`server/src/data` 含诊断脚本污染的 `test-node-book` 且 chapters=0、`server/dist/data` 不存在）；git 历史 confirm 路径逻辑演变。
  - [x] **修复·单一真相源**：① `electron/main.ts` spawn 后端时传 `NOVELHELPER_DATA_DIR`（dev=`ROOT/server/src/data`，prod=`~/.novelhelper`）+ import `homedir`；② `server/src/utils/paths.ts:getAppDataDir()` 优先读该环境变量（回退逻辑保留向后兼容）；③ `server/src/index.ts` 启动即打印 `[data-dir] settings/json at:` + `asset db dir:` 便于诊断。
  - [x] **清理**（全部确认无用户珍贵数据后删）：根目录 `assets/`（历史遗留空旧库 + 空 images）、`server/src/data/assets/novelhelper.db*`（诊断污染的 test-node-book + WAL）；**保留 `server/src/data/settings.json`** 用户 providers/API keys/moduleMapping 配置，仅清空 `currentBookId`（指向已删幽灵书）+ 删探测残留 `__probe`，`storeInitialized:true` 保持（空库不回填 Mock）。
  - [x] **重建编译**：`server/build`(tsc) ✅ + `build:electron`(dist-electron/main.js) ✅，验证新 dist 含 `imageRoutes`/`image_gallery` 表/`NOVELHELPER_DATA_DIR` 逻辑。
  - [x] **端到端验证（tsx src 模拟 Electron dev）**：传 `NOVELHELPER_DATA_DIR=server/src/data` 启动 → 入库（books=1/chapters=2 含中文）→ PowerShell 终止后端 → 同环境变量重启 → `GET /api/store` **books=1 chapters=2 完整存活**（含中文标题「第一章 开端/第二章 发展」）。启动日志确认数据目录锚定 `server/src/data`。测试数据已清，db 留空供 Electron 启动重建。
  - [ ] **待用户实机验证**：重启 `start-electron.bat` → M1 入库一本真书 → 完全退出 Electron 再进 → 确认入库内容仍在、书库无 Mock 演示书重现。
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

- **日期**：2026-06-19（第二十九次会话·**问题1 入库持久化根因修复 + 数据目录单一真相源**）
- **本次完成**（用户反馈：硬刷新后问题1仍复现）：
  - **彻底定位真根因**（前几轮的 `pushStoreNow` async 加固没动到病根）：**数据目录在代码版本间漂移 → db 文件分裂散落**。SQLite 初版（`3cf6618`）用 `REPO_ROOT=dirname×3(HERE)` 写到**项目根 `assets/`**；Electron 迁移（`34405c3`）改 `paths.ts: join(__dirname,'..','data')`，而 `import.meta.url` 在 tsx(跑 src) 解析到 `server/src/data/`、在 node(跑 dist) 解析到 `server/dist/data/`——**三个不同位置的 db 互相看不到对方数据**。入库写一处、重启读另一处 → 入库内容消失；某次解析到根目录（无 settings.json → `storeInitialized` 缺失 + 库空）→ bootstrap 走播种分支 → Mock 演示书重现。**取证实证**：运行中后端 POST 标记 `PROBE_*` 探测落点 + 全表 dump 三个 db + git 历史对照。
  - **修复·单一真相源**：① `electron/main.ts:startBackend` spawn 时传 `NOVELHELPER_DATA_DIR`（dev=`ROOT/server/src/data`、prod=`~/.novelhelper`）+ import `homedir`；② `paths.ts:getAppDataDir()` 优先读该环境变量（回退逻辑保留向后兼容，覆盖非 Electron 直跑）；③ `index.ts` 启动即 log `[data-dir] settings/json at:` + `asset db dir:` 便于日后排查。
  - **清理散落 db**（全部确认无用户珍贵数据后删）：根目录 `assets/`（历史遗留空旧库 + 空 images）、`server/src/data/assets/novelhelper.db*`（诊断脚本污染的 `test-node-book` + WAL）。**保留 `server/src/data/settings.json`** 用户 providers/API keys/moduleMapping 配置，仅清空 `currentBookId`（指向已删幽灵书）+ 删探测残留 `__probe`，`storeInitialized:true` 保持（空库不回填 Mock）。
  - **重建编译**：`server/build`(tsc) ✅ + `build:electron`(dist-electron) ✅，验证新 dist 含 `imageRoutes` / `image_gallery` 表 / `NOVELHELPER_DATA_DIR` 逻辑。
  - **端到端验证通过**（tsx src 模拟 Electron dev）：传 `NOVELHELPER_DATA_DIR=server/src/data` 启动 → 入库 books=1/chapters=2（含中文标题）→ PowerShell 终止后端 → 同环境变量重启 → `GET /api/store` **books=1 chapters=2 完整存活**。测试数据已清。
- **验证全过**：后端 build(tsc) ✅ / build:electron(dist-electron) ✅ / 端到端入库→重启→存活 ✅（启动日志确认数据目录锚定 `server/src/data`）
- **已知限制/注意**：
  ① **前几轮诊断脚本的教训**：上轮"端到端诊断脚本"直接连后端**真实 db** 写入 `test-node-book`（没隔离），污染了 `server/src/data` 库——本次已清。**今后诊断持久化必须用隔离的临时 db 或 mock fetch**，绝不可连生产库。
  ② **dist import 缺 `.js` 扩展名隐患**（本次发现，**未修**——影响打包版，开发模式 tsx src 不受影响）：`server/tsconfig.json` 用 `moduleResolution: "bundler"`（`34405c3` 引入），tsc 不重写 import 扩展名 → `node dist/index.js` 报 `ERR_MODULE_NOT_FOUND`（如 `Cannot find module .../routes/llm`）。**留待打包分发阶段处理**（候选方案：TS 5.7 `rewriteRelativeImportExtensions` + import 带 `.ts`；或生产模式后端改用 tsx 跑 src；或 esbuild 打包 dist）。**用户当前开发模式无此问题**。
  ③ **数据目录现已单一锚定**（`server/src/data`）：任何持久化异常排查第一步——看后端启动日志的 `[data-dir]` 两行确认实际落点。
- **下一步**：
  ① **用户实机验证（核心）**：重启 `start-electron.bat` → M1 入库一本真书 → **完全退出 Electron 再进** → 确认入库内容仍在、书库无 Mock 演示书重现
  ② 仍待实机验证（历史项）：问题3 拆分后自动检测标题、文生图 Demo 端到端、书库删除流程、M0 立项不再误报
  ③（后续）打包分发前修复 dist import 扩展名（见已知限制 ②）

## 更新本文档的约定

1. **完成任务**：勾选对应 checklist 项；产生新任务则新增条目。
2. **会话结束前**：刷新"项目状态快照"与"交接备注"（日期、完成内容、下一步、阻塞项）。
3. **新决策产生**：同步写入 `CLAUDE.md` 已确认决策表与 `DESIGN.md` 对应章节，本文档只记进展不重复细节。
