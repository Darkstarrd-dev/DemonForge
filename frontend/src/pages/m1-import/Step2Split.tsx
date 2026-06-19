import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  Input,
  List,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { RobotOutlined, ReloadOutlined, ScissorOutlined } from '@ant-design/icons'
import { useAppStore, genId } from '../../store/appStore'
import {
  compilePatterns,
  detectChapterPattern,
  splitChapters,
  toSearchRegex,
  type DetectResult,
  type SplitResult,
} from '../../utils/split'
import { aiSplitChapter } from '../../services/api'
import type { ImportChapter, SplitPattern } from '../../services/types'

export default function Step2Split() {
  const { message } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const setState = useAppStore((s) => s.setState)
  const splitPatterns = useAppStore((s) => s.splitPatterns)

  // 编译为运行时形态（regex 为 RegExp|null）
  const runtimePatterns = useMemo(() => compilePatterns(splitPatterns), [splitPatterns])

  // 进入页即自动检测（lazy 初始化，仅首次；rawText 变化时由"重新检测"按钮手动触发）
  const rawText = session?.rawText ?? ''
  const [detect, setDetect] = useState<DetectResult | null>(() =>
    rawText ? detectChapterPattern(rawText, splitPatterns) : null,
  )
  const [patternKey, setPatternKey] = useState<string>(() => {
    if (!rawText) return 'zhang'
    const r = detectChapterPattern(rawText, splitPatterns)
    return r.patternKey !== 'custom' ? r.patternKey : 'zhang'
  })
  const [customRegex, setCustomRegex] = useState('^(第.+章.*)')
  const [keepPrologue, setKeepPrologue] = useState(true)
  const [aiSplitting, setAiSplitting] = useState<string | null>(null)
  /** 点击展开的预览章节索引（再次点击同项收起） */
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  /** 展开章节内光标偏移（content 坐标系，不含【标题】前缀）；null=未定位 */
  const [cursorPos, setCursorPos] = useState<number | null>(null)
  /** 拆分后新章节标题（受控输入，默认带「（续）」后缀） */
  const [splitTitle, setSplitTitle] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Radio options：内置 + 用户自定义模式，custom 永远在末尾
  const radioOptions = useMemo(() => {
    const custom = splitPatterns.find((p) => p.key === 'custom') ?? { key: 'custom', label: '自定义正则', regex: '' }
    const others = splitPatterns.filter((p) => p.key !== 'custom')
    return [...others, custom as SplitPattern].map((p) => ({ value: p.key, label: p.label }))
  }, [splitPatterns])

  const regex = useMemo(() => {
    if (patternKey !== 'custom') return runtimePatterns.find((p) => p.key === patternKey)?.regex ?? null
    return toSearchRegex(customRegex)
  }, [patternKey, customRegex, runtimePatterns])

  // 自动预览：regex / rawText / keepPrologue 变化即重算，进入页即显示，无需点按钮
  const autoPreview = useMemo<SplitResult[] | null>(() => {
    if (!rawText) return null
    if (!regex) return null
    return splitChapters(rawText, regex, keepPrologue)
  }, [rawText, regex, keepPrologue])

  /**
   * 手动拆分覆盖层：用户在预览展开区点击光标位置 + 「拆分」后，记录人工编辑结果。
   * 一旦非空，预览改用此列表（避免 regex 重算覆盖人工编辑）；
   * regex / rawText / keepPrologue 变化时自动清空（回到自动模式）。
   */
  const [manualOverrides, setManualOverrides] = useState<SplitResult[] | null>(null)
  // 切分输入签名：rawText/regex源/keepPrologue 任一变化即变更，用于检测何时该清空人工编辑
  const splitSignature = `${rawText}\u0000${regex?.source ?? ''}\u0000${regex?.flags ?? ''}\u0000${keepPrologue}`
  const [prevSignature, setPrevSignature] = useState(splitSignature)
  // 渲染期检测签名变化 → 重置人工覆盖（React 官方「adjusting state on prop change」模式，
  // 避免 useEffect 里 setState 触发 react-hooks/set-state-in-effect）
  if (prevSignature !== splitSignature) {
    setPrevSignature(splitSignature)
    setManualOverrides(null)
  }

  const preview = manualOverrides ?? autoPreview

  // 手动重新检测（按钮触发）
  const runDetect = (silent = false) => {
    if (!rawText) return
    const result = detectChapterPattern(rawText, splitPatterns)
    setDetect(result)
    if (result.patternKey !== 'custom') {
      setPatternKey(result.patternKey)
    }
    if (!silent && result.patternKey === 'custom') {
      message.info('未检测到明显章节模式，请手动选择或输入正则')
    }
  }

  if (!session) return null
  const applied = session.chapters.length > 0

  const applySplit = () => {
    if (!preview) return
    const chapters: ImportChapter[] = preview.map((p) => ({
      id: genId('imp'),
      title: p.title,
      content: p.content,
      cleanStatus: 'pending',
      lineDecisions: {},
      retryCount: 0,
      // 卷标题行单独成章 → Step3 跳过 LLM 清理，原样保留
      skipClean: p.isVolume === true,
    }))
    setState({ importSession: { ...session, chapters } })
    message.success(`已应用切分：${chapters.length} 章`)
  }

  const runAiSplit = async (ch: ImportChapter) => {
    setAiSplitting(ch.id)
    const parts = await aiSplitChapter(ch.title, ch.content)
    const cur = useAppStore.getState().importSession
    if (!cur) return
    if (parts.length <= 1) {
      message.info('AI 判定无需拆分（mock）')
    } else {
      const idx = cur.chapters.findIndex((c) => c.id === ch.id)
      const newOnes: ImportChapter[] = parts.map((p) => ({
        id: genId('imp'),
        title: p.title,
        content: p.content,
        cleanStatus: 'pending',
        lineDecisions: {},
        retryCount: 0,
        skipClean: ch.skipClean,
      }))
      const chapters = [...cur.chapters.slice(0, idx), ...newOnes, ...cur.chapters.slice(idx + 1)]
      setState({ importSession: { ...cur, chapters } })
      message.success(`已拆分为 ${parts.length} 章（mock 演示 >>>CHAPTER_TITLE: 协议）`)
    }
    setAiSplitting(null)
  }

  const detectHigh = detect && detect.patternKey !== 'custom' && detect.confidence >= 0.5

  /** 点击列表项展开/收起：收起时同步清空光标与新章标题 */
  const toggleSelect = (i: number) => {
    if (selectedIdx === i) {
      setSelectedIdx(null)
      setCursorPos(null)
      setSplitTitle('')
    } else {
      setSelectedIdx(i)
      setCursorPos(null)
      setSplitTitle('')
    }
  }

  /** 在展开章节文本里定位光标：从 selectionStart 反算 content 偏移（去掉【标题】\n\n 前缀） */
  const handleSelectText = () => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    // textarea 内容形如 `【title】\n\n${content}`，前缀长度即标题行偏移
    const cur = selectedIdx !== null && preview ? preview[selectedIdx] : null
    if (!cur) return
    const prefixLen = `【${cur.title}】\n\n`.length
    const pos = start - prefixLen
    // 仅当光标落在 content 区间内才记录（点在前缀区不算）
    if (pos >= 0 && pos <= cur.content.length) {
      setCursorPos(pos)
    } else {
      setCursorPos(null)
    }
  }

  /**
   * 在光标位置拆分当前展开章：光标之后的内容拆为新章插入到下一位置。
   * 前段留在原章（trim 尾部空白），后段作为新章（trim 头部空白）。
   * 新章标题用 splitTitle（空则用原标题 + 「（续）」）。
   */
  const splitAtCursor = () => {
    if (!preview || selectedIdx === null || cursorPos === null) return
    const cur = preview[selectedIdx]
    const pos = Math.max(0, Math.min(cursorPos, cur.content.length))
    const before = cur.content.slice(0, pos).replace(/\s+$/, '')
    const after = cur.content.slice(pos).replace(/^\s+/, '')
    if (!after) {
      message.warning('光标之后没有内容可拆分')
      return
    }
    const newTitle = splitTitle.trim() || `${cur.title}（续）`
    const next: SplitResult[] = preview.map((p, i) => {
      if (i !== selectedIdx) return p
      return { ...p, content: before }
    })
    // 在 selectedIdx 之后插入新章
    next.splice(selectedIdx + 1, 0, { title: newTitle, content: after, isVolume: false })
    setManualOverrides(next)
    message.success(`已拆分：原章保留 ${before.length} 字，新章「${newTitle}」${after.length} 字`)
    // 拆分后收起展开区
    setSelectedIdx(null)
    setCursorPos(null)
    setSplitTitle('')
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {detect && (
        <Alert
          type={detect.patternKey === 'custom' ? 'warning' : detectHigh ? 'success' : 'info'}
          showIcon
          icon={<RobotOutlined />}
          message={`自动检测：${detect.reason}`}
          description={
            detect.sampledTitles.length > 0 ? (
              <Space wrap size={4}>
                {detect.sampledTitles.map((t, i) => (
                  <Tag key={i}>{t}</Tag>
                ))}
              </Space>
            ) : undefined
          }
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => runDetect(false)}>
              重新检测
            </Button>
          }
        />
      )}
      <Space wrap align="center">
        <Radio.Group
          value={patternKey}
          onChange={(e) => setPatternKey(e.target.value)}
          options={radioOptions}
        />
      </Space>
      {patternKey === 'custom' && (
        <Input
          style={{ maxWidth: 420 }}
          value={customRegex}
          onChange={(e) => setCustomRegex(e.target.value)}
          placeholder="首个捕获组作为章节标题"
          status={regex ? undefined : 'error'}
        />
      )}
      <Space>
        <Checkbox checked={keepPrologue} onChange={(e) => setKeepPrologue(e.target.checked)}>
          保留第一章之前的内容为「序章」
        </Checkbox>
        {patternKey === 'custom' && !regex && (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            自定义正则无效
          </Typography.Text>
        )}
      </Space>

      {preview && (
        <>
          <Alert
            type={preview.length > 1 ? 'success' : 'warning'}
            showIcon
            message={
              preview.length > 1
                ? `预计切分为 ${preview.length} 章${
                    preview.some((p) => p.isVolume) ? `（含 ${preview.filter((p) => p.isVolume).length} 个卷标记章，将跳过 AI 清理）` : ''
                  }`
                : '未匹配到章节标题，将全文作为单章（可换模式或用自定义正则）'
            }
          />
          <List
            size="small"
            bordered
            style={{ maxHeight: 280, overflow: 'auto' }}
            dataSource={preview}
            renderItem={(item, i) => (
              <List.Item
                onClick={() => toggleSelect(i)}
                style={{
                  cursor: 'pointer',
                  background: selectedIdx === i ? '#e6f4ff' : undefined,
                }}
              >
                <Typography.Text type="secondary" style={{ marginRight: 12 }}>
                  {i + 1}
                </Typography.Text>
                {item.title}
                {item.isVolume && (
                  <Tag color="purple" style={{ marginLeft: 8 }}>
                    卷
                  </Tag>
                )}
                <Typography.Text type="secondary" style={{ marginLeft: 'auto' }}>
                  {item.content.length} 字
                </Typography.Text>
              </List.Item>
            )}
          />
          {selectedIdx !== null && preview[selectedIdx] && (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Input.TextArea
                ref={textareaRef as never}
                value={`【${preview[selectedIdx].title}】\n\n${preview[selectedIdx].content}`}
                readOnly
                autoSize={{ minRows: 6, maxRows: 18 }}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
                onClick={handleSelectText}
                onKeyUp={handleSelectText}
                onSelect={handleSelectText}
              />
              {cursorPos !== null ? (
                <Space wrap align="center">
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    光标位置：第 {cursorPos} 字符（点击文本可重新定位）
                  </Typography.Text>
                  <Input
                    size="small"
                    style={{ width: 200 }}
                    placeholder={`新章标题（默认「${preview[selectedIdx].title}（续）」）`}
                    value={splitTitle}
                    onChange={(e) => setSplitTitle(e.target.value)}
                  />
                  <Button
                    size="small"
                    type="primary"
                    icon={<ScissorOutlined />}
                    onClick={splitAtCursor}
                  >
                    在此拆分
                  </Button>
                </Space>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  点击下方文本任意位置（两个字符之间）定位光标，再用「在此拆分」把光标之后部分拆为新章
                </Typography.Text>
              )}
              {manualOverrides && (
                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                  当前为人工拆分结果（{manualOverrides.length} 章）。切换模式/正则/序章选项会清空人工编辑并重新自动切分。
                </Typography.Text>
              )}
            </Space>
          )}
          <Button type="primary" onClick={applySplit}>
            {applied ? '重新应用切分（覆盖当前章节）' : '应用切分'}
          </Button>
        </>
      )}

      {applied && (
        <>
          <Typography.Title level={5} style={{ marginBottom: 0 }}>
            已切分章节（{session.chapters.length}）
          </Typography.Title>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 280 }}
            dataSource={session.chapters}
            columns={[
              { title: '#', render: (_, __, i) => i + 1, width: 50 },
              { title: '标题', dataIndex: 'title' },
              { title: '字数', render: (_, c) => c.content.length, width: 80 },
              {
                title: '状态',
                width: 110,
                render: (_, c) =>
                  c.skipClean ? (
                    <Tag color="purple">卷·跳过清理</Tag>
                  ) : (
                    <Tag>{c.cleanStatus === 'pending' ? '待清理' : c.cleanStatus}</Tag>
                  ),
              },
              {
                title: '操作',
                width: 140,
                render: (_, c) => (
                  <Button
                    size="small"
                    icon={<RobotOutlined />}
                    loading={aiSplitting === c.id}
                    onClick={() => runAiSplit(c)}
                  >
                    AI 重拆
                  </Button>
                ),
              },
            ]}
          />
          <Button
            type="primary"
            onClick={() => setState({ importSession: { ...useAppStore.getState().importSession!, step: 2 } })}
          >
            下一步：AI 清理
          </Button>
        </>
      )}
    </Space>
  )
}
