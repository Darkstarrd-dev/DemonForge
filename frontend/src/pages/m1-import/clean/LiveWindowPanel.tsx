// 实时窗口面板 —— Step3Clean 右侧双栏（左：发送原文 / 右：流式输出）。
// 受控组件：viewingChapter + viewing(active) + liveAcc 由父级管。
import { Col, Row, Typography } from 'antd'

export interface LiveWindowPanelProps {
  /** 当前正在查看的章节（来自 active 或 selectedTask） */
  viewingChapter: { title: string; content: string; cleanStatus: string; cleanedContent?: string } | null
  /** 是否处于流式中（viewing 存在 + 流式进行） */
  streaming: boolean
  /** 流式累积文本（150ms 刷新） */
  liveAcc: string
}

export default function LiveWindowPanel({ viewingChapter, streaming, liveAcc }: LiveWindowPanelProps) {
  return (
    <Col xs={24} lg={16} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography.Title level={5} style={{ marginBottom: 8 }}>
        实时窗口（左：发送原文 / 右：流式输出）
        {viewingChapter && (
          <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
            {viewingChapter.title}
          </Typography.Text>
        )}
      </Typography.Title>
      <Row gutter={8} style={{ flex: 1, minHeight: 0 }}>
        <Col span={12} style={{ height: '100%' }}>
          <div
            className="stream-pane"
            style={{ background: '#1f2428', color: '#c9d1d9', height: '100%', overflow: 'auto' }}
          >
            {viewingChapter
              ? viewingChapter.cleanStatus === 'completed' || viewingChapter.cleanStatus === 'accepted'
                ? (viewingChapter.cleanedContent ?? viewingChapter.content)
                : viewingChapter.content
              : '（点击左侧列表项查看）'}
          </div>
        </Col>
        <Col span={12} style={{ height: '100%' }}>
          <div className="stream-pane" style={{ height: '100%', overflow: 'auto' }}>
            {streaming ? liveAcc || '等待响应…' : (viewingChapter?.cleanedContent ?? '等待响应…')}
          </div>
        </Col>
      </Row>
    </Col>
  )
}
