import { Button, Card, Input, Segmented, Select, Space, Table, Tag, Typography } from 'antd'
import { DownOutlined, UpOutlined } from '@ant-design/icons'
import type { ModuleKey, ProviderNode, ProviderNodeType } from '../../../services/types'

export default function NodesTabContent(props: {
  nodeTypeFilter: ProviderNodeType
  setNodeTypeFilter: (v: ProviderNodeType) => void
  batchTesting: boolean
  runBatchTest: () => void
  openEdit: (node?: ProviderNode) => void
  groupedProviders: Record<string, { baseURL: string; groupName: string; nodes: ProviderNode[] }>
  nodeGroupExpanded: Record<string, boolean>
  toggleGroup: (key: string) => void
  columns: any[]
  providers: ProviderNode[]
  moduleMapping: Record<string, any>
  MODULE_LABELS: Record<ModuleKey, string>
  setState: any
  draftPrompt: string
  setDraftPrompt: (v: string) => void
  loadingPrompt: boolean
  setLoadingPrompt: (v: boolean) => void
  getDefaultPrompt: () => Promise<string>
  m1SystemPrompt: string
  draftTestText: string
  setDraftTestText: (v: string) => void
  m1TestText: string
  token: any
}) {
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* Provider 节点池 Card */}
          <Card
            title="Provider 节点池"
            extra={
              <Space>
                <Segmented
                  value={props.nodeTypeFilter}
                  onChange={(v) => props.setNodeTypeFilter(v as ProviderNodeType)}
                  options={[
                    { value: 'text', label: '文本生成' },
                    { value: 'image', label: '文生图' },
                  ]}
                />
                <Button loading={props.batchTesting} onClick={props.runBatchTest}>
                  批量测试
                </Button>
                <Button type="primary" onClick={() => props.openEdit()}>
                  新增节点
                </Button>
              </Space>
            }
          >
            {/* 节点池分组渲染 - 复用原逻辑 */}
            {Object.entries(props.groupedProviders).map(([groupKey, { baseURL, groupName, nodes }]) => {
              const isExpanded = props.nodeGroupExpanded[groupKey] ?? true
              return (
                <div key={groupKey} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--ant-color-fill-quaternary)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      marginBottom: 8,
                    }}
                    onClick={() => props.toggleGroup(groupKey)}
                  >
                    <Space>
                      {isExpanded ? <DownOutlined style={{ fontSize: 12 }} /> : <UpOutlined style={{ fontSize: 12, transform: 'rotate(180deg)' }} />}
                      <Typography.Text strong style={{ fontSize: 13 }}>{groupName}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{baseURL}</Typography.Text>
                      <Tag color="blue">{nodes.length} 个节点</Tag>
                    </Space>
                  </div>
                  {isExpanded && (
                    <Table
                      rowKey="id"
                      columns={props.columns}
                      dataSource={nodes}
                      pagination={false}
                      size="middle"
                      style={{ marginBottom: 0 }}
                      scroll={{ x: 750 }}
                    />
                  )}
                </div>
              )
            })}
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              统一 OpenAI 兼容格式；测试经本地后端 Provider 抽象层调用（/api/llm/test → GET /v1/models）。节点选择策略（最久未用 + 最少连接、429 冷却恢复）待后续完善。
            </Typography.Paragraph>
          </Card>

          {/* 模块映射 Card - 精简版，原逻辑保持 */}
          <Card title="模块 → 模型映射（各模块指定节点，模型随节点配置）">
            <Table
              rowKey="key"
              pagination={false}
              size="middle"
              scroll={{ x: 800 }}
              dataSource={(Object.keys(props.MODULE_LABELS) as ModuleKey[]).map((key) => ({
                key,
                label: props.MODULE_LABELS[key],
                ...props.moduleMapping[key],
              }))}
              columns={[
                { title: '模块', dataIndex: 'label', width: 160, fixed: 'left' as const },
                {
                  title: '节点（模型随节点配置）',
                  dataIndex: 'nodeId',
                  width: 300,
                  render: (v: string | null, row: { key: ModuleKey }) => (
                    <Select
                      style={{ minWidth: 200, width: '100%' }}
                      value={v ?? undefined}
                      placeholder="选择节点"
                      options={props.providers
                        .filter((p) => p.nodeType !== 'image')
                        .map((p) => ({ value: p.id, label: `${p.name} · ${p.model || '（未设模型）'}` }))}
                      onChange={(nodeId) => {
                        props.setState({
                          moduleMapping: {
                            ...props.moduleMapping,
                            [row.key]: { nodeId },
                          },
                        })
                      }}
                    />
                  ),
                },
                {
                  title: '将使用模型',
                  key: 'model',
                  width: 200,
                  render: (_: unknown, row: any) => {
                    const node = props.providers.find((p) => p.id === row.nodeId)
                    return node?.model ? <Tag>{node.model}</Tag> : <Typography.Text type="secondary">—</Typography.Text>
                  },
                },
              ]}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              模型名在「Provider 节点池」里为每个节点统一配置；此处仅选择节点。如需某模块用不同模型，请新建一个配置了该模型的节点。
            </Typography.Paragraph>
          </Card>

          {/* M1 清理提示词 Card */}
          <Card
            title="M1 清理提示词（默认）"
            extra={
              <Space>
                <Button
                  loading={props.loadingPrompt}
                  onClick={async () => {
                    props.setLoadingPrompt(true)
                    try {
                      const p = await props.getDefaultPrompt()
                      props.setDraftPrompt(p)
                    } finally {
                      props.setLoadingPrompt(false)
                    }
                  }}
                >
                  载入内置默认
                </Button>
                <Button disabled={props.draftPrompt === props.m1SystemPrompt} onClick={() => props.setState({ m1SystemPrompt: props.draftPrompt })}>
                  保存
                </Button>
                <Button disabled={!props.m1SystemPrompt} onClick={() => { props.setDraftPrompt(''); props.setState({ m1SystemPrompt: '' }) }}>
                  清空（用内置）
                </Button>
              </Space>
            }
          >
            <Input.TextArea
              value={props.draftPrompt}
              onChange={(e) => props.setDraftPrompt(e.target.value)}
              autoSize={{ minRows: 6, maxRows: 16 }}
              placeholder="留空则使用后端内置默认提示词。点「载入内置默认」可查看并在此基础上修改。"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              {props.m1SystemPrompt ? `已保存自定义提示词（${props.m1SystemPrompt.length} 字）。清理时优先使用它。` : '当前为空——清理时使用后端内置默认提示词。'}
              {' M1 第三步可再为单次任务临时覆盖。'}
            </Typography.Paragraph>
          </Card>

          {/* 测试文本 Card - 精简版 */}
          <Card title="测试文本" extra={
            <Space>
              <Button onClick={() => props.setState({ m1TestText: props.draftTestText })} disabled={props.draftTestText === props.m1TestText}>保存</Button>
              <Button onClick={() => props.setState({ m1TestText: '' })}>清空</Button>
            </Space>
          }>
            <Input.TextArea
              value={props.draftTestText}
              onChange={(e) => props.setDraftTestText(e.target.value)}
              autoSize={{ minRows: 6, maxRows: 16 }}
              placeholder="用于「测试」按钮与并发测试的文本"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Card>
        </Space>
      </div>
    </div>
  )
}
