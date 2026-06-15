---
name: novel-generator
description: A strict, process-driven system for long-form novel generation. Enforces architecture design, RAG-based knowledge management, and state consistency.
allowed-tools: Read, Write, Bash, Task, Python
user-invocable: true
---

# Novel Generator v4.0 (Agent-Centric)

## 🚨 核心特性
1.  **Agent-Centric**: 核心创作逻辑由 Subagent 直接思考完成，不再依赖黑盒脚本。
2.  **Tool-Assisted**: 仅保留向量库管理、文件检查等必要工具脚本。
3.  **Step-by-Step**: 强制执行"雪花法"架构设计与"三幕式"剧情推进。
4.  **RAG-Native**: 写作前强制进行知识库检索。

## 🛠️ 工具脚本
位于 `.opencode/skill/novel-generator/scripts/`:

| 脚本 | 功能 | 用途 |
|------|------|------|
| `vector_store.py` | 向量库管理 | 知识库导入(add)与检索(query) |
| `workflow_check.py` | 工作流验证 | 检查必需文件是否存在 |
| `asset_manager.py` | 资源模板 | 注入预置角色/世界观 |
| `utils.py` | 辅助工具 | 文件读写辅助 |

## 🚀 工作流程

### Phase 1: 初始化
1.  **确认工作目录**: 询问用户项目根目录 (如 `Z:\Playground\MyNovel`)。
2.  **检查环境**: 调用 `workflow_check.py`。
3.  **资源注入** (可选): 调用 `asset_manager.py`。

### Phase 2: 架构设计 (`novel-arch`)
**Agent 行为**:
1.  交互式询问：主题、类型、核心梗概。
2.  **雪花法推导**：
    *   Step 1: 核心种子 (The Seed)
    *   Step 2: 角色动力学 (Character Dynamics)
    *   Step 3: 世界构建 (World Building)
    *   Step 4: 情节架构 (Plot Architecture)
3.  **生成文件**:
    *   写入 `Novel_architecture.txt`
    *   写入 `character_state.txt`

### Phase 3: 蓝图规划 (`novel-blueprint`)
**Agent 行为**:
1.  读取架构文件。
2.  规划全书节奏（悬念单元/过山车效应）。
3.  分块生成章节目录（每次约20章）。
4.  写入/追加 `Novel_directory.txt`。

### Phase 4: 章节创作 (`novel-draft`)
**Agent 行为**:
1.  **Context**: 读取设定、目录、前文摘要、角色状态。
2.  **RAG**: 调用 `vector_store.py` 检索关键词。
3.  **Thinking**: 构思本章剧情钩子。
4.  **Writing**: 撰写正文（约3000字）。
5.  写入 `chapters/chapter_<n>.txt`。

### Phase 5: 定稿与归档 (`novel-finalize`)
**Agent 行为**:
1.  (可选) 扩写过短章节。
2.  **滚动摘要**: 更新 `global_summary.txt`。
3.  **状态追踪**: 更新 `character_state.txt`。
4.  **记忆固化**: 调用 `vector_store.py add` 将章节入库。

### Phase 6: 批量生产 (`novel-batch`)
协调 `novel-draft` 和 `novel-finalize`，循环执行：写稿 -> 定稿 -> 下一章。

## 🤖 Subagents 清单
| Agent | 职责 | 核心能力 |
|-------|------|----------|
| `novel-arch` | 架构师 | 雪花法逻辑推导 |
| `novel-blueprint` | 策划 | 节奏曲线规划 |
| `novel-draft` | 作家 | 创意写作、RAG检索 |
| `novel-finalize` | 编辑 | 摘要提炼、状态更新 |
| `novel-consistency`| 审校 | 逻辑冲突检测 |
| `novel-batch` | 统筹 | 多Agent协同 |
| `novel-knowledge-import` | 资料员 | 向量库数据灌入 |
| `novel-role-library` | 管理员 | 角色卡片管理 |

## 📁 推荐项目结构
```
<workdir>/
├── Novel_architecture.txt    # 核心架构
├── Novel_directory.txt       # 章节目录
├── global_summary.txt        # 滚动摘要
├── character_state.txt       # 角色状态表
├── chapters/                 # 正文目录
│   ├── chapter_1.txt
│   └── ...
├── .novel_data/              # 系统数据
│   └── vector_store/         # 向量数据库
└── 角色库/                   # 角色档案
```

## 💡 最佳实践
- **不要直接写正文**：总是先运行 `novel-arch` 和 `novel-blueprint`。
- **勤于定稿**：写完一章立即运行 `novel-finalize`，否则下一章的 Agent 看不到最新的剧情摘要。
- **利用知识库**：将设定集、参考资料通过 `novel-knowledge-import` 导入，Agent 会在写作时自动查阅。
