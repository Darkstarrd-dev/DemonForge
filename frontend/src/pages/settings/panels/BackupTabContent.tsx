import { Alert, Button, Card, Checkbox, Modal, Space, Typography, Upload } from 'antd'
import { CloudDownloadOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons'

export default function BackupTabContent(props: {
  exportRedact: boolean
  setExportRedact: (v: boolean) => void
  handleExport: (kind: 'settings' | 'full') => void
  handleImportFile: (file: File) => Promise<boolean>
  importPreview: any
  setImportPreview: (v: any) => void
  confirmImportSettings: (bundle: any, replaceBusiness: boolean) => void
  clearBusinessThenImport: (bundle: any) => void
  importBusy: boolean
}) {
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="导出" extra={
            <Checkbox checked={props.exportRedact} onChange={(e) => props.setExportRedact(e.target.checked)}>
              脱敏 API Key
            </Checkbox>
          }>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={() => props.handleExport('settings')}>
                导出设置
              </Button>
              <Button icon={<CloudDownloadOutlined />} onClick={() => props.handleExport('full')}>
                导出完整备份
              </Button>
            </Space>
          </Card>

          <Card title="导入">
            <Upload beforeUpload={props.handleImportFile} showUploadList={false} accept=".json">
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Card>

          {props.importPreview && (
            <Modal
              open
              title={`导入预览：${props.importPreview.filename}`}
              onCancel={() => props.setImportPreview(null)}
              footer={[
                <Button key="cancel" onClick={() => props.setImportPreview(null)}>取消</Button>,
                <Button
                  key="import"
                  type="primary"
                  loading={props.importBusy}
                  onClick={() => props.confirmImportSettings(props.importPreview.bundle, props.importPreview.bundle.kind === 'full')}
                >
                  确认导入
                </Button>,
                props.importPreview.bundle.kind === 'full' && (
                  <Button
                    key="clear"
                    danger
                    loading={props.importBusy}
                    onClick={() => props.clearBusinessThenImport(props.importPreview.bundle)}
                  >
                    清空并导入
                  </Button>
                ),
              ]}
            >
              {props.importPreview.warnings.length > 0 && (
                <Alert type="warning" message="警告" description={props.importPreview.warnings.join('; ')} style={{ marginBottom: 16 }} />
              )}
              <Typography.Paragraph>
                类型：{props.importPreview.bundle.kind === 'full' ? '完整备份' : '设置'}
              </Typography.Paragraph>
            </Modal>
          )}
        </Space>
      </div>
    </div>
  )
}
