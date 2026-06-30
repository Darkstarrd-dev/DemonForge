// 沉浸式阅读器 · AI 清理双栏面板（原文 vs 流式/审阅后）。
// 受控组件：所有 phase/state 由父级管。
import { Button } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { Chapter, LineDecision } from '../../../services/types'
import DiffView from '../../m1-import/DiffView'

export type CleanPhase = 'selecting' | 'streaming' | 'review' | 'error'

export interface AiCleanPanelProps {
  cleanChapter: Chapter | null
  cleanPhase: CleanPhase
  cleanedContent: string | null
  liveAcc: string
  fontSize: number
  lineDecisions: Record<number, LineDecision>
  onLineDecide: (idx: number, decision: LineDecision | null) => void
  cleanError: string | null
  onRetry: () => void
}

export default function AiCleanPanel({
  cleanChapter,
  cleanPhase,
  cleanedContent,
  liveAcc,
  fontSize,
  lineDecisions,
  onLineDecide,
  cleanError,
  onRetry,
}: AiCleanPanelProps) {
  if (!cleanChapter) return null
  return (
    <div className="imm-clean-wrapper">
      <div className="imm-dual-pane">
        <div className="imm-clean-left">
          <div className="imm-clean-pane-head">原文</div>
          <div className="imm-clean-pane-body">
            <div style={{ whiteSpace: 'pre-wrap', fontSize: Math.max(13, fontSize - 2), lineHeight: 1.6 }}>
              {cleanChapter.content}
            </div>
          </div>
        </div>
        <div className="imm-clean-right">
          <div className="imm-clean-pane-head">审阅后</div>
          <div className="imm-clean-pane-body">
            {cleanPhase === 'streaming' && (
              <div className="imm-clean-stream">
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: Math.max(13, fontSize - 2), lineHeight: 1.6, margin: 0 }}>
                  {liveAcc || '等待响应…'}
                </pre>
              </div>
            )}
            {cleanPhase === 'review' && cleanedContent && (
              <DiffView
                original={cleanChapter.content}
                cleaned={cleanedContent}
                decisions={lineDecisions}
                onDecide={onLineDecide}
                autoScrollToFirstDiff
              />
            )}
            {cleanPhase === 'error' && (
              <div style={{ padding: 24, color: 'var(--imm-muted)', textAlign: 'center' }}>
                <div style={{ marginBottom: 12, color: '#ff4d4f' }}>清理失败：{cleanError || '未知错误'}</div>
                <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
                  重选节点
                </Button>
              </div>
            )}
            {cleanPhase === 'selecting' && (
              <div style={{ padding: 24, color: 'var(--imm-muted)', textAlign: 'center' }}>
                请在左侧面板选择清理节点
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
