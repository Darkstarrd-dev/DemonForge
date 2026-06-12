import { useState } from 'react'
import { Alert, Button, Descriptions, Select, Space, Typography, Upload } from 'antd'
import { FileTextOutlined, InboxOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { detectEncoding, decodeBuffer, SUPPORTED_ENCODINGS } from '../../utils/encoding'
import { DEMO_RAW_TEXT, DEMO_RAW_FILENAME } from '../../mocks/demoRaw'

export default function Step1Import() {
  const session = useAppStore((s) => s.importSession)
  const setState = useAppStore((s) => s.setState)
  // 原始字节留在内存（不持久化），用于切换编码重解码
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)

  const loadFile = async (file: File) => {
    const buf = await file.arrayBuffer()
    setBuffer(buf)
    const detected = detectEncoding(buf)
    const { text, used } = decodeBuffer(buf, detected.encoding)
    setState({
      importSession: {
        fileName: file.name,
        rawText: text,
        encoding: used,
        detectedEncoding: `${detected.encoding}（${
          { bom: 'BOM 标记', heuristic: '启发式评分', fallback: '默认回退' }[detected.source]
        }）`,
        step: 0,
        chapters: [],
      },
    })
    return false
  }

  const loadDemo = () => {
    setBuffer(null)
    setState({
      importSession: {
        fileName: DEMO_RAW_FILENAME,
        rawText: DEMO_RAW_TEXT,
        encoding: 'utf-8',
        detectedEncoding: 'utf-8（内置演示文本）',
        step: 0,
        chapters: [],
      },
    })
  }

  const switchEncoding = (enc: string) => {
    if (!session) return
    if (!buffer) {
      // 演示文本或刷新后原始字节已失：无法重解码
      setState({ importSession: { ...session, encoding: enc } })
      return
    }
    const { text, used } = decodeBuffer(buffer, enc)
    setState({ importSession: { ...session, rawText: text, encoding: used } })
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Upload.Dragger
        accept=".txt"
        showUploadList={false}
        beforeUpload={loadFile}
        style={{ padding: 8 }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">拖拽或点击选择 raw TXT 文件</p>
        <p className="ant-upload-hint">编码自动检测（BOM + UTF-8/GBK 启发式评分），可手动切换重解码</p>
      </Upload.Dragger>
      <Button icon={<FileTextOutlined />} onClick={loadDemo}>
        载入内置演示文件（含混杂标题 / 广告 / 乱码）
      </Button>

      {session && (
        <>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="文件名">{session.fileName}</Descriptions.Item>
            <Descriptions.Item label="文本长度">{session.rawText.length} 字符</Descriptions.Item>
            <Descriptions.Item label="检测结果">{session.detectedEncoding}</Descriptions.Item>
            <Descriptions.Item label="当前编码">
              <Select
                size="small"
                style={{ minWidth: 130 }}
                value={session.encoding}
                options={SUPPORTED_ENCODINGS.map((e) => ({ value: e, label: e }))}
                onChange={switchEncoding}
              />
              {!buffer && (
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  （演示文本/会话恢复，无原始字节可重解码）
                </Typography.Text>
              )}
            </Descriptions.Item>
          </Descriptions>
          <div
            className="prose-view"
            style={{
              maxHeight: 240,
              overflow: 'auto',
              border: '1px solid #f0f0f0',
              borderRadius: 6,
              padding: 12,
            }}
          >
            {session.rawText.slice(0, 2000)}
            {session.rawText.length > 2000 && '\n……（预览前 2000 字符）'}
          </div>
          {session.rawText.includes('�') && (
            <Alert type="warning" showIcon message="文本含替换字符（�），可能编码不正确，请尝试切换编码。" />
          )}
          <Button
            type="primary"
            onClick={() => setState({ importSession: { ...session, step: 1 } })}
          >
            下一步：章节分割
          </Button>
        </>
      )}
    </Space>
  )
}
