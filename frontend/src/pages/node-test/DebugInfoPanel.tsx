import { useState } from 'react'
import type { CSSProperties } from 'react'
import { App, Button, Collapse, Space, Typography, theme } from 'antd'
import { CloseOutlined, CopyOutlined, ExpandAltOutlined, CompressOutlined } from '@ant-design/icons'

export interface SseChunk {
  line: string
  json: unknown | null
}

export interface DebugInfoData {
  previewBody: object | null
  actualBody: object | null
  sseChunks: SseChunk[]
}

interface Props {
  data: DebugInfoData
  onClose: () => void
}

/** 从 chunk json 提取显示字段名（delta 的第一个 key，或 usage/[DONE]） */
function extractField(json: unknown | null): string {
  if (json === null) return '[DONE]'
  try {
    const j = json as { choices?: Array<{ delta?: Record<string, unknown> }>; usage?: unknown }
    if (Array.isArray(j.choices) && j.choices.length > 0) {
      const delta = j.choices[0].delta
      if (delta) {
        const keys = Object.keys(delta)
        if (keys.length > 0) return keys[0]
      }
      return 'choices'
    }
    if (j.usage) return 'usage'
    return 'chunk'
  } catch {
    return 'chunk'
  }
}

/** 从 chunk json 提取 id */
function extractId(json: unknown | null): string {
  if (json === null) return ''
  try {
    const j = json as { id?: string }
    return j.id ?? ''
  } catch {
    return ''
  }
}

export default function DebugInfoPanel({ data, onClose }: Props) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const [chunkActiveKeys, setChunkActiveKeys] = useState<string[]>([])

  const preStyle: CSSProperties = {
    background: token.colorBgContainer,
    border: `1px solid ${token.colorBorder}`,
    borderRadius: 6,
    padding: 8,
    fontSize: 11,
    color: token.colorText,
    maxHeight: 300,
    overflow: 'auto',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    margin: 0,
  }

  const copyText = (text: string, okMsg = '已复制') => {
    navigator.clipboard.writeText(text).then(() => message.success(okMsg)).catch(() => message.error('复制失败'))
  }

  const copyAll = () => {
    const parts: string[] = []
    if (data.previewBody) parts.push('=== preview request body ===\n' + JSON.stringify(data.previewBody, null, 2))
    if (data.actualBody) parts.push('=== actual request body ===\n' + JSON.stringify(data.actualBody, null, 2))
    if (data.sseChunks.length > 0) {
      parts.push('=== response sse ===')
      data.sseChunks.forEach((c, i) => {
        parts.push(`#${i + 1}`)
        parts.push(c.json === null ? '[DONE]' : JSON.stringify(c.json, null, 2))
      })
    }
    copyText(parts.join('\n\n'), '已复制全部内容')
  }

  const expandAllChunks = () => setChunkActiveKeys(data.sseChunks.map((_, i) => `chunk-${i}`))
  const collapseAllChunks = () => setChunkActiveKeys([])

  const hasAny = data.previewBody || data.actualBody || data.sseChunks.length > 0

  const outerItems = []
  if (data.previewBody) {
    outerItems.push({
      key: 'preview',
      label: 'preview request body',
      children: <pre style={preStyle}>{JSON.stringify(data.previewBody, null, 2)}</pre>,
      extra: <Button size="small" type="text" icon={<CopyOutlined />} onClick={(e) => { e.stopPropagation(); copyText(JSON.stringify(data.previewBody, null, 2)) }} />,
    })
  }
  if (data.actualBody) {
    outerItems.push({
      key: 'actual',
      label: 'actual request body',
      children: <pre style={preStyle}>{JSON.stringify(data.actualBody, null, 2)}</pre>,
      extra: <Button size="small" type="text" icon={<CopyOutlined />} onClick={(e) => { e.stopPropagation(); copyText(JSON.stringify(data.actualBody, null, 2)) }} />,
    })
  }
  outerItems.push({
    key: 'sse',
    label: `response sse (${data.sseChunks.length})`,
    children: data.sseChunks.length === 0 ? (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>(无响应)</Typography.Text>
    ) : (
      <div>
        <Space size={8} style={{ marginBottom: 8 }}>
          <Button size="small" icon={<CopyOutlined />} onClick={copyAll}>copy all</Button>
          <Button size="small" icon={<ExpandAltOutlined />} onClick={expandAllChunks}>expand all</Button>
          <Button size="small" icon={<CompressOutlined />} onClick={collapseAllChunks}>collapse all</Button>
        </Space>
        <Collapse
          ghost
          size="small"
          activeKey={chunkActiveKeys}
          onChange={(k) => setChunkActiveKeys(k as string[])}
          items={data.sseChunks.map((c, i) => {
            const field = extractField(c.json)
            const id = extractId(c.json)
            return {
              key: `chunk-${i}`,
              label: (
                <span style={{ fontSize: 11 }}>
                  <strong>#{i + 1}</strong>
                  {id && <span style={{ color: token.colorTextSecondary, marginLeft: 8 }}>{id}</span>}
                  <span style={{ color: token.colorPrimary, marginLeft: 8 }}>• {field}</span>
                </span>
              ),
              children: <pre style={preStyle}>{c.json === null ? '[DONE]' : JSON.stringify(c.json, null, 2)}</pre>,
            }
          })}
        />
      </div>
    ),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
        <Typography.Title level={5} style={{ margin: 0, color: token.colorText }}>Debug Information</Typography.Title>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {!hasAny ? (
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
            发送消息后将显示调试信息
          </Typography.Text>
        ) : (
          <Collapse
            ghost
            activeKey={activeKeys}
            onChange={(k) => setActiveKeys(k as string[])}
            items={outerItems}
          />
        )}
      </div>
    </div>
  )
}
