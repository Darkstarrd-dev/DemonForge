import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useAppStore, genId } from '../../store/appStore'
import { testProvider } from '../../services/api'
import type { ModuleKey, ProviderNode } from '../../services/types'

const MODULE_LABELS: Record<ModuleKey, string> = {
  m1Clean: 'M1 文本清理',
  m2Extract: 'M2 设定提取',
  m3Simulate: 'M3 角色推演',
  m4Generate: 'M4 章节生成',
  m5Check: 'M5 一致性检查',
  embedding: 'Embedding 向量',
}

export default function SettingsPage() {
  const { message, modal } = App.useApp()
  const providers = useAppStore((s) => s.providers)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const setState = useAppStore((s) => s.setState)
  const resetDemo = useAppStore((s) => s.resetDemo)
  const [editing, setEditing] = useState<ProviderNode | null>(null)
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
      baseURL: '',
      apiKey: '',
      model: '',
      maxConcurrency: 2,
      batchSize: 1,
      intervalSec: 0,
      enabled: true,
      lastTestResult: null,
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

  const columns = [
    { title: '名称', dataIndex: 'name' },
    { title: 'Base URL', dataIndex: 'baseURL', ellipsis: true },
    { title: '模型', dataIndex: 'model' },
    { title: '最大并发', dataIndex: 'maxConcurrency', width: 90 },
    { title: '批大小', dataIndex: 'batchSize', width: 80 },
    { title: '间隔(s)', dataIndex: 'intervalSec', width: 80 },
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

      <Card title="模块 → 模型映射（各模块可分别指定 provider 与模型）">
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
              title: '节点',
              dataIndex: 'nodeId',
              render: (v: string | null, row: { key: ModuleKey }) => (
                <Select
                  style={{ minWidth: 200 }}
                  value={v}
                  placeholder="选择节点"
                  options={providers.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={(nodeId) => {
                    const node = providers.find((p) => p.id === nodeId)
                    setState({
                      moduleMapping: {
                        ...moduleMapping,
                        [row.key]: { nodeId, model: node?.model ?? '' },
                      },
                    })
                  }}
                />
              ),
            },
            {
              title: '模型名',
              dataIndex: 'model',
              render: (v: string, row: { key: ModuleKey }) => (
                <Input
                  style={{ maxWidth: 260 }}
                  value={v}
                  onChange={(e) =>
                    setState({
                      moduleMapping: {
                        ...moduleMapping,
                        [row.key]: { ...moduleMapping[row.key], model: e.target.value },
                      },
                    })
                  }
                />
              ),
            },
          ]}
        />
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
          <Form.Item name="baseURL" label="Base URL" rules={[{ required: true }]}>
            <Input placeholder="http://127.0.0.1:8080/v1" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key">
            <Input.Password placeholder="本地节点可留空" />
          </Form.Item>
          <Form.Item name="model" label="默认模型" rules={[{ required: true }]}>
            <Input placeholder="模型名" />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="maxConcurrency" label="最大并发">
              <InputNumber min={1} max={32} />
            </Form.Item>
            <Form.Item name="batchSize" label="单次章节数">
              <InputNumber min={1} max={10} />
            </Form.Item>
            <Form.Item name="intervalSec" label="请求间隔(秒)">
              <InputNumber min={0} max={60} />
            </Form.Item>
          </Space>
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
