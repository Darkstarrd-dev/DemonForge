import { useEffect, useState } from 'react'
import { Image, Button, Space, Dropdown, Typography, Tooltip, Popconfirm } from 'antd'
import { CopyOutlined, DownloadOutlined, SnippetsOutlined, RedoOutlined, DeleteOutlined } from '@ant-design/icons'
import { App } from 'antd'
import { parseImageMeta, copyImageToClipboard, saveImageAs } from '../../utils/imageResult'

interface Props {
  dataUrl: string
  revisedPrompt?: string
  genMs?: number
  onAsInput: (dataUrl: string) => void
  onRetry?: () => void
  onDelete?: () => void
  busy?: boolean
}

export default function ResultImage({ dataUrl, revisedPrompt, genMs, onAsInput, onRetry, onDelete, busy }: Props) {
  const { message } = App.useApp()
  const [meta, setMeta] = useState<{ format: string; width: number; height: number; hasAlpha?: boolean } | null>(null)

  useEffect(() => {
    parseImageMeta(dataUrl).then(setMeta).catch(() => {})
  }, [dataUrl])

  const handleCopy = async () => {
    const ok = await copyImageToClipboard(dataUrl)
    if (ok) message.success('已复制到剪贴板')
    else message.error('复制失败')
  }

  const handleSave = (format: 'png' | 'jpeg' | 'webp') => {
    saveImageAs(dataUrl, format)
      .then(() => message.success('已保存'))
      .catch(() => message.error('保存失败'))
  }

  return (
    <div>
      <Image
        src={dataUrl}
        style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: 12, display: 'block', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', objectFit: 'contain' }}
        preview={{}}
      />
      {meta && (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
          {meta.format} · {meta.width}×{meta.height}
          {meta.hasAlpha !== undefined && (meta.hasAlpha ? ' · 含透明通道' : ' · 无透明通道')}
          {typeof genMs === 'number' && ` · 生成耗时 ${(genMs / 1000).toFixed(1)}s`}
        </Typography.Text>
      )}
      {revisedPrompt && (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          模型改写：{revisedPrompt}
        </Typography.Text>
      )}
      <Space style={{ marginTop: 8 }} size={8}>
        <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
          复制
        </Button>
        <Button size="small" icon={<SnippetsOutlined />} onClick={() => onAsInput(dataUrl)}>
          作为输入
        </Button>
        <Dropdown
          menu={{
            items: [
              { key: 'png', label: 'PNG', onClick: () => handleSave('png') },
              { key: 'jpeg', label: 'JPEG', onClick: () => handleSave('jpeg') },
              { key: 'webp', label: 'WEBP', onClick: () => handleSave('webp') },
            ],
          }}
        >
          <Button size="small" icon={<DownloadOutlined />}>
            保存
          </Button>
        </Dropdown>
        {onRetry && (
          <Tooltip title="重试">
            <Button size="small" icon={<RedoOutlined />} onClick={onRetry} disabled={busy} />
          </Tooltip>
        )}
        {onDelete && (
          <Popconfirm title="删除该图片？" onConfirm={onDelete} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Tooltip title="删除">
              <Button size="small" icon={<DeleteOutlined />} disabled={busy} />
            </Tooltip>
          </Popconfirm>
        )}
      </Space>
    </div>
  )
}
