import { Alert, Button, Card, Col, Input, Modal, Row, Space, Tag, Typography } from 'antd'
import type { ResolvedProviderNode } from '../../../services/types'

interface NodeTestPanelProps {
  testResult: {
    node: ResolvedProviderNode
    ok: boolean
    models: string[]
    error?: string
  } | null
  setTestResult: (v: {
    node: ResolvedProviderNode
    ok: boolean
    models: string[]
    error?: string
  } | null) => void
  onApplyTestModel: (model: string) => void
  concurrencyResult: {
    node: ResolvedProviderNode
    log: string[]
    maxConcurrency?: number
    intervalSec?: number
    error?: string
  } | null
  setConcurrencyResult: (v: {
    node: ResolvedProviderNode
    log: string[]
    maxConcurrency?: number
    intervalSec?: number
    error?: string
  } | null) => void
  onApplyConcurrencyParams: () => void
  testingNode: ResolvedProviderNode | null
  setTestingNode: (v: ResolvedProviderNode | null) => void
  testStreaming: boolean
  testStreamLeft: string
  testStreamRight: string
  onStartRealTest: () => Promise<void>
  m1SystemPrompt: string
  m1TestText: string
}

export default function NodeTestPanel(props: NodeTestPanelProps) {
  const {
    testResult,
    setTestResult,
    onApplyTestModel,
    concurrencyResult,
    setConcurrencyResult,
    onApplyConcurrencyParams,
    testingNode,
    setTestingNode,
    testStreaming,
    testStreamLeft,
    testStreamRight,
    onStartRealTest,
    m1SystemPrompt,
    m1TestText,
  } = props

  return (
    <>
      <Modal
        title={`连通性测试 — ${testResult?.node.name ?? ''}`}
        open={!!testResult}
        onCancel={() => setTestResult(null)}
        footer={<Button onClick={() => setTestResult(null)}>关闭</Button>}
        width={Math.min(600, window.innerWidth - 48)}
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
                    onChange={() => onApplyTestModel(m)}
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

      <Modal
        title={`测试节点：${testingNode?.name ?? ''}`}
        open={!!testingNode}
        onCancel={() => setTestingNode(null)}
        width={Math.min(1200, window.innerWidth - 48)}
        footer={[
          <Button key="close" onClick={() => setTestingNode(null)}>关闭</Button>,
          <Button
            key="test"
            type="primary"
            loading={testStreaming}
            onClick={onStartRealTest}
          >
            开始测试
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Typography.Text strong>清理提示词：</Typography.Text>
            <Input.TextArea
              value={m1SystemPrompt || '（当前为空，将使用后端内置默认提示词）'}
              readOnly
              autoSize={{ minRows: 3, maxRows: 6 }}
              style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: m1SystemPrompt ? 'inherit' : 'var(--ant-color-text-tertiary)' }}
            />
          </div>
          <div>
            <Typography.Text strong>测试文本：</Typography.Text>
            <Input.TextArea
              value={m1TestText}
              readOnly
              autoSize={{ minRows: 4, maxRows: 8 }}
              style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
          {testStreamLeft && (
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <Card size="small" title="原文" style={{ height: 400 }}>
                  <div style={{ height: 350, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                    {testStreamLeft}
                  </div>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title="清理结果" style={{ height: 400 }}>
                  <div style={{ height: 350, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                    {testStreamRight || (testStreaming ? '等待响应...' : '')}
                  </div>
                </Card>
              </Col>
            </Row>
          )}
        </Space>
      </Modal>

      <Modal
        title={`并发测试 — ${concurrencyResult?.node.name ?? ''}`}
        open={!!concurrencyResult}
        onCancel={() => setConcurrencyResult(null)}
        width={Math.min(700, window.innerWidth - 48)}
        footer={
          <Space>
            <Button onClick={() => setConcurrencyResult(null)}>关闭</Button>
            <Button
              type="primary"
              disabled={concurrencyResult?.maxConcurrency === undefined}
              onClick={onApplyConcurrencyParams}
            >
              应用推荐参数
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {concurrencyResult?.error && (
            <Alert type="error" showIcon message="测试失败" description={concurrencyResult.error} />
          )}
          {concurrencyResult?.maxConcurrency !== undefined && (
            <Alert
              type="success"
              showIcon
              message={`推荐参数：最大并发 ${concurrencyResult.maxConcurrency}，请求间隔 ${concurrencyResult.intervalSec}s`}
            />
          )}
          <Typography.Text type="secondary">探测过程：</Typography.Text>
          <pre style={{ background: 'var(--ant-color-fill-tertiary)', padding: 8, fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>
            {concurrencyResult?.log.join('\n')}
          </pre>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            通过逐级提高并发请求数（1→2→4→8→16）探测该节点可同时接受的任务数，遇到首个失败级别即回退。请求间隔由单请求耗时估算，仅供参考，可按「应用推荐参数」写回节点配置。
          </Typography.Paragraph>
        </Space>
      </Modal>
    </>
  )
}
