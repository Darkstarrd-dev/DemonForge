# HANDOFF.md — novelhelper 交接备忘

**最后更新**：2026-06-27
**当前位置**：办公场所 A
**本轮主题**：**角色交流模块增强 + 布局修复**（复选添加 / 逐角色节点指定·编辑 / 场景设定 / 占满去圆角布局）；上一轮节点测试·文生图四项修复

> 📦 **历史明细已归档** → `docs/handoff_history.md`
> 本文件只保留「恢复工作所需的活内容」：进行中任务、模块清单、下一步、交接参考。
> 各轮工作的逐项实现细节、技术决策记录、详尽验证清单全部移入归档文件，按需查阅。

---

## 🆕 品牌重命名 DemonForge（2026-06-27，待提交）

将应用名 NovelHelper → **DemonForge**，并以 `ref/asset/Logo.png`（292×292）为新图标。
- **名称**：根 `package.json`（name `demonforge` / appId `com.demonforge.app` / productName `DemonForge`）、`frontend/index.html` title、`AppLayout` 侧栏品牌字 ×2、`server/package.json` name。
- **图标**：`scripts/gen-icons.mjs`（sharp 取自 server/node_modules）生成 `build/icon.ico`（6 尺寸 16~256，PNG 内嵌）+ `build/icon.png`（512）+ `frontend/public/favicon.png`（256）；`index.html` favicon 改引 png；`electron/main.ts` 给 BrowserWindow 加 `icon`（带 existsSync 守卫，生产 exe 图标由 electron-builder 内嵌）。
- **未动（有意）**：内部数据目录 `~/.novelhelper` 与环境变量 `NOVELHELPER_DATA_DIR`、进程检测串 `novelhelper`、仓库目录路径——改动会迁移既有用户数据/破坏路径匹配，与本任务无关。旧 `frontend/public/favicon.svg` 现已无引用（按规未删）。
- 验收：`npm run build:electron` 编译 0 报错；ico 校验 type=1/count=6。打包 exe 图标需 `npm run dist` 验证。

---

## 🆕 进行中：第二、三梯队重构（2026-06-27）

> 目标（用户 /goal）：A-7 + A-8 全部完成并测试通过、提交推送。
> 设计稿：`docs/quality/design-tier2-3-refactor.md`；追踪表：`docs/quality/logs/2026-06-27-audit-01.md` 第 5 节。

进度（详细记录见归档 §「第二、三梯队重构实施」）：

| 项 | 状态 | commit |
|---|---|---|
| A-5 统一 SSE 解析 | ✅ | `e8c0557` |
| A-6 CleanScheduler 类化 | ✅ | `5b41f8c`→`82e1728`（5 提交） |
| A-7 appStore 切片化 | ✅ | `0222a0d` / `3256bea` |
| A-8 组件拆分（settings） | ✅ | `a918edc` |
| A-8 node-test 浅拆 | ✅ | `d764b55` |
| A-8 node-test 深度拆分 | ✅ | `645c495` |
| A-9 服务层 mock 收口 | ✅ | `8bb288c` |
| **A-10 主题色收敛** | ✅ | `fbf6a48` |
| **A-11 生图 client 抽接口** | ⊘ won't-fix | — |
| A-12 fetch 猴补丁抽 apiFetch | ⊘ deferred | — |
| **A-13 M1 懒加载** | ✅ **待提交** | — |
| **A-14 server 抽 processKiller** | ✅ **待提交** | — |

**本轮 A-10 主题色收敛（已提交 `fbf6a48`）**：
- 甄别后只改真问题（audit 旧述「dark? 三元到处」已不符——主题切换早已改 CSS 变量+`[data-theme]`，三元零匹配；63 处颜色字面量 ~53 处合理不动）：
  - **ErrorBoundary**：① 文字 `rgba(0,0,0,.65/.45)`→`Typography.Text type=secondary`（深色可读）；② `location.assign('/')`→`location.hash='#/'`（修 HashRouter + Electron file:// 白屏）；+ 护网 `ErrorBoundary.test.tsx`（3 用例）。
  - **AppLayout**：9 处 `theme==='dark'?…:…` 颜色三元 → `index.css` 的 `--app-sider-bg/text/border`（light 默认 + `[data-theme=dark]` 覆盖，逐值等价、视觉不变），保留 Sider/Menu 的 antd `theme` prop。
- **A-11 与用户确认 won't-fix**：三套生图 client 协议本质不同 + 文件头标注「完全独立」有意设计，真重复仅 3 个工具函数（normalizeBase/authHeaders/stripImagePayload），强抽统一接口属过度抽象。
- 验收：`tsc -b` 0 + `vite build` 成功 + `vitest run` **55 绿**（52 旧 + 3 新）。
- ✅ **已提交并推送**：`fbf6a48`（main，7 文件：A-10 五件 + HANDOFF + handoff_history）。audit-01 与本表 A-10 SHA 已回填；并补回填 audit A-8 行（`645c495`）。那批 lint/消除 any 改动属另一批独立工作，已于本轮单独提交（见下「近期修复」）。

**本轮 A-12~A-14（audit 3.7 节遗漏项收口，待提交）**：
- 核对发现 3.7 节 3 条问题从未进追踪表，补做：**A-13** M1 懒加载（`main.tsx` 静态 import→`lazy`+`Suspense`，M1 拆独立 chunk 52.91 kB，主包 235→184 kB）；**A-14** 后端杀进程抽 `server/src/platform/processKiller.ts`（导出 `killProcessTree(root)`，index.ts 清理随之未用 import，纯提取行为不变）；**A-12** `window.fetch` 猴补丁→apiFetch 与用户确认 **deferred**（涉 42 处生产路径 fetch，全量替换风险/工程量与中低优先级不匹配，猴补丁功能正常）。
- 验收：前端 tsc 0 + vite build OK + vitest 55 绿；后端 tsc --noEmit 0。git 待用户手动。

### 下次对话起步建议
1. **质量审计 A-1~A-14 全部收口**（A-1~A-10/A-13/A-14 已做、A-11 won't-fix、A-12 deferred）。代码重构线告一段落。
2. **下一步建议投功能验证线**：优先级最高的是 **M2/M3 实测**（端到端 M0→M5 闭环，唯一未跑通的核心功能）；其次验证文生图三协议 / 节点测试各模块 / 全屏阅读（见下「立即任务」）。
3. **可选收尾**：node-test index 444→<300（抽 `MainArea`/context 减 props drilling），非必须。
4. **测试护网已就位**：改 node-test/ErrorBoundary 先跑 `npm --prefix frontend test` 回归（jsdom 冷启动 ~150s 属正常）。
5. **提交规范**：`type(scope): 描述（A-N）`，中文。
6. **环境注意**：Windows bash，工作目录漂移频繁——跑测试/构建用 `npm --prefix <绝对路径>/frontend test`（走本地 vitest，含 jsdom）；**勿用 `npx vitest`**（取 npx 缓存版找不到本地 jsdom）；git 用 `git -C <repo root>`；提交只 `git add` 本次改动，勿带 `.claude/settings.local.json` 与 `ref/asset/`。

---

## 质量审计体系（2026-06-27 建立）

- `docs/quality/TEMPLATE.md`：审计报告模板。每次审核复制到 `logs/` 按 `YYYY-MM-DD-audit-NN.md` 命名。
- `docs/quality/logs/2026-06-27-audit-01.md`：首次全量审计 + 整改追踪表（A-1~A-11）。
- 第一梯队 A-1~A-4 已完成（删死文件 / 修 UTC 日期 bug / vitest 地基 / 首批单测）。详见归档。

---

## 当前进度总览

### ✅ 已完成模块（详细子项见归档）

- [x] **M0 立项·架构**（arch/blueprint + SSE 流式 + Context Assembler + 空输入自动生成）
- [x] **M1 文本清理**（四步骤全流程 + 批量清理调度器 + 章节名模板替换 + 任务态跨页面 + 自动重试）
- [x] **M2 设定提取**（extractEntities 接真实 LLM，串行防限流；待实测）
- [x] **M3 角色推演**（simulateCharacter 接真实 LLM，双候选流式；待实测）
- [x] **M4 章节生成**（draft SSE + Context Assembler + 实时流式）
- [x] **M5 章节管理**（finalize/consistency SSE）
- [x] **批量生产**（startBatchGenerate 调度器 + UI 面板）
- [x] **RAG 检索**（Node + sqlite-vec）
- [x] **Context Assembler**（6 组件，M3/M4/M5 共用）
- [x] **Electron 迁移**（主进程管理、打包配置、数据目录策略）
- [x] **节点测试**（完整重构 + 聊天界面 + System Instructions + 对话记录 + Debug Info + Reasoning + 气泡功能扩展 + 对比模式 + 多 Session 并行）
- [x] **文生图三协议**（ModelScope 异步 / GPT Image 同步 / xAI Imagine 同步；设置页协议选择器）
- [x] **M2 设定卡片三项增强**（手动新增 / AI 生成 / 卡片图片批量生图队列）
- [x] **角色交流模块**（阶段 A-E：本地 + Opencode 双模式 + 自动循环 + 导出；**2026-06-27 增强**：复选添加多角色 + 逐角色节点指定/编辑 + 场景设定（手动/AI 生成注入 System Prompt）+ 布局占满去圆角）
- [x] **沉浸式阅读器**（全屏阅读 + 查找替换 + 单章 AI 清理 + 书签 + 字体/自动播放/翻页）
- [x] **图片辅助模块**（GIF/ZIP/Sprite 导出 + 图层编辑 + 全局裁剪）
- [x] **前端主题系统 + 响应式布局**（浅/深双主题，13 页覆盖）
- [x] **4K 基准缩放**（捕获基准 + 主进程计算，根除闪烁）
- [x] **2D 环境 Demo**（Phaser + Matter.js 物理沙盒 + 人物状态占位）
- [x] **data-slot 体系**（11 页，150+ 属性，规范文档齐全）
- [x] **编译打包**（NSIS 安装包 + 便携版；file:// 协议修复）
- [x] **M1 文本导入合并到书库概览**（新建/清理双模式）

### 🔧 近期修复（2026-06-27）

- [x] **节点测试 · Debug 面板撑高/无滚动修复（2 项）**：右栏列（`node-test/index.tsx`）与 `NodeTestSidebar` 根 div 一直缺高度约束，三视图（`DebugInfoPanel`/`SystemPromptEditor` 的 `height:100%`、`ParamsPanel` 的 `flex:1`）退化为内容高度 → ①Debug 展开后内容撑高 flex 行，经外层 `align-items:stretch` 连累左侧主列被拉伸（prompt 区下方大片空白）；②`overflowY:auto` 因祖先无确定高度永不触发（面板不可滚动）。修复：右栏列加 `minHeight:0`（锁为容器高度、不被内容撑大）+ `NodeTestSidebar` 根加 `flex:1,minHeight:0`（填满父列并使内部滚动生效）+ `DebugInfoPanel` Body 加 `className="hide-scrollbar"`（可滚不显条，复用 `index.css` 全局 class）。改 3 文件。验收：`eslint .` 本模块 0 error + `vitest` 55 绿（node-test 3 绿）。
- [x] **M2 设定卡片 7 项增强（本轮）**：①手动/AI 新增归属增「素材库（不归属任何书）」选项（哨兵 `bookId=''`，KV 存储零改造）；②编辑卡片可切换归属；③全部图片容器 `cover`→`contain`（不裁剪）；④批量生图加参考图选择（相册勾选+本地上传→透传三协议 `imageInputs`，角色一致化）；⑤详情简介左侧 1:1 主图容器（引入 `coverImageId`，相册可「设为主图」）；⑥AI 生成改 SSE 流式（后端新增 `/api/llm/generate-card-stream`），CardEditorModal 三栏布局（左复用 `DebugInfoPanel` / 中表单 / 右流式输出）；⑦AI 生成加停止按钮（AbortController）。改 8 文件（`services/types` + `m2-cards/{CardEditorModal,index,ImageBatchModal}` + `services/real/{cardGen,cardImage}` + `services/api` + `server routes/creation`）。验收：前端 build ✓ + 后端 tsc ✓ + vitest 55 绿。**待端到端实测**（流式/停止/参考图一致化）。
- [x] **角色交流模块增强 + 布局修复（6 项，本轮）**：① 本地模式添加参与者单选→复选（一次加多角色）；② 弹窗每行右侧独立节点选择器；③ 已添加列表下方显示节点名（替代"本地节点"）；④ 列表行 Popover 编辑推理节点；⑤ 新增「场景设定」弹窗（手动输入 + AI 流式生成，复用 `streamChat`），背景注入各角色 System Prompt（后端 `/api/chat/role` 加 `sceneSetting`；Opencode 模式拼 prompt 前缀）；⑥ 根布局 `<Space>`→div flex 链占满、去 Card 圆角/间距（修"下方大片留白"根因：Space 给子项套的 `.ant-space-item` 无 `flex:1`，主内容区 `flex:1` 失效坍缩）。改 6 文件（`role-chat/index` + `AddParticipantModal` + `ParticipantList` + 新增 `SceneSettingModal` + `services/real/roleChat` + `server/routes/chat`），配置维持页面临时态不持久化。验收：前端 tsc+vite build ✓、后端 tsc ✓、lint 本模块 0/0。
- [x] **节点测试 · 文生图四项修复**（上一轮）：
  - **图片生成成功但 app 不显示（主 bug）**：后端早前重构 `imageArchive.ts` 后，`done` 事件回传的 `image` 从 base64 data URL 改为归档文件 URL（`/api/image/file/<name>`），但前端 `ImageGallery.tsx` 渲染门控仍按 `startsWith('data:image')` 判断 → 文件 URL 落入「错误气泡」分支。修复：门控同时识别 `data:image` 与 `/api/image/file/` 两种形态；`utils/imageResult.ts` 的 `parseImageMeta` 对文件 URL 从扩展名取 format（原正则只认 data URL）。ModelScope 协议同样受益（其 done 早已是文件 URL）。
  - **GPT 取图慢（b64 传输瓶颈）**：`server/src/gptImageClient.ts` 取图优先级对调——先 `imageData.url` 下载二进制，`b64_json` 兜底，避开 MB 级 base64 塞在 JSON 里的传输/解析；归档逻辑不变。
  - **生成耗时显示**：新增 `genMs?` 字段贯穿 `services/types.ts`(ChatSessionMessage) + `node-test/types.ts`(ChatMessage)；`sessionEngine.ts` 的 `onDoneImage` 用 `rt.startedAt` 算端到端耗时写入消息；`ResultImage.tsx` 图片下方显示「生成耗时 X.Xs」。
  - **prompt 框左下角节点名**：`ChatComposer.tsx` textarea 外包相对容器，左下角放低透明度、`pointerEvents:none` 的 `selectedNode.name` 标签。
  - **附带修复**：`useInferenceSession.ts` 的 `syncSessionMessages` 编辑/删除消息时原会丢 `revisedPrompt`/`genMs`，一并补上字段透传。
  - 验收：前端 `tsc --noEmit` 0 + 后端 `tsc --noEmit` 0 + `node-test/index.test.tsx` 3 绿。
- [x] **对话记录删除"重启复活"根因修复**：`@fastify/cors` 默认 methods 不含 DELETE → Electron 跨域预检拦截 DELETE。修复 4 处（CORS methods 显式列 DELETE + keepalive + pushDeleteNow 不静默吞错 + origin 函数式白名单放行 file://）。✅ 已实证。
- [x] **书库概览导入文件模式竞态修复**：DELETE/GET 并发无序 + 恢复 useEffect 无条件覆盖。方案 A（navigate state.fresh 区分意图 + guard）。✅ 已测试。
- [x] **既存 TS 错误清零**：m2-cards stage 旧枚举 + appStore enqueueWrite 返回类型。✅ tsc EXIT 0。
- [x] **前端 lint 清零**（`eslint-plugin-react-hooks@7` 升级后新增 react-compiler 规则集）：92 error + 7 warning → **0/0**，跨 23 文件。机械类正确修复——39 `no-explicit-any` 按真实形态补类型（`Pick<ChatParams>` / `AppState['setState']` / `ReturnType<typeof theme.useToken>` / `TableColumnsType` / `ChatPart` 联合 / `ModuleRow` / settings 恢复函数收敛为一个 `legacy` 视图；仅 Phaser Matter 因类型定义缺失保留 `any`+注释禁用）；7 `preserve-caught-error` 补 `{ cause }`；25 `no-irregular-whitespace` 实为 `m1TestText` 样本的中文全角空格缩进（有意数据，块级 disable 圈住未改）；prefer-const / no-unused / react-refresh 直接修。react-compiler 严格规则（set-state-in-effect / purity / immutability / refs）**务实混合**：2 处真修（流式气泡 `Date.now`→`startedAt`、effect 补稳定 dep），其余画布重绘 / prop 变化复位 / 事件处理器生成 id 加注释 `eslint-disable` 并写明理由。验收 `eslint .` 0 + `tsc -b` 0 + `vitest` **55 绿**。

### 🚧 待完善

- [ ] **M2/M3 实际测试**：配置模块节点映射 → 提取 3-5 章验证 EntityCard/合并候选 → 创建场景推演 → 端到端 M0→M5。
- [ ] **打包后首次启动**：`~/.novelhelper/` 无 settings.json，需手动配置 Provider 节点。

---

## 立即任务（下次会话）

> 完整逐项验证清单见归档 §「下一步任务」。以下为优先级摘要：

1. **验证文生图三协议**（设置页协议选择器三选项；节点测试右侧面板按协议切换字段；文生图 + 图生图 + Debug Info b64 剥离）。
   - xAI 测试端点 `https://maoyulin.xyz/`，模型 `grok-imagine-image-lite`。
   - GPT 测试端点 `https://jiuuij.de5.net/`，模型 `gpt-image-2`。
2. **验证节点测试各模块**（气泡功能 / 对话记录 / Debug Info / System Instructions / 对比模式 / GPT 10 项增强）。
3. **验证全屏阅读**（查找替换 / 单章 AI 清理 / 回归原有功能）。
4. **M2/M3 实测**（优先级高，端到端闭环验证）。

---

## 交接参考

### 环境与启动
- **开发**：`npm run dev` 或 `start-electron.bat`（Electron 窗口，自动清理）。
- **传统**：`start.vbs`（Chrome 应用模式，旧方式）。
- **打包**：`build-electron.bat`（6 步：构建→组装→`electron-builder --prepackaged`→清理）。
  - 镜像：`ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` 指 `npmmirror.com`。
  - 已知：`npm run dist` 直调会因 `app-builder.exe` 被 Windows Defender 锁失败。
- **数据目录**：开发 `server/src/data/`；生产 `~/.novelhelper/`。

### 关键文件路径
- 前端服务层：`frontend/src/services/api.ts` → `mock/` / `real/`；统一 SSE 解析 `services/sse.ts`；清理调度器 `services/cleanScheduler.ts`；多 Session 引擎 `services/sessionEngine.ts`。
- 状态：`frontend/src/store/appStore.ts`（90 行组合根 + `slices/` 6 切片 + `persistence.ts` + `bootstrap.ts` + `types.ts`）。
- 节点测试：`pages/node-test/`（index 444 行 + 7 组件 + `hooks/` 2 hook + `panels/ParamsPanel` + `constants.ts`）。
- 设置页：`pages/settings/index.tsx` + `panels/`（4 Tab 组件）。
- 阅读器：`pages/book-reader/ImmersiveReader.tsx` + `.css`。
- 后端：`server/src/` — `llmClient.ts`（含 embed）/ `imageClient.ts`(ModelScope) / `gptImageClient.ts` / `xaiImageClient.ts` / `prompts.ts` / `contextAssembler.ts` / `store/{db,vector}.ts`；路由 `routes/{creation,image,gptImage,xaiImage,chat,llm}.ts`。

### 数据兼容性
- 旧 `imageGallery`→`testHistory`；`imageDemoForm`→`nodeTestForm`；表 `image_gallery`→`test_history`（向后兼容）。
- Provider/设置存 `server/src/data/settings.json`；业务数据持久化到后端 SQLite。
- image 节点无 `protocol` 字段自动默认 `modelscope`。

### 各页使用要点
- **节点测试**：设置页配节点（文本勾「多模态」/ 图片勾「图片编辑」，xAI/GPT 协议硬编码图片编辑 true）→ Segmented 切模式 → 选节点 → 输入。
- **角色交流**：切模式（本地/Opencode）→ 添加参与者 → 发送 → 自动循环面板 → 导出（JSON/TXT）。
- **主题/4K 缩放**：设置 → 通用设置 / 界面设置。4K 缩放建议主用 4K 屏，1080P 及以下关闭。

---

## 工作方式提醒

- 会话开始先读本文件 + 按需查 `docs/handoff_history.md`。
- **每完成一项任务更新本文件**；会话结束前刷新状态快照与交接备注。
- git 同步由用户手动执行，**Claude 不执行 git 操作**。
- 设计先行（DESIGN.md）、不做无依据假设、简洁优先、AI 辅助而非代笔。
