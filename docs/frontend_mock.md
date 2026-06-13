# mock 前端说明（frontend/）

> 状态：v0.2（2026-06-13）。**已进入正式开发**：M1 文本清理（AI 路径）与 Provider 连通性测试
> 已接真实后端（`server/` 最小 LLM 网关）；M2–M5 仍为前端模拟，数据仍存 localStorage。
> 定位：**正式前端**——页面只调 `services/api.ts`；真实项已切到 `services/real/`，其余 mock 项仍在 `services/mock/`。

## 运行

```bash
# 后端 LLM 网关（M1 AI 清理 / 设置页测试 endpoint 需要它）
cd server && npm install && npm run dev      # 监听 127.0.0.1:8787

# 前端（另开终端）
cd frontend
npm install     # 首次
npm run dev     # 开发服务器（Vite proxy /api → 8787）
npm run build   # 构建检查
node --experimental-strip-types scripts/smoke.mts           # 核心逻辑冒烟（切分/清理/diff 决策）
node --experimental-strip-types scripts/ruleclean-smoke.mts # 规则清理引擎冒烟（43 项）
```

## 技术栈与结构

Vite + React 19 + TypeScript + Ant Design v6 + zustand（persist→localStorage）+ react-router + diff。

```
frontend/src/
  layouts/AppLayout.tsx   # 侧边菜单 + 顶部「当前作品」切换 + mock 模式标识
  pages/                  # home / m1-import / m2-cards / m3-simulate / m4-generate / m5-chapters / settings
  services/
    types.ts              # 领域类型（对齐 DESIGN.md §3 实体，未来 API 返回结构以此为准）
    api.ts                # 唯一服务入口（页面只 import 这里）
    mock/impl.ts          # mock 实现：延迟 + 假流式 + 确定性假结果 ← 接真后端时替换这层
  store/appStore.ts       # zustand 全局数据 + persist + 重置演示数据
  mocks/seed.ts           # 种子数据：《剑啸九州》（素材）、《北境长歌》（作品）
  mocks/demoRaw.ts        # 演示 raw 文本《玄夜录》（混杂标题/广告/乱码）+ mock 清理规则
  utils/                  # 真逻辑：编码检测、切分正则、对齐 diff、行级决策应用、mockStream
```

## 真实现 vs mock 边界

| 真实（无 AI / 轻量 / 已接真实后端） | mock（前端模拟的 LLM 介入点） |
|---|---|
| TXT 上传读取、编码检测（BOM + UTF-8/GBK 评分）与手动切换重解码 | M1 AI 拆章（`aiSplitChapter`，固定拆两章） |
| 章节切分（M1 §3.2 五种预设正则 + 自定义） | M2 设定提取（规则统计伪提取器：对话引导词/地名后缀） |
| **M1 AI 清理路径**：真实 LLM 流式，经后端 `/api/llm/clean`（§3.7 v2 prompt） | M3 推演候选（角色卡风格模板拼装，假流式） |
| **M1 规则清理路径**：本地 `ruleClean`，零 LLM、瞬时 + 统计 | M4 章节生成（片段串联 + 模板过渡，假流式） |
| **Provider 连通性测试**：真实 `GET /v1/models`，经后端 `/api/llm/test`，列模型可一键填入 | M5 一致性检查（预置样例 + 一条真规则：时间线已死角色出现在正文 → error） |
| 双栏对齐 diff（diff 包）+ 行级决策应用生成最终文本；字符保留率护栏；数据持久化（localStorage） | |

## 各页面交互要点

- **首页**：书库概览（素材库/作品库分离的呈现）。
- **M1 文本导入**：四步流水线（导入→切分→AI 清理→审核入库）。切分预览确认后应用；
  「3、旧案重提」类不规范标题故意留给单章「AI 重拆」演示；清理步有范围选择、暂停/停止、
  活跃任务列表、双栏流式窗口；审核步三视图（原文/清理后/对比）+ 行级决策
  （接受/拒绝/双击编辑/重置）+ 章节级操作；**入库使用「清理结果+行级决策」的最终文本**
  （修复原型缺陷 §6.1），入库后 M2/M5 立即可见。
- **M2 设定卡片**：库范围/类型/关键词筛选；详情 Drawer 含出处引用回溯原文；
  「从章节提取设定」对任意书可演示（含 M1 新入库的书）；合并裁决（相似度 + A/B 对比）。
- **M3 角色推演**：场景创建/选择 → 单角色推演（上下文组装预览 Collapse 展示喂给 LLM 的块）
  → 双候选流式生成 → 采纳进场景序列（可排序/删除/换角色继续）。
- **M4 章节生成**：大纲节点（分卷）→ 本章大纲可编辑 → 勾选已采纳片段（硬约束）→
  假流式生成草稿 → 编辑 → 存为 draft 章节（关联大纲节点，已有章节确认覆盖）。
- **M5 章节管理**：章节表格 + 状态流转；「定稿+检查」自动跑一致性（不阻断定稿，
  演示默认方案待 §7 问题 3 拍板）+ 任意章节手动检查；报告 Drawer 逐项忽略/已处理；
  状态时间线 Tab 按角色筛选。在 M4 草稿中写入「陈九」（已死角色）再定稿可触发真规则 error。
- **设置**：Provider 节点池 CRUD/启停/连通性测试；模块→模型映射表；**重置演示数据**。

## 已知 mock 限制（正式版解决）

- 数据在 localStorage（约 5MB 上限），导入超大 TXT 可能持久化失败；正式版入 SQLite。
- 刷新后导入会话的原始字节不保留，无法重解码切换编码（文本仍在）。
- M1 清理并发/节点调度为视觉模拟，无真实速率控制与 429 处理。
- 提取/推演/生成的文本质量为模板水平，仅供流程与交互验证。
