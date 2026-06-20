# 剩余需求实施指南

## 已完成需求（6个）

1. ✅ **需求1：Book增加作者/平台字段** - `types.ts` 扩展 + `home/index.tsx` 表格列 + 编辑弹窗
2. ✅ **需求2：书库导出txt功能** - `home/index.tsx` 导出按钮 + Blob下载
3. ✅ **需求4：测试文本真实负载** - `appStore.ts` + `settings/index.tsx` 默认文本替换
4. ✅ **需求5：移除演示数据** - `seed.ts` 清空 + 设置页Tab移除
5. ✅ **需求6：序章不计数** - `split.ts` `applyTitleTemplate` 跳过序章
6. ✅ **需求7：Step4跳转按钮** - `Step4Review.tsx` 自动接受无修改章节 + 向上/向下按钮

## 待实施需求（3个）

### 需求3：M1批次改字数模式+token估算

**复杂度**：高 ⭐⭐⭐⭐⭐

**当前进度**：70% 完成
- ✅ Token估算工具函数（`utils/tokenEstimate.ts`）
- ✅ 调度器按字数累积逻辑（`services/real/llm.ts` 的 `dequeueBatch`）
- ✅ 类型定义更新（`CleanNode.batchChars`, `ProviderNode.batchChars`）
- ⏳ 需要批量替换所有 `batchSize` → `batchChars`（约12处）
- ⏳ UI改造（Step3Clean + settings）

**影响范围**：
- `frontend/src/utils/tokenEstimate.ts` - ✅ 已创建
- `frontend/src/services/real/llm.ts` - ✅ 已更新调度器逻辑
- `frontend/src/services/types.ts` - ✅ ProviderNode类型已更新
- `frontend/src/store/appStore.ts` - ✅ cleanNodeOverrides类型已更新
- `frontend/src/mocks/seed.ts` - ⏳ 需更新 seedProviders
- `frontend/src/utils/provider.ts` - ⏳ normalizeProvider 函数
- `frontend/src/pages/m1-import/Step3Clean.tsx` - ⏳ UI控件从"章节数"改"字数上限"
- `frontend/src/pages/settings/index.tsx` - ⏳ 节点编辑弹窗字段名

**剩余实施步骤**：

1. **批量替换所有 `batchSize` 引用为 `batchChars`**：
   
   涉及文件（按编译错误顺序）：
   - `mocks/seed.ts` - seedProviders 两处（默认值改为 4000）
   - `utils/provider.ts` - normalizeProvider 函数（默认值 4000）
   - `pages/settings/index.tsx` - openEdit 函数 + Form.Item name（3处）
   - `pages/m1-import/Step3Clean.tsx` - nodeRunStates / buildCleanNodes / updateNodeSetting（6处）
   
   搜索命令：`grep -rn "batchSize" frontend/src --include="*.ts" --include="*.tsx"`

2. **Step3Clean UI改造**（`pages/m1-import/Step3Clean.tsx`）：
   - 删除原"单次章节数"InputNumber（约653行）
   - 新增"单批字数上限"InputNumber：
     ```tsx
     <InputNumber
       min={1000}
       max={100000}
       step={1000}
       value={rs.batchChars}
       onChange={(v) => updateNodeSetting(rs.nodeId, { batchChars: v ?? 4000 })}
       addonAfter={`≈ ${formatTokenCount(charsToTokens(rs.batchChars))} tokens`}
     />
     ```
   - 统一设置批量区（约484行）：
     ```tsx
     const [bulkBatchChars, setBulkBatchChars] = useState<number | null>(null)
     // 应用逻辑改为传 batchChars
     ...(bulkBatchChars != null ? { batchChars: bulkBatchChars } : {})
     ```

3. **settings页节点编辑弹窗改造**（`pages/settings/index.tsx`）：
   - Form.Item `name="batchSize"` 改为 `name="batchChars"`
   - `label="单次章节数"` 改为 `label="批次字数上限"`
   - InputNumber：`min={1000}` / `max={100000}` / `step={1000}`
   - 默认值从 1 改为 4000

4. **数据迁移**（可选，向后兼容）：
   - `normalizeProvider` 函数增加兼容逻辑：
     ```typescript
     batchChars: p.batchChars ?? ((p as any).batchSize ? (p as any).batchSize * 3000 : 4000)
     ```
   - 启动时自动转换：旧 `batchSize=1` → `batchChars=4000`（单章），`batchSize=10` → `batchChars=30000`（批量）

**验证要点**：
- 100章，每章3000字，batchChars=10000 → 应发送约30个请求（每请求3-4章）
- 单章超batchChars仍能取（不卡死）
- token估算值与实际相差≤30%
- 旧配置自动迁移（batchSize存在时转换）

**注意事项**：
- `buildCleanNodes` 函数传给调度器的字段名必须是 `batchChars`
- Debug事件中的 `batchSize` 字段保持不变（表示实际打包章节数，用于日志）
- 后端 `/api/llm/clean` 不受影响（接收合并后的 content）

---

### 需求8：节点池获取模型多选批量添加

**复杂度**：中 ⭐⭐⭐

**影响范围**：
- `frontend/src/pages/settings/index.tsx` - 节点编辑弹窗

**实施步骤**：

1. **新增state**：
```typescript
const [fetchingModels, setFetchingModels] = useState(false)
const [availableModels, setAvailableModels] = useState<string[]>([])
const [selectedModels, setSelectedModels] = useState<string[]>([])
```

2. **编辑弹窗改造**：
   - `Form.Item name="model"` 标签右侧增加按钮：
     ```tsx
     <Button
       size="small"
       loading={fetchingModels}
       disabled={!form.getFieldValue('baseURL') || !form.getFieldValue('apiKey')}
       onClick={fetchModels}
     >
       获取模型
     </Button>
     ```
   - 点击后调用 `testProvider(...)` 获取模型列表
   - 弹出 Modal，展示 `Checkbox.Group` 多选模型（`availableModels`）
   - 确认后生成多个节点（共享 baseURL/apiKey，名称自动编号）

3. **fetchModels 函数**：
```typescript
const fetchModels = async () => {
  const baseURL = form.getFieldValue('baseURL')
  const apiKey = form.getFieldValue('apiKey')
  if (!baseURL) return
  setFetchingModels(true)
  try {
    const result = await testProvider({ baseURL, apiKey, model: '' })
    if (result.ok && result.models.length > 0) {
      setAvailableModels(result.models)
      setSelectedModels([])
      // 弹出选择Modal
    } else {
      message.error(result.error || '获取模型列表失败')
    }
  } finally {
    setFetchingModels(false)
  }
}
```

4. **批量添加逻辑**：
```typescript
const batchAddNodes = () => {
  if (selectedModels.length === 0) return
  const base = form.getFieldsValue()
  const newNodes: ProviderNode[] = selectedModels.map((model, i) => ({
    ...base,
    id: genId('prov'),
    name: `${base.name} (${model})`,
    model,
    enabled: true,
    lastTestResult: null,
  }))
  setState({ providers: [...providers, ...newNodes] })
  message.success(`已添加 ${newNodes.length} 个节点`)
  setEditing(null)
}
```

5. **节点折叠/展开**（同baseURL的节点分组）：
   - 表格数据源按 `baseURL` 分组
   - 使用 antd `Table` 的 `expandable` 属性实现可折叠行
   - 父行显示 baseURL + 节点数量，子行显示各model

**验证要点**：
- 填写 baseURL + apiKey → 点"获取模型" → 正常返回列表
- 多选3个模型 → 确认 → 生成3个节点（名称不重复）
- 同一baseURL的节点可折叠

---

### 需求9：节点测试改为真实调用

**复杂度**：中 ⭐⭐⭐

**影响范围**：
- `frontend/src/pages/settings/index.tsx` - 测试按钮行为
- 复用 `Step3Clean.tsx` 的实时窗口组件

**实施步骤**：

1. **抽取实时窗口组件** (`components/StreamWindow.tsx`)：
```typescript
interface StreamWindowProps {
  visible: boolean
  onClose: () => void
  title: string
  leftContent: string
  rightContent: string
  leftLabel?: string
  rightLabel?: string
}
export function StreamWindow({ ... }: StreamWindowProps) {
  // 从 Step3Clean 复制实时窗口的 JSX
}
```

2. **测试按钮改造**：
   - 表格"测试"按钮不再调 `testProvider`（仅获取模型列表）
   - 改为打开 Modal，内含：
     - 清理提示词（只读，来自 `m1SystemPrompt`）
     - 测试文本（只读，来自 `m1TestText`）
     - "开始测试"按钮 → 调用 `startSingleTest(node)`
   - Modal底部展示 `<StreamWindow />` 组件，显示SSE流式响应

3. **startSingleTest 函数**：
```typescript
const [testStreaming, setTestStreaming] = useState(false)
const [testStreamLeft, setTestStreamLeft] = useState('')
const [testStreamRight, setTestStreamRight] = useState('')

const startSingleTest = async (node: ProviderNode) => {
  setTestStreaming(true)
  setTestStreamLeft(m1TestText)
  setTestStreamRight('')
  
  try {
    const res = await fetch('/api/llm/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseURL: node.baseURL,
        apiKey: node.apiKey,
        model: node.model,
        content: m1TestText,
        systemPrompt: m1SystemPrompt,
      }),
    })
    
    if (!res.ok || !res.body) {
      message.error(`测试失败：HTTP ${res.status}`)
      return
    }
    
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let acc = ''
    
    for (;;) {
      const { done, value } = await reader.read()
      if (value) {
        const chunk = decoder.decode(value, { stream: true })
        acc += chunk
        setTestStreamRight(acc)
      }
      if (done) break
    }
    
    message.success('测试完成')
  } catch (e) {
    message.error(`测试异常：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    setTestStreaming(false)
  }
}
```

4. **Modal JSX**：
```tsx
<Modal
  title={`测试节点：${testingNode?.name}`}
  open={!!testingNode}
  onCancel={() => setTestingNode(null)}
  width={1200}
  footer={[
    <Button key="close" onClick={() => setTestingNode(null)}>关闭</Button>,
    <Button
      key="test"
      type="primary"
      loading={testStreaming}
      onClick={() => startSingleTest(testingNode!)}
    >
      开始测试
    </Button>,
  ]}
>
  <Space direction="vertical" size={12} style={{ width: '100%' }}>
    <Card title="清理提示词" size="small">
      <Input.TextArea value={m1SystemPrompt || '（使用后端内置默认）'} readOnly rows={3} />
    </Card>
    <Card title="测试文本" size="small">
      <Input.TextArea value={m1TestText} readOnly rows={4} />
    </Card>
    <Card title="响应内容" size="small">
      <Row gutter={8}>
        <Col span={12}>
          <Typography.Text type="secondary">原文</Typography.Text>
          <div style={{ height: 300, overflow: 'auto', border: '1px solid #d9d9d9', padding: 8 }}>
            {testStreamLeft}
          </div>
        </Col>
        <Col span={12}>
          <Typography.Text type="secondary">清理结果</Typography.Text>
          <div style={{ height: 300, overflow: 'auto', border: '1px solid #d9d9d9', padding: 8 }}>
            {testStreamRight || '（等待响应...）'}
          </div>
        </Col>
      </Row>
    </Card>
  </Space>
</Modal>
```

**验证要点**：
- 点"测试"→ 弹窗显示提示词和测试文本
- 点"开始测试"→ 右侧流式显示清理结果
- 测试完成后可关闭Modal，再次打开可重新测试

---

## 构建验证

所有改动完成后运行：
```bash
cd frontend
npm run build
# 应无类型错误，仅体积警告可忽略
```

## 提交建议

建议分3个commit：
1. `feat: 需求3 - M1批次改字数模式+token估算`
2. `feat: 需求8 - 节点池获取模型多选批量添加`
3. `feat: 需求9 - 节点测试改为真实调用`

每个commit单独测试验证通过后再进行下一个。
