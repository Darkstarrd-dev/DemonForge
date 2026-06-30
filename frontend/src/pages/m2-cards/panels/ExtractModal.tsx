// M2 设定卡片 · 从章节提取设定 Modal（含进度显示）。
// 受控组件：open/extractForm/extracting/extractProgress + 回调由父级传入。
import { Form, Modal, Progress, Select, Space, Typography } from 'antd'
import type { FormInstance } from 'antd'
import type { Book, Chapter } from '../../../services/types'
import type { ExtractProgress } from '../../../services/api'

export interface ExtractModalProps {
  open: boolean
  extracting: boolean
  extractProgress: ExtractProgress | null
  books: Book[]
  chapters: Chapter[]
  currentBookId: string
  extractForm: FormInstance<{ bookId: string }>
  onOk: () => void
  onCancel: () => void
}

export default function ExtractModal({
  open,
  extracting,
  extractProgress,
  books,
  chapters,
  currentBookId,
  extractForm,
  onOk,
  onCancel,
}: ExtractModalProps) {
  return (
    <Modal
      title="从章节提取设定"
      open={open}
      onOk={onOk}
      confirmLoading={extracting}
      onCancel={() => !extracting && onCancel()}
      okText={extracting ? '提取中…' : '开始提取'}
      cancelButtonProps={{ disabled: extracting }}
    >
      <Form form={extractForm} layout="vertical" initialValues={{ bookId: currentBookId }} style={{ marginTop: 8 }}>
        <Form.Item name="bookId" label="选择书籍" rules={[{ required: true }]}>
          <Select
            disabled={extracting}
            options={books.map((b) => ({
              value: b.id,
              label: `${b.title}（${b.type === 'project' ? '作品' : '素材'}·${chapters.filter((c) => c.bookId === b.id).length} 章）`,
            }))}
          />
        </Form.Item>
        {extracting && extractProgress && (
          <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
            <Progress
              percent={Math.round((extractProgress.current / extractProgress.total) * 100)}
              status="active"
            />
            <Typography.Text type="secondary">
              {extractProgress.stage === 'extracting' && `正在分块提取：${extractProgress.current}/${extractProgress.total}`}
              {extractProgress.stage === 'merging' && `正在合并去重：${extractProgress.current}/${extractProgress.total}`}
              {extractProgress.stage === 'embedding' && `正在生成向量：${extractProgress.current}/${extractProgress.total}`}
              {extractProgress.message && ` - ${extractProgress.message}`}
            </Typography.Text>
          </Space>
        )}
        {!extracting && (
          <Typography.Text type="secondary">
            流程：LLM 分块抽取 → 合并去重 → embedding 相似度检测 → 生成卡片（含出处引用）
          </Typography.Text>
        )}
      </Form>
    </Modal>
  )
}
