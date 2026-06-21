import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
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
  detectLeadingChapterTitle,
  splitChapters,
  toSearchRegex,
  applyTitleTemplate,
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
  const m1TitleTemplate = useAppStore((s) => s.m1TitleTemplate)
  const [titleTemplate, setTitleTemplate] = useState(m1TitleTemplate)
  const [renamePreview, setRenamePreview] = useState<{ old: string; new: string }[]>([])
  const [aiSplitting, setAiSplitting] = useState<string | null>(null)
  /** 点击展开的预览章节索引（再次点击同项收起） */
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  /** 展开章节内光标偏移（content 坐标系，不含【标题】前缀）；null=未定位 */
  const [cursorPos, setCursorPos] = useState<number | null>(null)
  /** 拆分后新章节标题（受控输入，默认带「（续）」后缀） */
  const [splitTitle, setSplitTitle] = useState('')
  /**
   * antd v6 的 Input.TextArea ref 暴露的是组件实例 { resizableTextArea: { textArea } }，
   * 不是原生 HTMLTextAreaElement。故用联合类型承接，handleSelectText 里再安全取原生节点。
   * （结构对齐 antd TextAreaRef / @rc-component/input ResizableTextAreaRef）
   */
  type TextAreaInst = {
    resizableTextArea?: { textArea?: HTMLTextAreaElement }
    nativeElement?: HTMLElement | null
  }
  const textareaRef = useRef<TextAreaInst | HTMLTextAreaElement | null>(null)

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

  /**
   * 从 antd Input.TextArea 的 ref（可能是组件实例或原生节点）取原生 HTMLTextAreaElement。
   * antd v6：ref.current = { resizableTextArea: { textArea } }；兜底 nativeElement。
   */
  const getNativeTextArea = (): HTMLTextAreaElement | null => {
    const ref = textareaRef.current
    if (!ref) return null
    if (ref instanceof HTMLTextAreaElement) return ref
    const ta = ref.resizableTextArea?.textArea
    if (ta) return ta
    // nativeElement 兜底（结构上未必是 textarea，但 antd 文档保证可读 selectionStart）
    const native = ref.nativeElement
    return native && 'selectionStart' in native ? (native as HTMLTextAreaElement) : null
  }

  /**
   * 在展开章节文本里定位光标：从 selectionStart 反算 content 偏移（去掉【标题】\n\n 前缀）。
   * 点击瞬时浏览器可能尚未更新选区，故用 requestAnimationFrame 等一帧再读最新 selectionStart。
   */
  const handleSelectText = () => {
    const cur = selectedIdx !== null && preview ? preview[selectedIdx] : null
    if (!cur) return
    const prefixLen = `【${cur.title}】\n\n`.length
    // 点选时浏览器选区可能在事件回调时尚未刷新，推迟到下一帧读取最新 selectionStart
    requestAnimationFrame(() => {
      const ta = getNativeTextArea()
      if (!ta) return
      const start = ta.selectionStart ?? 0
      const pos = start - prefixLen
      // 仅当光标落在 content 区间内才记录（点在前缀区不算）
      setCursorPos(pos >= 0 && pos <= cur.content.length ? pos : null)
    })
  }

  /**
   * 在光标位置拆分当前展开章：光标之后的内容拆为新章插入到下一位置。
   * 前段留在原章（trim 尾部空白），后段作为新章（trim 头部空白）。
   *
   * 新章标题来源（按优先级）：
   *  1. 用户在输入框填了 splitTitle → 用之（用户明确覆盖）
   *  2. 自动检测：拆分位置后内容若以章节标题行开头（第N章/第N回/…，复用自动检测算法）
   *     → 直接用该标题，并剥离首行作为新章 content（用户拆分位置常是"没切好的边界"，其后
   *     本就是被并到上一章的真实标题行，自动命名比"（续）"更准）
   *  3. 兜底：原标题 + 「（续）」
   */
  const splitAtCursor = () => {
    if (!preview || selectedIdx === null || cursorPos === null) return
    const cur = preview[selectedIdx]
    const pos = Math.max(0, Math.min(cursorPos, cur.content.length))
    const before = cur.content.slice(0, pos).replace(/\s+$/, '')
    let after = cur.content.slice(pos).replace(/^\s+/, '')
    if (!after) {
      message.warning('光标之后没有内容可拆分')
      return
    }
    const userTitle = splitTitle.trim()
    let newTitle: string
    let detected = false
    if (userTitle) {
      newTitle = userTitle
    } else {
      // 自动检测拆分位置后内容是否以章节标题行开头
      const detectedHit = detectLeadingChapterTitle(after, splitPatterns)
      if (detectedHit) {
        newTitle = detectedHit.title
        after = detectedHit.content
        detected = true
      } else {
        newTitle = `${cur.title}（续）`
      }
    }
    const next: SplitResult[] = preview.map((p, i) => {
      if (i !== selectedIdx) return p
      return { ...p, content: before }
    })
    // 在 selectedIdx 之后插入新章
    next.splice(selectedIdx + 1, 0, { title: newTitle, content: after, isVolume: false })
    setManualOverrides(next)
    message.success(
      `已拆分：原章保留 ${before.length} 字，新章「${newTitle}」${after.length} 字${detected ? '（自动检测到标题）' : ''}`,
    )
    // 拆分后收起展开区
    setSelectedIdx(null)
    setCursorPos(null)
    setSplitTitle('')
  }

  // ── 批量重命名 ──
  const doRenamePreview = () => {
    const source = (applied ? session.chapters.map((c) => ({ title: c.title, isVolume: c.skipClean })) : preview) as { title: string; isVolume?: boolean }[] | null
    if (!source || !titleTemplate.trim()) return
    const renamed = applyTitleTemplate(source, titleTemplate)
    const items: { old: string; new: string }[] = []
    const orig = applied ? session.chapters : preview!
    for (let i = 0; i < Math.min(renamed.length, 3); i++) {
      if (renamed[i].title !== orig[i].title) {
        items.push({ old: orig[i].title, new: renamed[i].title })
      }
    }
    setRenamePreview(items.length ? items : [{ old: '(无变化)', new: '(无变化)' }])
  }

  const doRenameApply = () => {
    if (!titleTemplate.trim()) {
      message.warning('请输入模板')
      return
    }
    if (applied) {
      const mapped = session.chapters.map((c) => ({ title: c.title, isVolume: c.skipClean }))
      const renamed = applyTitleTemplate(mapped, titleTemplate)
      const chapters = session.chapters.map((c, i) => ({ ...c, title: renamed[i].title }))
      setState({ importSession: { ...useAppStore.getState().importSession!, chapters } })
      message.success(`已重命名 ${chapters.filter((c, i) => c.title !== session.chapters[i].title).length} 个章节`)
    } else if (preview) {
      const renamed = applyTitleTemplate(preview, titleTemplate)
      setManualOverrides(renamed)
      message.success(`已重命名 ${renamed.filter((r, i) => r.title !== preview[i].title).length} 个章节`)
    }
    setState({ m1TitleTemplate: titleTemplate })
    setRenamePreview([])
  }

  /** 批量重命名折叠面板 */
  const renamePanel = (
    <Collapse
      size="small"
      items={[
        {
          key: 'rename',
          label: '批量重命名',
          children: (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space>
                <Input
                  size="small"
                  style={{ width: 280 }}
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  placeholder="模板，如: 第{0n}章 {title}"
                  onPressEnter={() => doRenamePreview()}
                />
                <Button size="small" onClick={doRenamePreview}>预览</Button>
                <Button size="small" type="primary" onClick={doRenameApply}>应用</Button>
                <Button size="small" onClick={() => setTitleTemplate(m1TitleTemplate)}>重置</Button>
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                变量：{'{n}'}=序号 {'{0n}'}=补零序号 {'{title}'}=纯章名 {'{raw}'}=原标题
              </Typography.Text>
              {renamePreview.length > 0 && (
                <Space direction="vertical" size={2}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>预览（前 3 条）：</Typography.Text>
                  {renamePreview.map((r, i) => (
                    <Space key={i} size={6} style={{ fontSize: 12 }}>
                      <Tag style={{ margin: 0 }}>{r.old}</Tag>
                      <span>→</span>
                      <Tag color="blue" style={{ margin: 0 }}>{r.new}</Tag>
                    </Space>
                  ))}
                </Space>
              )}
            </Space>
          ),
        },
      ]}
    />
  )

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
          {renamePanel}
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
                style={{ fontFamily: 'monospace', fontSize: 12, cursor: 'text' }}
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
                    style={{ width: 220 }}
                    placeholder={`新章标题（留空自动检测，否则用「${preview[selectedIdx].title}（续）」）`}
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
                  点击下方文本任意位置（两个字符之间）定位光标，再用「在此拆分」把光标之后部分拆为新章。
                  若光标后内容以章节标题开头（第N章 等）会自动提取为标题；否则用「原标题（续）」或在上方输入框自定义。
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
          {renamePanel}
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
