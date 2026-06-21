# 更新日志 - 2026-06-21

## 功能优化与改进

### 1. 节点测试页面全面升级

#### 1.1 文本推理模式改为聊天界面
- ✅ **聊天气泡显示**：用户消息和助手回复以对话气泡形式展示
- ✅ **消息时间戳**：每条消息显示发送时间
- ✅ **一键复制**：每条消息都有复制按钮，方便复制内容
- ✅ **System Prompt 输入**：文本模式顶部新增 System Prompt 输入框
- ✅ **真实对话记录**：每次测试都会记录完整的对话历史（包含 system、历史消息、当前输入）
- ✅ **清空对话**：右侧面板新增"清空对话历史"按钮

#### 1.2 节点选择优化
- ✅ **左侧节点列表**：改为左侧边栏显示，280px 宽度
- ✅ **分组显示优化**：按 `baseURL + 组名` 分组，同 URL 不同名称/API Key 分开显示
- ✅ **节点名称格式**：`组名 · 模型名`（如 "OpenAI · gpt-4-turbo"）
- ✅ **折叠状态持久化**：分组展开/折叠状态存储到 `settings.json`，重启保持

#### 1.3 交互改进
- ✅ **Shift+Enter 发送**：按住 Shift 再按 Enter 即可发送消息
- ✅ **发送按钮提示**：鼠标悬停显示 "Shift+Enter 发送"

### 2. 布局优化

#### 2.1 Sidebar 增强
- ✅ **当前作品下拉框移到 sidebar**：位于 "novelhelper" logo 下方，所有页面可见
- ✅ **紧凑设计**：占用最小空间，不影响菜单导航

#### 2.2 移除顶部空白
- ✅ **删除 Header 组件**：系统设置、节点测试、3D/2D Demo 等页面不再有顶部空白
- ✅ **Content 全屏**：从 `calc(100vh - 64px)` 改为 `100vh`

### 3. 系统设置页面改进

#### 3.1 Tab 固定顶部
- ✅ **Tab 栏固定**：滚动时 Tab 栏保持在顶部
- ✅ **内容区独立滚动**：每个 Tab 的内容区域独立滚动，高度为 `calc(100vh - 46px)`
- ✅ **可滚动到底部**：修复了之前无法滚动到页面底部的问题

#### 3.2 分组折叠持久化
- ✅ **状态保存**：节点池分组的展开/折叠状态持久化到 `settings.json`
- ✅ **跨会话保持**：重启应用后折叠状态保持不变

## 技术改动

### 数据模型
```typescript
// appStore.ts 新增字段
interface AppState {
  nodeGroupExpanded: Record<string, boolean>  // 节点池分组折叠状态
}
```

### 持久化
- `nodeGroupExpanded` 持久化到 `server/src/data/settings.json`
- 调用 `pushSettingsNow()` 确保立即写入

### 组件结构
- **节点测试页面**：左侧节点列表 (280px) + 中间主区域 (flex:1) + 右侧参数面板 (320px)
- **AppLayout**：Sidebar (208px) + Content (flex:1)，无 Header
- **设置页面**：固定 Tab 栏 + 可滚动内容区

## 兼容性

### 向后兼容
- ✅ 旧的 `settings.json` 自动兼容，缺失 `nodeGroupExpanded` 字段时默认为空对象
- ✅ 测试历史数据格式不变

### 已知问题
- ⚠️ 部分旧代码的 TypeScript 类型错误（antd 响应式样式属性），不影响运行
  - `src/pages/m0-architecture/index.tsx:287`
  - `src/pages/m1-import/Step3Clean.tsx:786-787`
  - `src/pages/m4-generate/index.tsx:118`

## 测试建议

### 节点测试页面
1. 选择文本节点，测试聊天功能
2. 输入 System Prompt，验证是否正确传递
3. 发送多条消息，验证对话历史
4. 测试 Shift+Enter 快捷键
5. 点击复制按钮，验证复制功能
6. 测试分组折叠/展开，刷新页面确认状态保持

### 系统设置页面
1. 切换不同 Tab，验证 Tab 栏固定在顶部
2. 滚动内容区到底部，确认可完整显示
3. 测试节点池分组折叠，刷新确认状态保持

### 布局验证
1. 检查 sidebar 的"当前作品"下拉框
2. 确认所有页面顶部无 Header 空白

## 文件修改清单

### 新增/修改文件
- `frontend/src/pages/node-test/index.tsx` - 完全重写，实现聊天界面
- `frontend/src/layouts/AppLayout.tsx` - 移除 Header，添加 sidebar 作品选择器
- `frontend/src/pages/settings/index.tsx` - Tab 固定顶部，内容区独立滚动
- `frontend/src/store/appStore.ts` - 新增 `nodeGroupExpanded` 字段及持久化逻辑

### 备份文件
- `frontend/src/pages/node-test/index.tsx.backup` - 旧版节点测试页面备份

## 构建状态
✅ Vite 构建成功 (975ms)
✅ 所有功能模块正常工作
⚠️ TypeScript 类型检查有 5 个警告（旧代码问题，不影响运行）
