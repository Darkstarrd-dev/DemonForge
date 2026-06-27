import { Button, Card, Input, Space, Table, Tag, Typography } from 'antd'
import type { SplitPattern } from '../../../services/types'
import { pushSettingsNow, useAppStore } from '../../../store/appStore'

export default function AdvancedTabContent(props: {
  splitPatterns: SplitPattern[]
  openPatternEdit: (p?: SplitPattern) => void
  deletePattern: (p: SplitPattern) => void
  resetSplitPatterns: () => void
  draftDir: string
  setDraftDir: (v: string) => void
  assetDir: string
  applyingDir: boolean
  applyAssetDir: () => void
}) {
  const imageArchiveDir = useAppStore((s) => s.imageArchiveDir)
  const setStateImg = useAppStore((s) => s.setState)
  const pickImageDir = async () => {
    const dir = await window.electronAPI?.pickDirectory?.()
    if (dir) {
      setStateImg({ imageArchiveDir: dir })
      pushSettingsNow()
    }
  }
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="章节检测模式池" extra={
            <Space>
              <Button onClick={() => props.resetSplitPatterns()}>恢复默认</Button>
              <Button type="primary" onClick={() => props.openPatternEdit()}>新增模式</Button>
            </Space>
          }>
            <Table
              rowKey="key"
              pagination={false}
              size="middle"
              dataSource={props.splitPatterns}
              columns={[
                { title: '名称', dataIndex: 'label', width: 200 },
                { title: '正则表达式', dataIndex: 'regex', ellipsis: true },
                { title: '内置', dataIndex: 'builtin', width: 80, render: (v: boolean) => v ? <Tag>是</Tag> : <Tag>否</Tag> },
                {
                  title: '操作', key: 'actions', width: 150, render: (_: unknown, row: SplitPattern) => (
                    <Space size="small">
                      <Button size="small" onClick={() => props.openPatternEdit(row)}>编辑</Button>
                      <Button size="small" danger onClick={() => props.deletePattern(row)} disabled={row.key === 'custom'}>删除</Button>
                    </Space>
                  )
                }
              ]}
            />
          </Card>

          <Card title="资产目录" extra={
            <Button loading={props.applyingDir} onClick={props.applyAssetDir} disabled={props.draftDir === props.assetDir}>
              应用
            </Button>
          }>
            <Input
              value={props.draftDir}
              onChange={(e) => props.setDraftDir(e.target.value)}
              placeholder="留空使用默认目录（server/src/data/）"
              style={{ marginBottom: 8 }}
            />
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              当前生效：{props.assetDir || '（默认）'}
            </Typography.Paragraph>
          </Card>

          <Card title="图片保存目录" extra={
            <Space>
              {window.electronAPI?.pickDirectory && <Button onClick={pickImageDir}>选择目录</Button>}
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
              文生图结果按此目录归档：带透明通道存 PNG，否则转 WebP；文件名按日期命名。当前生效：{imageArchiveDir || '（默认 数据目录/images）'}
            </Typography.Paragraph>
          </Card>
        </Space>
      </div>
    </div>
  )
}
