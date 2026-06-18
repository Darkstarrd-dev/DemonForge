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

## 项目状态快照

- **最后更新**：2026-06-18（第二十二次会话·**修复 start-electron.bat 启动报错**）
- **阶段**：正式开发——M1 AI 清理端到端跑通；**novel-generator 集成阶段 A~D 全部完成**；**Electron 迁移完成**；M2–M5 仍 mock；业务数据 SQLite 资产库（可配置资产目录），Provider/密钥等设置存用户数据目录
- **新增**：全局 Error Boundary（`components/ErrorBoundary.tsx`）兜住子树异常防止白屏；3D Demo animate 循环异常安全修复（init 单例化 + try/catch + 时序修正）；Electron 主进程控制台日志改纯英文避免 Windows GBK 乱码；**`start-electron.bat`/`start.bat` 注释改纯 ASCII + CRLF（消除 CMD 启动报错）**
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

- **日期**：2026-06-18（第二十二次会话·**修复 start-electron.bat 启动报错**）
- **本次完成**：
  ① **修复 `start-electron.bat` / `start.bat` 启动报错**：根因是 bat 文件以 UTF-8+LF 保存且开头带中文 `rem` 注释，CMD 用 GBK 解码导致注释乱码错位、`chcp 65001 > nul` 被拼进乱码当命令执行；修复为纯英文注释 + CRLF 换行（`chcp 65001` 保留用于后续 Node/Electron UTF-8 输出）
  ② **验证**：`file` 报告 ASCII + CRLF ✅；全文非 ASCII 字节扫描通过 ✅
  ③ **更新 HANDOFF.md**：记录根因与修复，新增"bat 文件须保持纯 ASCII"提醒
- **已知限制**：
  ① `[Frontend]` 日志中的 Vite 彩色箭头 `➜`（U+279C）在 GBK 控制台仍会截断乱码——这是 Vite 自身的 chalk 输出，需 `FORCE_COLOR=0` 才能彻底消除，当前未加
  ② **bat 文件必须保持纯 ASCII**：编辑器若把 `.bat` 存成 UTF-8 + 中文注释，双击运行时 CMD 用 GBK 解码会破坏脚本（本次踩坑）。今后编辑 `.bat` 务必英文注释 + CRLF
- **下一步**：
  ① 实机验证 `start-electron.bat` 启动不再报 `'-8'`/乱码错误，Electron 正常拉起
  ② 实机验证 3D Demo 正常运行 + 复位 + 路由切换不再白屏
  ③ 验证 M1 清理流程 + M0 立项流程

## 更新本文档的约定

1. **完成任务**：勾选对应 checklist 项；产生新任务则新增条目。
2. **会话结束前**：刷新"项目状态快照"与"交接备注"（日期、完成内容、下一步、阻塞项）。
3. **新决策产生**：同步写入 `CLAUDE.md` 已确认决策表与 `DESIGN.md` 对应章节，本文档只记进展不重复细节。
