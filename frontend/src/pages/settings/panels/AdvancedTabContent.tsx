import { useEffect, useState } from 'react'
import { App, Button, Card, Input, Space, Typography } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
import { pushSettingsNow, useAppStore } from '../../../store/appStore'

export default function AdvancedTabContent(props: {
  draftDir: string
  setDraftDir: (v: string) => void
  assetDir: string
  applyingDir: boolean
  applyAssetDir: () => void
}) {
  const { message } = App.useApp()
  const imageArchiveDir = useAppStore((s) => s.imageArchiveDir)
  const setStateImg = useAppStore((s) => s.setState)
  // 后端解析的默认绝对目录（仅 dataDir/assets、dataDir/images 等默认值，配置非空时直接显示配置值，免竞态）
  const [resolved, setResolved] = useState<{ assetDir: string; imageDir: string; dataDir: string } | null>(null)

  // 默认目录不会变，挂载时拉一次即可
  useEffect(() => {
    fetch('/api/settings/resolved-paths')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setResolved(d))
      .catch(() => {})
  }, [])

  // 配置非空 → 该值即实际绝对目录；留空 → 用后端解析的默认目录
  const assetActual = props.assetDir.trim() ? props.assetDir : resolved?.assetDir
  const imageActual = imageArchiveDir.trim() ? imageArchiveDir : resolved?.imageDir

  const pickImageDir = async () => {
    const dir = await window.electronAPI?.pickDirectory?.()
    if (dir) {
      setStateImg({ imageArchiveDir: dir })
      pushSettingsNow()
    }
  }
  const pickAssetDir = async () => {
    const dir = await window.electronAPI?.pickDirectory?.()
    if (dir) props.setDraftDir(dir)
  }
  const openDir = async (dir?: string) => {
    if (!dir) {
      message.warning('目录尚未就绪')
      return
    }
    const err = await window.electronAPI?.openPath?.(dir)
    if (err) message.error(`打开目录失败：${err}`)
  }
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="资产目录" extra={
            <Space>
              {window.electronAPI?.pickDirectory && <Button onClick={pickAssetDir}>选择目录</Button>}
              {window.electronAPI?.openPath && <Button icon={<FolderOpenOutlined />} onClick={() => openDir(assetActual)}>打开目录</Button>}
              <Button type="primary" loading={props.applyingDir} onClick={props.applyAssetDir} disabled={props.draftDir === props.assetDir}>
                应用
              </Button>
            </Space>
          }>
            <Input
              value={props.draftDir}
              onChange={(e) => props.setDraftDir(e.target.value)}
              placeholder="留空使用默认目录（数据目录/assets）"
              style={{ marginBottom: 8 }}
            />
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              当前实际目录：{assetActual || '（加载中…）'}
            </Typography.Paragraph>
          </Card>

          <Card title="图片保存目录" extra={
            <Space>
              {window.electronAPI?.pickDirectory && <Button onClick={pickImageDir}>选择目录</Button>}
              {window.electronAPI?.openPath && <Button icon={<FolderOpenOutlined />} onClick={() => openDir(imageActual)}>打开目录</Button>}
              <Button onClick={() => { setStateImg({ imageArchiveDir: '' }); pushSettingsNow() }} disabled={!imageArchiveDir}>恢复默认</Button>
            </Space>
          }>
            <Input
              value={imageArchiveDir}
              onChange={(e) => setStateImg({ imageArchiveDir: e.target.value })}
              onBlur={() => pushSettingsNow()}
              placeholder="留空使用默认目录（数据目录/images）"
              style={{ marginBottom: 8 }}
            />
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              文生图结果按此目录归档：带透明通道存 PNG，否则转 WebP；文件名按日期命名。当前实际目录：{imageActual || '（加载中…）'}
            </Typography.Paragraph>
          </Card>
        </Space>
      </div>
    </div>
  )
}
