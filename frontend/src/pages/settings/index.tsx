import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useAppStore, genId, reloadStoreFromBackend } from '../../store/appStore'
import { testProvider, getDefaultPrompt } from '../../services/api'
import type { ModuleKey, ProviderNode } from '../../services/types'

const MODULE_LABELS: Record<ModuleKey, string> = {
  m0Arch: 'M0 架构设计',
  m0Blueprint: 'M0 章节蓝图',
  m1Clean: 'M1 文本清理',
  m2Extract: 'M2 设定提取',
  m3Simulate: 'M3 角色推演',
  m4Generate: 'M4 章节生成',
  m5Check: 'M5 一致性检查',
  m5Finalize: 'M5 定稿归档',
  embedding: 'Embedding 向量',
}

export default function SettingsPage() {
  const { message, modal } = App.useApp()
  const providers = useAppStore((s) => s.providers)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const assetDir = useAppStore((s) => s.assetDir)
  const showMenuBar = useAppStore((s) => s.showMenuBar)
  const setState = useAppStore((s) => s.setState)
  const resetDemo = useAppStore((s) => s.resetDemo)
  const [editing, setEditing] = useState<ProviderNode | null>(null)
  const [draftPrompt, setDraftPrompt] = useState<string>(m1SystemPrompt)
  const [draftDir, setDraftDir] = useState<string>(assetDir)
  const [applyingDir, setApplyingDir] = useState(false)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    node: ProviderNode
    ok: boolean
    models: string[]
    error?: string
  } | null>(null)
  const [form] = Form.useForm<ProviderNode>()

  const openEdit = (node?: ProviderNode) => {
    const target: ProviderNode = node ?? {
      id: genId('prov'),
      name: '',
      nodeType: 'text',
      baseURL: '',
      apiKey: '',
      model: '',
      enabled: true,
      lastTestResult: null,
      maxConcurrency: 2,
      batchSize: 1,
      intervalSec: 0,
    }
    setEditing(target)
    form.setFieldsValue(target)
  }

  const saveEdit = async () => {
    const values = await form.validateFields()
    const merged = { ...editing!, ...values }
    const exists = providers.some((p) => p.id === merged.id)
    setState({
      providers: exists
        ? providers.map((p) => (p.id === merged.id ? merged : p))
        : [...providers, merged],
    })
    setEditing(null)
    message.success('节点已保存（当前存于本地，后续随数据层迁移入库）')
  }

  const runTest = async (node: ProviderNode) => {
    setTestingId(node.id)
    const result = await testProvider({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model })
    setState({
      providers: useAppStore
        .getState()
        .providers.map((p) => (p.id === node.id ? { ...p, lastTestResult: result.ok ? 'ok' : 'fail' } : p)),
    })
    setTestingId(null)
    setTestResult({ node, ...result })
  }

  // 切换资产目录：先同步落盘设置（await），再重载该目录数据（避免 debounce 未落地导致读旧库）
  const applyAssetDir = async () => {
    const dir = draftDir.trim()
    setApplyingDir(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetDir: dir }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        message.error(e.error || '资产目录设置失败')
        return
      }
      setState({ assetDir: dir })
      await reloadStoreFromBackend()
      message.success(dir ? `已切换资产目录：${dir}` : '已恢复默认资产目录')
    } finally {
      setApplyingDir(false)
    }
  }

  const columns = [
    { title: '名称', dataIndex: 'name' },
    {
      title: '类型',
      dataIndex: 'nodeType',
      width: 110,
      render: (v: ProviderNode['nodeType']) =>
        v === 'image' ? (
          <Tag color="purple">文生图</Tag>
        ) : (
          <Tag color="blue">文本生成</Tag>
        ),
    },
    { title: 'Base URL', dataIndex: 'baseURL', ellipsis: true },
    { title: '模型', dataIndex: 'model' },
    {
      title: '并发 / 批次 / 间隔',
      key: 'concurrency',
      width: 140,
      render: (_: unknown, node: ProviderNode) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {node.maxConcurrency}核 · {node.batchSize}章/次 · {node.intervalSec}s
        </Typography.Text>
      ),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 70,
      render: (v: boolean, node: ProviderNode) => (
        <Switch
          size="small"
          checked={v}
          onChange={(checked) =>
            setState({
              providers: providers.map((p) => (p.id === node.id ? { ...p, enabled: checked } : p)),
            })
          }
        />
      ),
    },
    {
      title: '连通性',
      dataIndex: 'lastTestResult',
      width: 90,
      render: (v: ProviderNode['lastTestResult']) =>
        v === 'ok' ? <Tag color="green">正常</Tag> : v === 'fail' ? <Tag color="red">失败</Tag> : <Tag>未测试</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, node: ProviderNode) => (
        <Space size="small">
          <Button size="small" loading={testingId === node.id} onClick={() => runTest(node)}>
            测试
          </Button>
          <Button size="small" onClick={() => openEdit(node)}>
            编辑
          </Button>
          <Popconfirm
            title="删除该节点？"
            onConfirm={() => setState({ providers: providers.filter((p) => p.id !== node.id) })}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="界面设置">
        <Space>
          <Typography.Text>显示菜单栏</Typography.Text>
          <Switch
            checked={showMenuBar}
            onChange={(checked) => {
              setState({ showMenuBar: checked })
              window.electronAPI?.setMenuBarVisibility(checked)
            }}
          />
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          控制是否显示 Electron 原生菜单栏（包含文件、编辑等标准菜单项）。关闭后可通过 Alt 键临时唤出。
        </Typography.Paragraph>
      </Card>

      <Card
        title="Provider 节点池"
        extra={
          <Button type="primary" onClick={() => openEdit()}>
            新增节点
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={providers} pagination={false} size="middle" />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          统一 OpenAI 兼容格式；测试经本地后端 Provider 抽象层调用（/api/llm/test → GET /v1/models）。节点选择策略（最久未用 + 最少连接、429 冷却恢复）待后续完善。
        </Typography.Paragraph>
      </Card>

      <Card title="模块 → 模型映射（各模块指定节点，模型随节点配置）">
        <Table
          rowKey="key"
          pagination={false}
          size="middle"
          dataSource={(Object.keys(MODULE_LABELS) as ModuleKey[]).map((key) => ({
            key,
            label: MODULE_LABELS[key],
            ...moduleMapping[key],
          }))}
          columns={[
            { title: '模块', dataIndex: 'label', width: 200 },
            {
              title: '节点（模型随节点配置）',
              dataIndex: 'nodeId',
              render: (v: string | null, row: { key: ModuleKey }) => {
                return (
                  <Select
                    style={{ minWidth: 280 }}
                    value={v ?? undefined}
                    placeholder="选择节点"
                    options={providers
                      .filter((p) => p.nodeType !== 'image')
                      .map((p) => ({ value: p.id, label: `${p.name} · ${p.model || '（未设模型）'}` }))}
                    onChange={(nodeId) => {
                      setState({
                        moduleMapping: {
                          ...moduleMapping,
                          [row.key]: { nodeId },
                        },
                      })
                    }}
                  />
                )
              },
            },
            {
              title: '将使用模型',
              key: 'model',
              width: 240,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              render: (_: unknown, row: any) => {
                const node = providers.find((p) => p.id === row.nodeId)
                return node?.model ? <Tag>{node.model}</Tag> : <Typography.Text type="secondary">—</Typography.Text>
              },
            },
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          模型名在「Provider 节点池」里为每个节点统一配置；此处仅选择节点。如需某模块用不同模型，请新建一个配置了该模型的节点。
        </Typography.Paragraph>
      </Card>

      <Card
        title="M1 清理提示词（默认）"
        extra={
          <Space>
            <Button
              loading={loadingPrompt}
              onClick={async () => {
                setLoadingPrompt(true)
                try {
                  const p = await getDefaultPrompt()
                  setDraftPrompt(p)
                } finally {
                  setLoadingPrompt(false)
                }
              }}
            >
              载入内置默认
            </Button>
            <Button disabled={draftPrompt === m1SystemPrompt} onClick={() => setState({ m1SystemPrompt: draftPrompt })}>
              保存
            </Button>
            <Button disabled={!m1SystemPrompt} onClick={() => { setDraftPrompt(''); setState({ m1SystemPrompt: '' }) }}>
              清空（用内置）
            </Button>
          </Space>
        }
      >
        <Input.TextArea
          value={draftPrompt}
          onChange={(e) => setDraftPrompt(e.target.value)}
          autoSize={{ minRows: 6, maxRows: 16 }}
          placeholder="留空则使用后端内置默认提示词。点「载入内置默认」可查看并在此基础上修改。"
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          {m1SystemPrompt ? `已保存自定义提示词（${m1SystemPrompt.length} 字）。清理时优先使用它。` : '当前为空——清理时使用后端内置默认提示词。'}
          {' M1 第三步可再为单次任务临时覆盖。'}
        </Typography.Paragraph>
      </Card>

      <Card title="资产目录">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          业务数据（书/章节/卡片/推演等）保存在此目录下的 <Typography.Text code>novelhelper.db</Typography.Text>，
          图片存 <Typography.Text code>images/</Typography.Text>。留空使用默认 <Typography.Text code>&lt;repo&gt;/assets</Typography.Text>。
          切换目录将载入该目录下的数据集（空目录则显示空书库，可经 M0 立项 / M1 导入自行创建作品）。Provider/密钥等设置不在此目录。
        </Typography.Paragraph>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={draftDir}
            onChange={(e) => setDraftDir(e.target.value)}
            placeholder="如：D:\\novelhelper-data（留空=默认 <repo>/assets）"
          />
          <Button type="primary" loading={applyingDir} disabled={draftDir.trim() === assetDir.trim()} onClick={applyAssetDir}>
            应用并切换
          </Button>
        </Space.Compact>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          当前：<Typography.Text code>{assetDir || '（默认 <repo>/assets）'}</Typography.Text>
        </Typography.Paragraph>
      </Card>

      <Card title="演示数据">
        <Button
          danger
          onClick={() =>
            modal.confirm({
              title: '重置演示数据？',
              content: '将清空当前所有修改，恢复到初始种子数据（包括导入会话、卡片、章节、推演记录）。',
              onOk: () => {
                resetDemo()
                message.success('已恢复初始演示数据')
              },
            })
          }
        >
          重置演示数据
        </Button>
      </Card>

      <Modal
        title={providers.some((p) => p.id === editing?.id) ? '编辑节点' : '新增节点'}
        open={!!editing}
        onOk={saveEdit}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如：本地 llama.cpp" />
          </Form.Item>
          <Form.Item name="nodeType" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'text', label: '文本生成' },
                { value: 'image', label: '文生图' },
              ]}
            />
          </Form.Item>
          <Form.Item name="baseURL" label="Base URL" rules={[{ required: true }]}>
            <Input placeholder="http://127.0.0.1:8080/v1" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key">
            <Input.Password placeholder="本地节点可留空" />
          </Form.Item>
          <Form.Item name="model" label="默认模型" rules={[{ required: true }]}>
            <Input placeholder="模型名" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="maxConcurrency" label="最大并发（核心数）" rules={[{ required: true }]}>
                <InputNumber min={1} max={32} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="batchSize" label="单次章节数" rules={[{ required: true }]}>
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="intervalSec" label="请求间隔(秒)" rules={[{ required: true }]}>
                <InputNumber min={0} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`连通性测试 — ${testResult?.node.name ?? ''}`}
        open={!!testResult}
        onCancel={() => setTestResult(null)}
        footer={<Button onClick={() => setTestResult(null)}>关闭</Button>}
      >
        {testResult?.ok ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="success" showIcon message={`连通正常，发现 ${testResult.models.length} 个模型`} />
            {testResult.models.length > 0 ? (
              <>
                <Typography.Text type="secondary">点击模型名即可填入该节点的「默认模型」：</Typography.Text>
                <Space wrap>
                  {testResult.models.map((m) => (
                    <Tag.CheckableTag
                      key={m}
                      checked={testResult.node.model === m}
                      onChange={() => {
                        setState({
                          providers: useAppStore
                            .getState()
                            .providers.map((p) => (p.id === testResult.node.id ? { ...p, model: m } : p)),
                        })
                        setTestResult((r) => (r ? { ...r, node: { ...r.node, model: m } } : r))
                        message.success(`已将「${testResult.node.name}」默认模型设为 ${m}`)
                      }}
                    >
                      {m}
                    </Tag.CheckableTag>
                  ))}
                </Space>
              </>
            ) : (
              <Typography.Text type="secondary">该端点未返回模型列表（连接本身正常）。</Typography.Text>
            )}
          </Space>
        ) : (
          <Alert type="error" showIcon message="连接失败" description={testResult?.error} />
        )}
      </Modal>
    </Space>
  )
}
