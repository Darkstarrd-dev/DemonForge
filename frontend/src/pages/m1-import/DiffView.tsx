import { useMemo, useState } from 'react'
import { Button, Input, Space, Tag, Tooltip } from 'antd'
import { CheckOutlined, CloseOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons'
import { alignedDiff, diffStats, type DiffRow } from '../../utils/alignedDiff'
import { retentionRate } from '../../utils/split'
import type { LineDecision } from '../../services/types'

interface Props {
  original: string
  cleaned: string
  decisions: Record<number, LineDecision>
  onDecide: (rowIdx: number, decision: LineDecision | null) => void
}

function renderParts(
  parts: { text: string; removed?: boolean; added?: boolean }[] | undefined,
  fallback: string,
) {
  if (!parts) return fallback
  return parts.map((p, i) => (
    <span key={i} className={p.removed ? 'diff-char-removed' : p.added ? 'diff-char-added' : undefined}>
      {p.text}
    </span>
  ))
}

export default function DiffView({ original, cleaned, decisions, onDecide }: Props) {
  const rows = useMemo(() => alignedDiff(original, cleaned), [original, cleaned])
  const stats = useMemo(() => diffStats(rows), [rows])
  const [selected, setSelected] = useState<number | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const rate = retentionRate(original, cleaned)

  const startEdit = (idx: number, row: DiffRow) => {
    setEditingIdx(idx)
    setEditText(decisions[idx]?.content ?? row.right?.text ?? row.left?.text ?? '')
  }

  const commitEdit = (idx: number) => {
    onDecide(idx, { action: 'edit', content: editText })
    setEditingIdx(null)
  }

  return (
    <div>
      <Space style={{ marginBottom: 8 }} wrap>
        <Tag color="red">删除 {stats.del} 行</Tag>
        <Tag color="green">新增 {stats.add} 行</Tag>
        <Tag color="gold">修改 {stats.mod} 行</Tag>
        <Tag color={rate < 0.9 ? 'red' : 'blue'}>
          {original.replace(/\s/g, '').length} 字 → {cleaned.replace(/\s/g, '').length} 字（保留率{' '}
          {(rate * 100).toFixed(1)}%）
        </Tag>
        {rate < 0.9 && <Tag color="red">字符减少过多，建议逐行检查</Tag>}
      </Space>
      <div style={{ maxHeight: 480, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
        <table className="diff-table">
          <colgroup>
            <col style={{ width: 42 }} />
            <col />
            <col style={{ width: 42 }} />
            <col />
            <col style={{ width: 90 }} />
          </colgroup>
          <tbody>
            {rows.map((row, idx) => {
              const d = decisions[idx]
              const isDiff = row.type !== 'context'
              return (
                <tr
                  key={idx}
                  className={[
                    `diff-row-${row.type}`,
                    selected === idx ? 'diff-row-selected' : '',
                  ].join(' ')}
                  onClick={() => setSelected(idx)}
                  onDoubleClick={() => isDiff && startEdit(idx, row)}
                >
                  <td className="diff-num">{row.left?.num ?? ''}</td>
                  <td className={`diff-cell-left ${row.left ? '' : 'diff-placeholder'}`}>
                    {row.left ? renderParts(row.leftParts, row.left.text) : '∅'}
                  </td>
                  <td className="diff-num">{row.right?.num ?? ''}</td>
                  <td
                    className={`diff-cell-right ${row.right || row.type === 'del' ? '' : 'diff-placeholder'}`}
                  >
                    {editingIdx === idx ? (
                      <Input
                        size="small"
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onPressEnter={() => commitEdit(idx)}
                        onKeyDown={(e) => e.key === 'Escape' && setEditingIdx(null)}
                        onBlur={() => setEditingIdx(null)}
                      />
                    ) : (
                      <span
                        className={d?.action === 'reject' ? 'diff-line-rejected' : undefined}
                      >
                        {d?.action === 'edit' ? (
                          <>
                            {d.content} <Tag color="blue">已编辑</Tag>
                          </>
                        ) : d?.action === 'reject' && row.type === 'del' ? (
                          <span style={{ opacity: 0.8 }}>{row.left?.text}（已恢复原文）</span>
                        ) : row.right ? (
                          renderParts(row.rightParts, row.right.text)
                        ) : (
                          <span style={{ color: '#bbb' }}>（该行被删除）</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td style={{ verticalAlign: 'top', padding: '2px 4px' }}>
                    {isDiff && (
                      <Space size={2}>
                        <Tooltip title="接受清理结果（默认）">
                          <Button
                            type={!d || d.action === 'accept' ? 'primary' : 'text'}
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={() => onDecide(idx, { action: 'accept' })}
                          />
                        </Tooltip>
                        <Tooltip title="拒绝（恢复原文行）">
                          <Button
                            type={d?.action === 'reject' ? 'primary' : 'text'}
                            danger={d?.action === 'reject'}
                            size="small"
                            icon={<CloseOutlined />}
                            onClick={() => onDecide(idx, { action: 'reject' })}
                          />
                        </Tooltip>
                        <Tooltip title="双击行内编辑">
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => startEdit(idx, row)}
                          />
                        </Tooltip>
                        <Tooltip title="重置决策">
                          <Button
                            type="text"
                            size="small"
                            icon={<UndoOutlined />}
                            onClick={() => onDecide(idx, null)}
                          />
                        </Tooltip>
                      </Space>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
