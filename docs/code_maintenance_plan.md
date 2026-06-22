# 代码维护拆分计划

> 生成时间：2026-06-22  
> 基于编译警告：`build.chunkSizeWarningLimit` 提示  
> 目标：模块化拆分，降低编译产物体积，提升可维护性

---

## 一、当前代码量统计

### 1.1 总览

| 层级 | 代码量 | 占比 |
|------|--------|------|
| **页面层** (pages/) | 12,654 行 | 66.9% |
| **服务层** (services/) | 2,567 行 | 13.6% |
| **工具层** (utils/) | 1,847 行 | 9.8% |
| **状态管理** (store/) | 942 行 | 5.0% |
| **组件层** (components/ + layouts/) | 351 行 | 1.9% |
| **类型定义** (types/) | 379 行 | 2.0% |
| **模拟层** (mocks/) | 170 行 | 0.9% |
| **总计** | **18,910 行** | 100% |

---

### 1.2 页面层详细（业务模块）

| 模块 | 代码量 | 主要文件 | 说明 |
|------|--------|----------|------|
| **m1-import** | 2,857 行 | Step3Clean(1217) + Step4Review(650) + Step2Split(577) | M1 文本清洗切分流程 |
| **settings** | 1,820 行 | index.tsx | 全局设置页（Provider/模型配置） |
| **image-helper** | 1,856 行 | index(702) + LayerEditor(467) + GlobalCropPanel(430) | 图片辅助工具 |
| **node-test** | 1,379 行 | index.tsx | LLM 节点测试页 |
| **role-chat** | 1,311 行 | index(657) + AddParticipantModal(300) | 角色对话模块 |
| **m0-architecture** | 635 行 | index.tsx | M0 立项架构页 |
| **m2-cards** | 500 行 | index.tsx | M2 设定卡片库 |
| **m3-simulate** | 409 行 | index.tsx | M3 单角色推演 |
| **m5-chapters** | 381 行 | index.tsx | M5 章节管理 |
| **batch-generate** | 328 行 | index.tsx | 批量生产面板 |
| **m4-generate** | 257 行 | index.tsx | M4 章节生成 |
| **home** | 241 行 | index.tsx | 首页导航 |
| **book-reader** | 223 行 | index.tsx | 阅读器 |
| **demo-3d** | 290 行 | index.tsx | 3D 演示（物理引擎） |
| **demo-2d** | 未统计 | index.tsx | 2D Canvas 演示 |

---

### 1.3 服务层详细（API 交互）

| 模块 | 代码量 | 职责 |
|------|--------|------|
| **llm.ts** | 747 行 | LLM 核心交互层（SSE 流式、通用请求） |
| **batch.ts** | 265 行 | 批量生产调度器 |
| **roleChat.ts** | 142 行 | 角色对话服务 |
| **extract.ts** | 119 行 | M2 设定提取 |
| **generation.ts** | 110 行 | M4 章节生成 |
| **simulate.ts** | 108 行 | M3 推演 |
| **creation.ts** | 100 行 | M0 起源（arch/blueprint） |
| **image.ts** | 87 行 | 图片服务（本地/托管） |
| **chat.ts** | 113 行 | 通用对话服务 |
| **types.ts** | 379 行 | 全局类型定义 |
| **api.ts** | 54 行 | API 入口封装 |
| **imageHost.ts** | 71 行 | 图片托管服务 |
| **mock/impl.ts** | 272 行 | Mock 实现层 |

---

### 1.4 工具层详细

| 工具模块 | 代码量 | 职责 |
|----------|--------|------|
| **ruleClean.ts** | 672 行 | M1 规则清洗引擎（广告检测、格式修正） |
| **split.ts** | 501 行 | M1 章节切分逻辑（正则匹配、标题替换） |
| **backup.ts** | 373 行 | 备份还原机制 |
| **alignedDiff.ts** | 128 行 | 行级 diff 算法 |
| **encoding.ts** | 71 行 | 编码检测 |
| **mockStream.ts** | 40 行 | Mock SSE 流模拟 |
| **tokenEstimate.ts** | 34 行 | Token 估算 |
| **provider.ts** | 28 行 | Provider 工具函数 |

---

### 1.5 编译产物分析

| 文件 | 大小 | 占比 | 内容推测 |
|------|------|------|----------|
| **demo-3d-xxx.js** | 2.7 MB | 47.4% | Rapier 3D 物理引擎 + Three.js |
| **index-xxx.js** | 1.8 MB | 31.6% | 主应用代码（React + 业务逻辑） |
| **demo-2d-xxx.js** | 1.3 MB | 22.8% | 2D Canvas 演示代码 |
| **index-xxx.css** | 8 KB | 0.1% | 样式 |
| **总计** | **5.7 MB** | 100% | - |

**关键问题**：
1. **demo-3d** 和 **demo-2d** 是演示性质模块，但被打入主包（2.7 MB + 1.3 MB = 4 MB）
2. 主包 `index.js` 1.8 MB 超过 Vite 默认警告阈值（500 KB）

---

## 二、拆分优先级与策略

### 2.1 【P0 紧急】编译产物体积优化

#### 目标
- 主包体积降至 < 1 MB
- 演示模块懒加载
- 分离重型依赖库

#### 具体措施

| 操作 | 方法 | 预期效果 |
|------|------|----------|
| **1. demo-3d 懒加载** | 路由级 lazy() + Suspense，移除顶层 import | -2.7 MB |
| **2. demo-2d 懒加载** | 同上 | -1.3 MB |
| **3. 图片编辑器懒加载** | image-helper 模块按需加载 | -200 KB（估算） |
| **4. node-test 懒加载** | 测试页按需加载 | -100 KB（估算） |
| **5. 三方库分离** | manualChunks 配置：antd/react/rapier/three | 优化缓存命中率 |

**实施检查点**：
```bash
# 验证步骤
npm run build
ls -lh dist/assets/*.js
# 预期：主包 < 1 MB，demo-3d/demo-2d 独立 chunk
```

---

### 2.2 【P1 重要】页面层模块化

#### 问题
- **m1-import** 2,857 行分散在 4 个文件（Step1-4），但 Step3 单文件 1,217 行
- **settings** 单文件 1,820 行，包含 Provider/模型/UI/备份等多个子模块

#### 拆分方案

##### 2.2.1 settings 页拆分（1,820 → ~600/子模块）

| 拆分目标 | 预期文件 | 预估代码量 |
|----------|----------|------------|
| **ProviderPanel** | `settings/ProviderPanel.tsx` | ~500 行 |
| **ModelConfigPanel** | `settings/ModelConfigPanel.tsx` | ~400 行 |
| **UISettingsPanel** | `settings/UISettingsPanel.tsx` | ~300 行 |
| **BackupPanel** | `settings/BackupPanel.tsx` | ~300 行 |
| **M1SettingsPanel** | `settings/M1SettingsPanel.tsx` | ~200 行 |
| **主容器** | `settings/index.tsx` | ~120 行（Tabs 容器） |

##### 2.2.2 m1-import Step3Clean 拆分（1,217 → ~300/子模块）

| 拆分目标 | 预期文件 | 预估代码量 |
|----------|----------|------------|
| **CleanControlPanel** | `m1-import/clean/ControlPanel.tsx` | ~300 行（进度/节点控制） |
| **NodeStatusTable** | `m1-import/clean/NodeStatusTable.tsx` | ~200 行 |
| **LogViewer** | `m1-import/clean/LogViewer.tsx` | ~250 行 |
| **CleanSettings** | `m1-import/clean/SettingsDrawer.tsx` | ~200 行 |
| **主容器** | `m1-import/Step3Clean.tsx` | ~267 行（布局 + 业务逻辑） |

##### 2.2.3 image-helper 拆分（1,856 → ~400/子模块）

| 拆分目标 | 预期文件 | 预估代码量 |
|----------|----------|------------|
| **LayerEditor** | `image-helper/LayerEditor.tsx` | 467 行（已独立） |
| **GlobalCropPanel** | `image-helper/GlobalCropPanel.tsx` | 430 行（已独立） |
| **ImageCanvas** | `image-helper/ImageCanvas.tsx` | ~300 行（从 index 抽出） |
| **ToolPanel** | `image-helper/ToolPanel.tsx` | ~200 行 |
| **主容器** | `image-helper/index.tsx` | ~459 行（保留核心逻辑） |

---

### 2.3 【P2 优化】服务层重构

#### 问题
- **llm.ts** 747 行，混合了 SSE 流处理、通用请求、错误重试、Provider 抽象
- 各业务服务（extract/simulate/generation）复用度低，存在重复逻辑

#### 拆分方案

##### 2.3.1 llm.ts 拆分（747 → ~200/子模块）

| 拆分目标 | 预期文件 | 预估代码量 |
|----------|----------|------------|
| **SSE 流处理** | `real/llm/streaming.ts` | ~250 行 |
| **通用请求封装** | `real/llm/request.ts` | ~200 行 |
| **错误重试机制** | `real/llm/retry.ts` | ~150 行 |
| **Provider 工具** | `real/llm/provider.ts` | ~100 行 |
| **主入口** | `real/llm/index.ts` | ~47 行（导出聚合） |

##### 2.3.2 业务服务统一范式

当前各服务（extract/simulate/generation/creation）结构不一致，建议统一：

```typescript
// 统一服务结构模板
export interface ServiceModule {
  // 核心业务方法
  execute(input: InputType): Promise<OutputType>;
  
  // SSE 流式版本（如需要）
  executeStream(input: InputType, onChunk: ChunkHandler): Promise<void>;
  
  // 批量处理版本（如需要）
  executeBatch(inputs: InputType[]): Promise<OutputType[]>;
}
```

**重构优先级**：
1. 先拆分 llm.ts（提取通用层）
2. 各业务服务基于通用层重构（后续迭代）

---

### 2.4 【P3 长期】工具层优化

#### 当前状况
- **ruleClean.ts** 672 行：广告检测规则 + 清洗逻辑混合
- **split.ts** 501 行：切分算法 + 标题模板 + 工具函数混合

#### 潜在拆分点（非本轮）

| 模块 | 拆分方向 | 收益 |
|------|----------|------|
| ruleClean | 规则库独立成 JSON/YAML 配置 | 规则可热更新 |
| split | 算法核心 vs 模板引擎分离 | 单元测试更清晰 |
| backup | 备份策略 vs 存储层分离 | 支持多种存储后端 |

**建议**：工具层暂不动，等业务稳定后再优化

---

##三、实施计划

### 阶段 A：编译产物优化（1-2 天）

| 步骤 | 任务 | 验收标准 |
|------|------|----------|
| A1 | demo-3d/demo-2d 路由懒加载 | 主包 < 1.5 MB |
| A2 | Vite manualChunks 配置三方库分离 | 生成独立 vendor chunk |
| A3 | image-helper/node-test 按需加载 | 主包 < 1 MB |
| A4 | 编译验证 + 运行时测试 | 所有页面正常加载 |

---

### 阶段 B：settings 页拆分（1 天）

| 步骤 | 任务 | 验收标准 |
|------|------|----------|
| B1 | 创建 settings/ 子目录，拆分 5 个 Panel | 每个 < 500 行 |
| B2 | 主容器 index.tsx 重构为 Tabs 布局 | UI 交互无变化 |
| B3 | 状态管理整理（useAppStore 调用） | 无重复 state |
| B4 | 功能回归测试 | 所有设置项可正常保存 |

---

### 阶段 C：m1-import Step3 拆分（1 天）

| 步骤 | 任务 | 验收标准 |
|------|------|----------|
| C1 | 创建 m1-import/clean/ 子目录 | 4 个子组件 |
| C2 | 抽取 ControlPanel/NodeStatusTable/LogViewer | 每个 < 300 行 |
| C3 | 主容器保留布局 + 业务协调逻辑 | < 300 行 |
| C4 | 清理任务全流程测试 | 多节点调度正常 |

---

### 阶段 D：image-helper 拆分（0.5 天）

| 步骤 | 任务 | 验收标准 |
|------|------|----------|
| D1 | 从 index.tsx 抽取 ImageCanvas/ToolPanel | 2 个子组件 |
| D2 | 主容器精简为画布容器 + 事件协调 | < 500 行 |
| D3 | 图片编辑功能验证 | 裁剪/图层/导出正常 |

---

### 阶段 E：llm.ts 服务层拆分（1 天）

| 步骤 | 任务 | 验收标准 |
|------|------|----------|
| E1 | 创建 real/llm/ 子目录 | 4 个子模块 |
| E2 | 拆分 streaming/request/retry/provider | 每个 < 250 行 |
| E3 | index.ts 重新导出旧 API（保持兼容） | 无 breaking change |
| E4 | 各业务服务调用验证 | M0/M1/M4/M5 流程正常 |

---

## 四、度量指标

### 4.1 编译产物目标

| 指标 | 当前值 | 目标值 | 阶段 |
|------|--------|--------|------|
| 主包大小 | 1.8 MB | < 1 MB | A |
| demo-3d chunk | 打入主包 | 独立 chunk 2.7 MB | A |
| demo-2d chunk | 打入主包 | 独立 chunk 1.3 MB | A |
| vendor chunk | 无 | 独立 chunk ~800 KB | A |
| 总产物大小 | 5.7 MB | < 6 MB（可接受） | A |

### 4.2 代码可维护性目标

| 指标 | 当前值 | 目标值 | 阶段 |
|------|--------|--------|------|
| 单文件最大行数 | 1,820 行 | < 500 行 | B-E |
| 页面平均行数 | ~1,000 行 | < 400 行 | B-D |
| 服务层单文件 | 747 行 | < 300 行 | E |
| 循环依赖数量 | 未检测 | 0 | 全阶段 |

### 4.3 运行时性能目标

| 指标 | 要求 |
|------|------|
| 首屏加载时间 | 无明显变化（< 2s） |
| 路由切换延迟 | < 500ms（懒加载模块首次） |
| 内存占用 | 无明显增长 |

---

## 五、风险与注意事项

### 5.1 技术风险

| 风险 | 缓解措施 |
|------|----------|
| **懒加载失败** | Suspense fallback + ErrorBoundary 兜底 |
| **循环依赖** | 使用 `madge` 工具预检测 |
| **类型丢失** | 拆分时保持 index.ts 导出完整性 |
| **运行时异常** | 每阶段完成后全流程回归测试 |

### 5.2 业务风险

| 风险 | 缓解措施 |
|------|----------|
| **功能回退** | 拆分前录制测试用例（手工或 Playwright） |
| **状态管理混乱** | 明确各子组件 props 接口，避免隐式依赖 |
| **git 冲突** | 分阶段小步提交，每阶段验证后再进入下一步 |

### 5.3 开发约束

- **不引入新框架/库**：仅重组现有代码，不增加技术债
- **保持向后兼容**：旧 API 导出不变，内部实现重构
- **文档同步**：`DESIGN.md` 和 `CLAUDE.md` 需同步更新模块结构

---

## 六、检查清单

### 阶段 A 完成标志
- [ ] `npm run build` 无警告
- [ ] 主包 < 1 MB
- [ ] demo-3d/demo-2d 独立 chunk
- [ ] 所有路由可正常访问
- [ ] 编译产物截图记录到 git commit

### 阶段 B-D 完成标志
- [ ] 拆分模块目录结构符合规划
- [ ] 无单文件超过 500 行
- [ ] 所有页面功能回归测试通过
- [ ] 运行时无 console 报错
- [ ] commit message 注明拆分范围

### 阶段 E 完成标志
- [ ] llm.ts 拆分为 4 个子模块
- [ ] 旧 API 导出保持兼容
- [ ] M0/M1/M4/M5 端到端流程验证
- [ ] 服务层单元测试（如有）仍通过

### 全阶段完成标志
- [ ] 更新 `HANDOFF.md` 记录拆分结果
- [ ] 更新 `DESIGN.md` §7 技术债部分
- [ ] 生成拆分前后对比报告（代码量/编译产物）
- [ ] git tag 标记里程碑版本

---

## 七、后续优化方向（非本轮）

1. **TypeScript 严格模式**：开启 `strictNullChecks`（当前部分模块使用 `any`）
2. **单元测试覆盖**：核心算法模块（ruleClean/split/alignedDiff）补充测试
3. **组件库抽取**：将通用组件（DiffView/LogViewer）迁移到 `src/components/`
4. **CI/CD**：配置 GitHub Actions 自动检测编译产物大小超标
5. **性能监控**：集成 Lighthouse CI 监控首屏加载时间

---

## 附录：工具命令

### 代码量统计
```bash
# 按模块统计
find src/pages -name "*.tsx" | xargs wc -l | sort -rn

# 单文件 Top 10
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -11

# 编译产物分析
npm run build && du -h dist/assets/*.js
```

### 依赖分析
```bash
# 安装工具
npm install -D madge

# 检测循环依赖
npx madge --circular --extensions ts,tsx src/

# 生成依赖图
npx madge --image graph.png src/
```

### 懒加载验证
```bash
# 启动开发服务器
npm run dev

# 打开 Chrome DevTools > Network > JS 筛选
# 观察页面切换时是否按需加载 chunk
```

---

**文档维护**：每完成一个阶段，更新本文档"实施计划"部分的完成状态。
