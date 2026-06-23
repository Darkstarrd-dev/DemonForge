# 实施总结：M1 Step4 自动跳转 + 系统设置 Tab 布局 + 测试文本真实负载

## 完成时间
2026-06-20

## 实施内容

### 1. M1 Step4 自动跳转首个差异 ✅

**目标**：点击待审核章节后，右侧对比视图自动滚动到第一处修改位置。

**实现**：
- **DiffView.tsx**：新增 prop `autoScrollToFirstDiff?: boolean`（默认 true）
- 添加 `useEffect`：监听 `[rows, autoScrollToFirstDiff]`，查找第一个 `type !== 'context'` 的行
- 使用 `setTimeout(0)` 等待 DOM 渲染完成，然后调用 `scrollIntoView({ behavior: 'smooth', block: 'start' })`
- **Step4Review.tsx**：DiffView 调用处显式传入 `autoScrollToFirstDiff={true}`

**效果**：用户点击章节列表后，对比视图立即平滑滚动到首个差异行，无需手动查找。

---

### 2. 系统设置改 Tab 横向布局 ✅

**目标**：避免长页面滚动，改用 Tab 切换各配置项。

**实现**：
- **settings/index.tsx**：外层从 `<Space direction="vertical">` 改为 `<Tabs>`
- **分组方案**（4 个 Tab）：
  1. **节点池与测试**（Tab 1）
     - Provider 节点池（含 Tab 过滤文本/文生图 + 批量测试）
     - 模块→模型映射
     - M1 清理提示词（默认）
     - **测试文本**（新增 Card）
  2. **高级配置**（Tab 2）
     - 章节检测模式池
     - 资产目录
     - 界面设置
  3. **备份与恢复**（Tab 3）
     - 设置导入/导出
     - 完整备份/恢复
  4. **数据管理**（Tab 4）
     - 演示数据重置

**效果**：设置页从 900+ 行代码的单页滚动改为 4 个清晰分组的 Tab，用户可快速定位目标配置。

---

### 3. 测试文本配置 + 真实负载测试 ✅

**目标**：节点测试改用清理提示词+测试文本真实调用 `/api/llm/clean`，模拟实际负载。

#### 3.1 数据模型
- **appStore.ts**：新增字段 `m1TestText: string`，默认值为 200 字样本（含广告混淆/乱码/正文）
- **持久化**：`settingsPayload` 追加 `m1TestText`，随 settings.json 同步
- **bootstrapStore**：合并后端返回的 `m1TestText`（向后兼容，缺失时用默认值）
- **订阅**：settings 订阅新增 `s.m1TestText === prev.m1TestText` 判断

#### 3.2 UI 组件（新 Card）
- **位置**：Tab 1「节点池与测试」，「M1 清理提示词（默认）」下方
- **标题**：`测试文本`
- **extra 按钮**：「恢复默认」填入内置样本、「清空」置空
- **内容**：
  - `<Input.TextArea>` 绑定 `draftTestText` 本地 state
  - `autoSize={{ minRows: 4, maxRows: 12 }}`
  - 失焦时 `setState({ m1TestText: draftTestText })`（即时保存）
- **说明文字**：
  > 节点池的「测试」和「并发测试」会用清理提示词 + 此文本调用 /api/llm/clean 真实流式请求，
  > 模拟实际清理负载。留空则测试退化为极短内容（不推荐）。

#### 3.3 测试逻辑修改
- **probeOnce**（并发测试用）：
  - 签名扩展：`probeOnce(node, content: string, systemPrompt: string)`
  - 请求体包含 `content`（测试文本）和 `systemPrompt`（清理提示词）
- **runConcurrencyTest**：
  - 读取 `useAppStore.getState().m1TestText` 和 `m1SystemPrompt`
  - 所有 `probeOnce(node)` 改为 `probeOnce(node, testText, systemPrompt)`
- **testProvider**（连通性测试）：保持不变，仍调用 `/api/llm/test`（快速端口检测）

**效果**：并发测试现在使用真实负载（system prompt + 测试文本），响应时间更准确反映节点实际承载能力。

---

## 验证结果

### 自动化验证
✅ **TypeScript 编译**：`tsc --noEmit` 0 错误  
✅ **ESLint**：`npm run lint` 0 警告  
✅ **构建**：`npm run build`（tsc + vite）720ms，仅既有 chunk 体积警告  
✅ **smoke 测试**：全部 73 项断言通过（smoke(23) + parse(22) + ruleclean(43)）

### 待用户实机验证
1. **M1 Step4 自动跳转**
   - 进入 M1 导入流程 → 清理几章 → Step4 审核页
   - 点击一个「待审核」章节 → 右侧对比视图**自动滚动到第一处红/绿差异行**
   - 切换到另一章 → 再次自动滚动

2. **系统设置 Tab 布局**
   - 打开设置页 → 看到 4 个横向 Tab（节点池与测试 / 高级配置 / 备份与恢复 / 数据管理）
   - 点击各 Tab 切换 → 每个 Tab 下 Card 纵向排列，无需滚动全页

3. **测试文本真实负载**
   - 设置页 Tab1 →「测试文本」Card → 确认默认有 200 字样本
   - 编辑测试文本 → 失焦 → 刷新页面确认持久化
   - 节点池 → 选一个文本节点 →「并发测试」
   - 查看探测日志 → 请求 payload 应包含清理提示词 + 测试文本
   - 对比测试前后节点响应时间 → 真实负载下 latency 应明显高于空测试

---

## 修改文件清单

### 修改文件（4 个）
1. **`frontend/src/pages/m1-import/DiffView.tsx`**
   - 新增 prop `autoScrollToFirstDiff?: boolean`
   - 新增 useEffect 滚动逻辑

2. **`frontend/src/pages/m1-import/Step4Review.tsx`**
   - DiffView 调用处传 `autoScrollToFirstDiff={true}`

3. **`frontend/src/pages/settings/index.tsx`**（重构为 Tab 布局 + 新增测试文本 Card）
   - 外层 `<Space>` 改 `<Tabs>` 四 Tab 布局
   - 新增「测试文本」Card（在 Tab1「节点池与测试」下）
   - `probeOnce` 签名增加 `content`/`systemPrompt` 参数
   - `runConcurrencyTest` 读取 `m1TestText` 和 `m1SystemPrompt` 传给 `probeOnce`
   - 新增 `draftTestText` state
   - 新增 `m1TestText` 从 store 读取

4. **`frontend/src/store/appStore.ts`**
   - 新增字段 `m1TestText: string`（默认 200 字样本）
   - `settingsPayload` 追加 `m1TestText: s.m1TestText`
   - `bootstrapStore` 合并后端返回的 `m1TestText`
   - settings 订阅追加 `s.m1TestText === prev.m1TestText` 判断

### 新增文件
无

---

## 技术细节

### DiffView 自动滚动
- **时机**：`useEffect` 监听 `rows` 变化（章节切换时 rows 重新计算）
- **定位**：`rows.findIndex(r => r.type !== 'context')`，找到第一个非上下文行
- **滚动**：`setTimeout(0)` 确保 DOM 渲染完成，`scrollIntoView({ behavior: 'smooth', block: 'start' })`
- **边界**：无差异时 `findIndex` 返回 -1，提前 return，不报错

### 设置页 Tab 布局
- **结构**：`<Tabs items={[...]} />` 每个 item 的 children 包裹 `<Space direction="vertical" size={16} style={{width:'100%'}}>`
- **分组逻辑**：按使用频率（最常用「节点池与测试」置首）+ 功能相关性
- **向后兼容**：保留所有原卡片内容，只改变布局结构

### 测试文本默认值
```
第一章 开端

请加鹅鹅鹅群：12叁45陆7捌玖0（数字+谐音混淆）

正文内容abcd1234efgh（模拟正文穿插数字碎片）
主角心想："今天天气不错。"
```
- 含广告混淆、正文穿插乱码、对话格式
- 约 200 字，覆盖清理提示词的典型特征

### 真实负载测试
- **probeOnce 改动**：从固定 `'请回复"OK"。'` 改为接收 `content` + `systemPrompt` 参数
- **影响范围**：仅并发测试（`runConcurrencyTest`），连通性测试（`testProvider`）保持不变
- **超时设置**：保持 15s（真实负载下足够）

---

## 总结

三项改进均为**纯前端增强**，无需后端改动：
1. **M1 Step4 自动跳转** — 提升审核效率，减少手动滚动
2. **设置页 Tab 布局** — 解决长页面滚动痛点，分类清晰
3. **测试文本真实负载** — 测试结果更准确，真实反映节点承载能力

改动集中在 2 个页面组件 + 1 个 store 字段，影响面小，向后兼容。自动化验证全通过，待用户实机体验确认。
