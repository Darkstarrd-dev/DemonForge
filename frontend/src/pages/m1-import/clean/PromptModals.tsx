// 清理提示词 + 测试文本弹窗 —— Step3Clean 顶部"清理提示词"/"测试文本"按钮触发。
// 受控组件：open + draft + handlers 由父级管。
import { Button, Input, Modal, Typography } from 'antd'
import { useAppStore } from '../../../store/appStore'
import { DEFAULT_M1_TEST_TEXT } from '../../../store/slices/m1ImportSlice'
import { getDefaultPrompt } from '../../../services/api'

export interface PromptModalsProps {
  promptOpen: boolean
  setPromptOpen: (v: boolean) => void
  draftPrompt: string
  setDraftPrompt: (v: string) => void
  testTextOpen: boolean
  setTestTextOpen: (v: boolean) => void
  draftTestText: string
  setDraftTestText: (v: string) => void
  currentTestText: string
  /** 由父级提供的 toast message（避免重复引入 App.useApp） */
  message: { success: (s: string) => void }
}

export default function PromptModals({
  promptOpen,
  setPromptOpen,
  draftPrompt,
  setDraftPrompt,
  testTextOpen,
  setTestTextOpen,
  draftTestText,
  setDraftTestText,
  currentTestText,
  message,
}: PromptModalsProps) {
  return (
    <>
      <Modal
        title="清理提示词"
        open={promptOpen}
        onCancel={() => setPromptOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setPromptOpen(false)}>取消</Button>,
          <Button key="clear" onClick={() => setDraftPrompt('')}>清空</Button>,
          <Button
            key="reset"
            onClick={async () => {
              const builtin = await getDefaultPrompt()
              setDraftPrompt(builtin)
              useAppStore.getState().setState({
                promptOverrides: { ...useAppStore.getState().promptOverrides, 'm1-clean': '' },
                m1SystemPrompt: '',
              })
            }}
          >
            恢复默认
          </Button>,
          <Button
            key="save"
            type="primary"
            onClick={() => {
              const s = useAppStore.getState()
              const newOverrides = { ...s.promptOverrides }
              if (draftPrompt.trim()) {
                newOverrides['m1-clean'] = draftPrompt
              } else {
                delete newOverrides['m1-clean']
              }
              s.setState({ promptOverrides: newOverrides })
              setPromptOpen(false)
              message.success('提示词已保存')
            }}
          >
            保存
          </Button>,
        ]}
        width={640}
      >
        <Input.TextArea
          value={draftPrompt}
          onChange={(e) => setDraftPrompt(e.target.value)}
          autoSize={{ minRows: 8, maxRows: 20 }}
          placeholder="留空则使用后端内置默认提示词"
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          {draftPrompt
            ? `当前编辑 ${draftPrompt.length} 字。保存后作为持久化覆盖生效，优先级高于后端内置默认。`
            : '留空时清理使用后端内置默认提示词。点「恢复默认」可查看内置内容并恢复。'}
        </Typography.Paragraph>
      </Modal>

      <Modal
        title="测试文本"
        open={testTextOpen}
        onCancel={() => setTestTextOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setTestTextOpen(false)}>取消</Button>,
          <Button
            key="clear"
            onClick={() => {
              setDraftTestText('')
              useAppStore.getState().setState({ m1TestText: '' })
              message.success('已清空')
            }}
          >
            清空
          </Button>,
          <Button
            key="reset"
            onClick={() => {
              setDraftTestText(DEFAULT_M1_TEST_TEXT)
              useAppStore.getState().setState({ m1TestText: DEFAULT_M1_TEST_TEXT })
            }}
          >
            恢复默认
          </Button>,
          <Button
            key="save"
            type="primary"
            disabled={draftTestText === currentTestText}
            onClick={() => {
              useAppStore.getState().setState({ m1TestText: draftTestText })
              setTestTextOpen(false)
              message.success('测试文本已保存')
            }}
          >
            保存
          </Button>,
        ]}
        width={640}
      >
        <Input.TextArea
          value={draftTestText}
          onChange={(e) => setDraftTestText(e.target.value)}
          autoSize={{ minRows: 8, maxRows: 20 }}
          placeholder="用于批量测试的文本内容"
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          {draftTestText
            ? `当前 ${draftTestText.length} 字。用于「批量测试」按钮的真实清理调用。`
            : '测试文本为空时批量测试无法执行。'}
        </Typography.Paragraph>
      </Modal>
    </>
  )
}
