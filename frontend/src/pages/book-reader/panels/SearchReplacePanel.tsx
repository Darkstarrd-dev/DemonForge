// 沉浸式阅读器 · 查找替换面板。
// 受控组件：所有状态/回调由父级管理。工具函数在 searchUtils.ts。
import { useMemo } from 'react'
import { Button, Input, Tag, Tooltip } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { Chapter } from '../../../services/types'
import { buildFindRegex, buildFindResults, highlightParts, type FindResult } from './searchUtils'

export type ReplaceMode = 'preview' | 'apply'
const PAGE_SIZE = 30

export type { FindResult }

export interface SearchReplacePanelProps {
  chapters: Chapter[]
  findText: string
  setFindText: React.Dispatch<React.SetStateAction<string>>
  replaceText: string
  setReplaceText: React.Dispatch<React.SetStateAction<string>>
  useRegex: boolean
  setUseRegex: React.Dispatch<React.SetStateAction<boolean>>
  caseSensitive: boolean
  setCaseSensitive: React.Dispatch<React.SetStateAction<boolean>>
  replaceMode: ReplaceMode
  setReplaceMode: React.Dispatch<React.SetStateAction<ReplaceMode>>
  /** 点击匹配项跳转（父级决定是否切换章节 + 滚动到段） */
  onJumpToResult: (r: FindResult) => void
  /** 「全部替换」实际修改（仅 replaceMode==='apply'） */
  onApplyAll: () => void
  /** 当前窗口起始索引（由父级控制分页） */
  findWindowStart: number
  setFindWindowStart: React.Dispatch<React.SetStateAction<number>>
}

export default function SearchReplacePanel({
  chapters,
  findText,
  setFindText,
  replaceText,
  setReplaceText,
  useRegex,
  setUseRegex,
  caseSensitive,
  setCaseSensitive,
  replaceMode,
  setReplaceMode,
  onJumpToResult,
  onApplyAll,
  findWindowStart,
  setFindWindowStart,
}: SearchReplacePanelProps) {
  const findRegex = useMemo(
    () => (findText.trim() ? buildFindRegex(findText, useRegex, caseSensitive) : null),
    [findText, useRegex, caseSensitive],
  )
  const findResults = useMemo(
    () => (findRegex ? buildFindResults(chapters, findRegex) : []),
    [chapters, findRegex],
  )
  const findWindowEnd = Math.min(findWindowStart + PAGE_SIZE, findResults.length)
  const findPage = findResults.slice(findWindowStart, findWindowEnd)

  return (
    <div className="imm-find-panel">
      <div className="imm-find-row">
        <Input
          className="imm-find-input"
          placeholder={useRegex ? '正则表达式 · 例如：第[一二三四五六七八九十]章' : '查找文本'}
          value={findText}
          onChange={(e) => {
            setFindText(e.target.value)
            setFindWindowStart(0)
          }}
          allowClear
          autoFocus
          prefix={<SearchOutlined style={{ color: 'var(--imm-muted)' }} />}
        />
        <Tooltip title="区分大小写">
          <Button
            size="small"
            type={caseSensitive ? 'primary' : 'text'}
            className="imm-find-opt"
            onClick={() => {
              setCaseSensitive((v) => !v)
              setFindWindowStart(0)
            }}
          >
            Aa
          </Button>
        </Tooltip>
        <Tooltip title="正则表达式模式">
          <Button
            size="small"
            type={useRegex ? 'primary' : 'text'}
            className="imm-find-opt"
            onClick={() => {
              setUseRegex((v) => !v)
              setFindWindowStart(0)
            }}
          >
            .*
          </Button>
        </Tooltip>
        <span className="imm-find-stat">
          {findRegex
            ? `匹配 ${findResults.length} 处 / ${new Set(findResults.map((r) => r.chapterId)).size} 章`
            : findText.trim()
              ? '正则无效'
              : '输入以开始查找'}
        </span>
      </div>

      <div className="imm-find-row">
        <Input
          className="imm-find-input"
          placeholder={useRegex ? '替换文本 · 支持 $1/$2 捕获组' : '替换为'}
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          allowClear
        />
        <Tooltip title={replaceMode === 'preview' ? '预览模式：仅显示替换结果' : '实际修改：写入文本'}>
          <Button
            size="small"
            type={replaceMode === 'apply' ? 'primary' : 'text'}
            className="imm-find-opt"
            onClick={() => setReplaceMode((m) => (m === 'preview' ? 'apply' : 'preview'))}
          >
            {replaceMode === 'preview' ? '预览' : '修改'}
          </Button>
        </Tooltip>
        {replaceMode === 'apply' && findRegex && replaceText && findResults.length > 0 && (
          <Button size="small" type="primary" onClick={onApplyAll}>
            全部替换
          </Button>
        )}
      </div>

      {findResults.length > 0 && (
        <>
          <div className="imm-find-list-head">
            <span>
              第 {findWindowStart + 1}–{findWindowEnd} 条 / 共 {findResults.length} 条
            </span>
            <span style={{ display: 'flex', gap: 4 }}>
              <Button
                size="small"
                disabled={findWindowStart === 0}
                onClick={() => setFindWindowStart((w) => Math.max(0, w - PAGE_SIZE))}
              >
                上一批
              </Button>
              <Button
                size="small"
                disabled={findWindowEnd >= findResults.length}
                onClick={() => setFindWindowStart((w) => w + PAGE_SIZE)}
              >
                下一批
              </Button>
            </span>
          </div>
          <div
            className="imm-find-list"
            onScroll={(e) => {
              const el = e.currentTarget
              if (
                el.scrollTop + el.clientHeight >= el.scrollHeight - 30 &&
                findWindowEnd < findResults.length
              ) {
                setFindWindowStart((w) => w + PAGE_SIZE)
              }
            }}
          >
            {findPage.map((r, fi) => {
              const displayText =
                replaceMode === 'preview' && findRegex && replaceText
                  ? r.paraText.replace(findRegex, replaceText)
                  : r.paraText
              const parts = highlightParts(displayText, replaceMode === 'preview' ? null : findRegex)
              return (
                <div key={`${findWindowStart + fi}`} className="imm-find-item" onClick={() => onJumpToResult(r)}>
                  <div className="imm-find-item-head">
                    <Tag>{r.chapterTitle}</Tag>
                    <span className="imm-find-item-idx">段 {r.paraIdx + 1}</span>
                    {replaceMode === 'preview' && findRegex && replaceText && <Tag color="purple">预览</Tag>}
                  </div>
                  <div className="imm-find-item-text">
                    {parts.map((p, j) =>
                      p.hl ? (
                        <mark key={j} className="imm-find-hl">
                          {p.text}
                        </mark>
                      ) : (
                        p.text
                      ),
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
