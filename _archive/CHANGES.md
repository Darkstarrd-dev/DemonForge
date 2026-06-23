# 功能更新清单（2025-06-22）

## 已完成的需求

### 1. 系统设置 - 备份与恢复 - 导入设置改为增量导入
**位置**: `frontend/src/pages/settings/index.tsx` - `confirmImportSettings` 函数

**变更**:
- 导入设置时不再覆盖现有配置，仅添加当前不存在的项
- providers: 按 baseURL+model 判重，只添加新节点
- moduleMapping: 只填充当前缺失的模块映射
- splitPatterns: 按 key 判重，只添加新模式
- 其他配置项：仅当当前为默认值时才导入

**影响**: 用户导入设置时不会丢失现有配置，更安全


### 2. 系统设置 - 备份与恢复 - 增加恢复出厂按钮
**位置**: `frontend/src/pages/settings/index.tsx` - "完整备份 / 恢复" Card

**变更**:
- 在"完整备份 / 恢复"卡片中新增"恢复出厂"按钮
- 清空所有设置但保留业务数据（书籍、章节等）
- 带二次确认弹窗，防止误操作

**功能**: 
- 清空 providers（节点池）
- 重置 moduleMapping 为默认
- 清空自定义提示词
- 重置所有配置为出厂状态


### 3. M1-Step4 全部入库 - 素材库增加作者|平台输入项
**位置**: `frontend/src/pages/m1-import/Step4Review.tsx`

**变更**:
- 入库表单新增"作者"和"平台"两个可选字段
- 仅当选择"素材库"时显示这两个字段（作品库不显示）
- 字段可留空，不强制填写
- 数据正确保存到 Book 实体的 author 和 platform 字段

**类型更新**: 
- Form 类型扩展为 `{ title: string; type: BookType; author?: string; platform?: string }`
- 导入 Book 类型用于构造完整对象


### 4. M1-Step4 入库报错修复 ✅ 已彻底解决（CORS 跨域问题）
**位置**: 
- `server/src/index.ts` - 添加 CORS 配置（主要修复）
- `frontend/src/store/appStore.ts` - `pushStore` 函数（辅助改进）
- `frontend/src/pages/m1-import/Step4Review.tsx` - `doStore` 函数（辅助改进）

**问题根因**: ⚠️ **CORS 跨域错误**
```
Access to fetch at 'http://127.0.0.1:8787/api/store' 
from origin 'http://localhost:5173' 
has been blocked by CORS policy
```
- 前端：`http://localhost:5173` (Vite 开发服务器)
- 后端：`http://127.0.0.1:8787` (Fastify 后端)
- 浏览器阻止跨域请求

**最终修复方案**:
1. **安装 CORS 包**: `npm install @fastify/cors`
2. **配置后端 CORS**:
   ```typescript
   import cors from '@fastify/cors'
   
   await app.register(cors, {
     origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
     credentials: true,
   })
   ```
3. **⚠️ 必须重启后端服务才能生效**

**辅助改进**（依然有效）:
- 增加超时控制：60 秒
- 数据大小检测：入库前预检查，超过 30MB 警告
- 改进错误信息：区分超时、网络错误、后端错误
- 控制台日志：显示数据大小和详细错误

**新增文档**:
- `CORS_FIX.md` - CORS 问题完整解决方案
- `M1_IMPORT_DEBUG.md` - 通用诊断指南


### 5. 左侧 Sidebar 可折叠为悬浮按钮（悬停显示）
**位置**: `frontend/src/layouts/AppLayout.tsx`

**变更**:
- 新增 `sidebarCollapsed` 状态控制折叠
- 新增 `floatingButtonHovered` 状态控制悬停显示
- 点击 "NovelHelper" 标题 → 折叠 Sidebar
- 折叠后左上角显示**隐藏的触发区域**（120x80px）
- **鼠标移到左上角触发区域** → 显示 "NovelHelper" 按钮
- 点击按钮 → 恢复 Sidebar
- 折叠时 header 和 main 区域占据完整宽度

**样式**:
- 触发区域：固定定位，左上角，透明，120x80px
- 悬浮按钮：仅在触发区域悬停时显示，带过渡动画
- 深色/浅色主题自动适配背景色


### 6. 3D|2D 环境 Demo 界面优化
**位置**: 
- `frontend/src/pages/demo-3d/index.tsx`
- `frontend/src/pages/demo-2d/index.tsx`

**变更**:
- 移除顶部 header Card（包含标题和说明文字）
- 2D/3D 内容占据 100% 容器空间，无圆角
- **2D Demo 添加 `overflow: 'hidden'` 取消滚动条**
- 复位按钮改为悬浮容器，对齐右上角
- 悬浮按钮：半透明白色背景，带阴影

**效果**: 更沉浸的演示体验，最大化 3D/2D 内容显示区域


## 其他修复

### TypeScript 编译警告修复
**位置**: `frontend/src/services/real/simulate.ts`

**变更**: 注释掉未使用的 `streamSSE` 导入

**结果**: 前端编译通过，无错误和警告


## 数据库问题说明

### M1 入库超时问题分析
**数据库文件**: `server/src/data/assets/novelhelper.db` (16MB)

**可能原因**:
1. 数据库文件过大（16MB）导致读写慢
2. 单次入库数据量过大
3. 网络请求超时（已修复，添加 30s 超时控制）

**建议**:
- 如需清空数据库重新开始，手动删除 `server/src/data/assets/novelhelper.db`
- 或使用"恢复出厂"功能（仅清空设置，不删数据）
- 后端 bodyLimit 已设置为 50MB，理论上足够


## 测试建议

1. **导入设置测试**:
   - 导出当前设置
   - 添加一些新节点
   - 导入之前导出的设置
   - 验证新节点未被覆盖，旧节点成功添加

2. **恢复出厂测试**:
   - 点击"恢复出厂"按钮
   - 确认弹窗警告信息正确
   - 验证设置清空但书籍数据保留

3. **M1 入库测试**:
   - 导入少量章节（测试入库功能）
   - 导入素材库书籍，填写作者和平台
   - 导入作品库书籍，确认不显示作者和平台字段
   - 如遇超时，检查是否超过 30 秒

4. **Sidebar 折叠测试**:
   - 点击 NovelHelper 标题折叠
   - 鼠标移到左上角验证悬浮按钮显示
   - 鼠标移开验证按钮隐藏
   - 点击悬浮按钮恢复
   - 深色/浅色主题切换测试

5. **2D Demo 测试**:
   - 访问 2D Demo 页面
   - 验证无顶部 header
   - 验证无右侧滚动条
   - 验证内容自适应容器大小
   - 验证复位按钮在右上角悬浮

6. **3D Demo 测试**:
   - 访问 3D Demo 页面
   - 验证无顶部 header
   - 验证复位按钮在右上角悬浮
   - 点击复位按钮测试功能正常


## 编译结果

```
✓ TypeScript 编译通过
✓ Vite 构建成功
✓ 所有资源打包完成
```

构建产物大小：
- index.js: ~1.58 MB (gzip: ~495 KB)
- demo-3d.js: ~2.77 MB (gzip: ~977 KB)
- demo-2d.js: ~1.35 MB (gzip: ~353 KB)

