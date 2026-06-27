import { useState } from 'react'
import type { CSSProperties } from 'react'
import { App, Button, Collapse, Space, Typography, theme } from 'antd'
import { CloseOutlined, CopyOutlined, ExpandAltOutlined, CompressOutlined } from '@ant-design/icons'

// 类型已上移到 services/types.ts 共享（appStore 运行态注册表也需引用）；此处再导出保持兼容
export type { SseChunk, DebugInfoData } from '../../services/types'
import type { DebugInfoData } from '../../services/types'

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
  const allChunksExpanded = chunkActiveKeys.length === data.sseChunks.length && data.sseChunks.length > 0

  outerItems.push({
    key: 'sse',
    label: `response sse (${data.sseChunks.length})`,
    extra: data.sseChunks.length > 0 ? (
      <Space size={4}>
        <Button
          size="small"
          type="text"
          icon={<CopyOutlined />}
          onClick={(e) => { e.stopPropagation(); copyAll() }}
        />
        <Button
          size="small"
          type="text"
          icon={allChunksExpanded ? <CompressOutlined /> : <ExpandAltOutlined />}
          onClick={(e) => { e.stopPropagation(); if (allChunksExpanded) collapseAllChunks(); else expandAllChunks() }}
        />
      </Space>
    ) : undefined,
    children: data.sseChunks.length === 0 ? (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>(无响应)</Typography.Text>
    ) : (
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
