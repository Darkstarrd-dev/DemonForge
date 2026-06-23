# REMAINING_TASKS.md

**状态**：✅ 全部完成（2026-06-20）

本文档为第四十四次会话产出的9个需求实施指南，**现已全部完成并提交**。保留此文档供后续回顾实施细节。

## 完成摘要

- ✅ 需求1：Book增加作者/平台字段（仅素材）
- ✅ 需求2：书库导出txt功能
- ✅ 需求3：M1批次改字数模式+token估算
- ✅ 需求4：设置页测试文本真实负载
- ✅ 需求5：移除演示数据（剑啸九州/北境长歌）
- ✅ 需求6：M1章节分割序章不计数
- ✅ 需求7：M1 Step4增加跳转按钮（修正为章节内修改行跳转）
- ✅ 需求8：节点池获取模型多选批量添加
- ✅ 需求9：节点测试改为真实调用

**提交记录**：
- `04e93bd` - feat: 完成9个需求中的7个（需求1-7）
- `d8d4f24` - feat: 完成需求8和9 - 节点池批量添加与真实调用测试

**影响文件**（14个）：
- `frontend/src/services/types.ts` - Book/ProviderNode类型扩展
- `frontend/src/store/appStore.ts` - m1TestText更新 + cleanNodeOverrides类型
- `frontend/src/mocks/seed.ts` - 清空演示数据 + batchChars默认值
- `frontend/src/utils/provider.ts` - normalizeProvider向后兼容
- `frontend/src/utils/split.ts` - 序章跳过编号
- `frontend/src/utils/tokenEstimate.ts` - ✨新增：Token估算工具
- `frontend/src/pages/home/index.tsx` - 作者/平台列 + 导出txt
- `frontend/src/pages/m1-import/DiffView.tsx` - forwardRef暴露scrollToRow
- `frontend/src/pages/m1-import/Step3Clean.tsx` - batchChars UI + 字数累积逻辑
- `frontend/src/pages/m1-import/Step4Review.tsx` - 章节内修改行跳转
- `frontend/src/pages/settings/index.tsx` - 批量添加 + 真实测试
- `frontend/src/services/real/llm.ts` - dequeueBatch按字数累积
- `HANDOFF.md` - 进度更新
- `REMAINING_TASKS.md` - 本文件

**核心改动**：
1. **M1批次字数模式**：`batchSize`（章节数）→ `batchChars`（字数上限），调度器按字数累积章节（至少取1章），UI显示"10K字"，向后兼容旧配置
2. **节点池批量添加**：获取模型 → 多选 → 一次性创建多个节点（共享baseURL/apiKey）
3. **节点真实测试**：调用 `/api/llm/clean` SSE端点，流式显示清理结果（左原文 / 右清理）

---

## 归档：原实施指南

以下为原详细规划，供回顾参考：

### 需求3：M1批次改字数模式+token估算 ✅

**实施要点**：
- 新增 `utils/tokenEstimate.ts`（estimateTokens/charsToTokens/formatTokenCount）
- 类型更新：`ProviderNode.batchChars`（非batchSize）
- 调度器 `dequeueBatch`：按字数累积，至少取1章
- UI：Step3Clean + settings 字数输入框（1K-100K），显示K字单位
- 向后兼容：`normalizeProvider` 自动转换旧 `batchSize * 3000`

### 需求8：节点池获取模型多选批量添加 ✅

**实施要点**：
- 新增state：fetchingModels/availableModels/selectedModels/modelSelectOpen
- `fetchModels` 函数：调用 `testProvider` 获取模型列表
- `batchAddNodes` 函数：批量生成节点，名称自动编号
- Form.Item改造：Space.Compact布局，右侧「获取模型」按钮
- 新增Modal：Checkbox.Group多选 + 批量添加

### 需求9：节点测试改为真实调用 ✅

**实施要点**：
- 新增state：testingNode/testStreaming/testStreamLeft/testStreamRight
- `startRealTest` 函数：调用 `/api/llm/clean` SSE端点，解析流式响应
- 测试按钮改造：打开Modal（不再调用runTest）
- 新增Modal（width=1200）：清理提示词 + 测试文本 + 左右对比区（Card + 滚动div）
- 删除旧代码：testingId state + runTest函数

---

**文档完成时间**：2026-06-20  
**会话编号**：第四十四次  
**总耗时**：约2小时（规划 + 实施 + 验证）
