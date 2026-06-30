// 调试日志面板 —— Step3Clean 底部 Collapse，记录每条请求/响应/错误。
// 受控组件：entries + filter + onChangeFilter/onClear 由父级管。
import { Button, List, Radio, Space, theme, Typography } from 'antd'

export interface DebugEntry {
  chapterId: string
  id: number
  title: string
  type: 'request' | 'response' | 'error'
  timestamp: number
  nodeName?: string
  nodeId?: string
  model?: string
  batchSize?: number
  contentLength?: number
  requestBody?: Record<string, unknown>
  statusCode?: number
  responseBody?: string
  chunksCount?: number
  error?: string
  outputLength?: number
  firstBytesAt?: number
}

export type DebugFilter = 'all' | 'request' | 'response' | 'error'

export interface DebugLogPanelProps {
  entries: DebugEntry[]
  filter: DebugFilter
  onChangeFilter: (f: DebugFilter) => void
  onClear: () => void
}

export default function DebugLogPanel({ entries, filter, onChangeFilter, onClear }: DebugLogPanelProps) {
  const { token } = theme.useToken()
  return (
    <div data-slot="step3-debug-log">
      <Space style={{ marginBottom: 8 }}>
        <Radio.Group
          size="small"
          optionType="button"
          buttonStyle="solid"
          value={filter}
          onChange={(e) => onChangeFilter(e.target.value)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'request', label: '请求' },
            { value: 'response', label: '响应' },
            { value: 'error', label: '错误' },
          ]}
        />
        <Button size="small" disabled={!entries.length} onClick={onClear}>
          清空日志
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          每条请求显示实际 batchSize（1=单章请求，&gt;1=批量请求）
        </Typography.Text>
      </Space>
      {entries.length === 0 ? (
        <Typography.Text type="secondary">暂无记录</Typography.Text>
      ) : (
        <List
          size="small"
          dataSource={[...entries].reverse().filter((e) => filter === 'all' || e.type === filter)}
          renderItem={(e) => {
            const time = new Date(e.timestamp).toLocaleTimeString()
            const color = e.type === 'request' ? 'blue' : e.type === 'error' ? 'red' : 'green'
            const reqTs = entries.find((x) => x.chapterId === e.chapterId && x.type === 'request')?.timestamp
            const elapsed = reqTs ? e.timestamp - reqTs : undefined
            return (
              <List.Item style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0', display: 'block' }}>
                <div style={{ marginBottom: 4 }}>
                  <Space size={4} wrap>
                    <Typography.Text
                      style={{
                        margin: 0,
                        fontSize: 11,
                        color,
                        fontWeight: 600,
                        background: token.colorBgContainer,
                        padding: '0 4px',
                        borderRadius: 2,
                      }}
                    >
                      {e.type === 'request' ? 'REQ' : e.type === 'error' ? 'ERR' : 'RES'}
                    </Typography.Text>
                    <Typography.Text style={{ fontSize: 12 }}>{time}</Typography.Text>
                    <Typography.Text strong style={{ fontSize: 12 }}>
                      {e.title}
                    </Typography.Text>
                    {e.nodeName && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {e.nodeName}
                      </Typography.Text>
                    )}
                    {e.type === 'request' && (
                      <>
                        {e.batchSize != null && (
                          <Typography.Text
                            type={e.batchSize > 1 ? 'warning' : 'secondary'}
                            style={{ fontSize: 11 }}
                          >
                            {e.batchSize > 1 ? `批量 ${e.batchSize} 章` : '单章'}
                          </Typography.Text>
                        )}
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          原文 {e.contentLength} 字
                        </Typography.Text>
                      </>
                    )}
                    {e.type === 'response' && e.contentLength != null && e.outputLength != null && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {e.contentLength} → {e.outputLength} 字
                      </Typography.Text>
                    )}
                    {(e.type === 'response' || e.type === 'error') && e.statusCode != null && (
                      <Typography.Text
                        type={e.statusCode < 400 ? 'success' : 'danger'}
                        style={{ fontSize: 11 }}
                      >
                        HTTP {e.statusCode}
                      </Typography.Text>
                    )}
                    {e.type === 'response' && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {e.chunksCount} chunks
                      </Typography.Text>
                    )}
                    {e.firstBytesAt != null && reqTs != null && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        首字节 {(e.firstBytesAt - reqTs) / 1000}s
                      </Typography.Text>
                    )}
                    {elapsed != null && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        耗时 {(elapsed / 1000).toFixed(1)}s
                      </Typography.Text>
                    )}
                    {e.type === 'error' && e.error && (
                      <Typography.Text type="danger" style={{ fontSize: 11 }}>
                        {e.chunksCount != null ? `${e.chunksCount} chunks · ` : ''}
                        {e.error}
                      </Typography.Text>
                    )}
                  </Space>
                </div>
                {e.requestBody && (
                  <div
                    style={{
                      background: token.colorBgBase === '#ffffff' ? '#1f2428' : '#0d1117',
                      color: token.colorBgBase === '#ffffff' ? '#c9d1d9' : '#e6edf3',
                      padding: '6px 10px',
                      borderRadius: 4,
                      fontFamily: 'monospace',
                      fontSize: 11,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      marginTop: 2,
                    }}
                  >
                    {JSON.stringify(e.requestBody, null, 2)}
                  </div>
                )}
                {e.responseBody && (
                  <div
                    style={{
                      background:
                        e.type === 'error'
                          ? token.colorBgBase === '#ffffff'
                            ? '#fff1f0'
                            : 'rgba(255, 77, 79, 0.1)'
                          : token.colorBgBase === '#ffffff'
                            ? '#fffbe6'
                            : 'rgba(215, 5, 5, 0.1)',
                      color: token.colorText,
                      padding: '6px 10px',
                      borderRadius: 4,
                      fontFamily: 'monospace',
                      fontSize: 11,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxHeight: 200,
                      overflow: 'auto',
                      marginTop: 2,
                    }}
                  >
                    {e.responseBody}
                  </div>
                )}
              </List.Item>
            )
          }}
        />
      )}
    </div>
  )
}
