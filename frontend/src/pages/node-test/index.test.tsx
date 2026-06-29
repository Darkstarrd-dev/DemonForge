// @vitest-environment jsdom
//
// NodeTestPage characterization 测试（A-8 深度拆分安全网）。
//
// 目的：抽 ChatTranscript/ChatComposer/Sidebar + useNodeTestForm/useInferenceSession 前，
// 先黑盒锁住最关键的对外契约——重构前后必须全绿。tsc 抓不到 effect/事件回调的行为回归，
// 故这里用 RTL 渲染真实组件树，断言三条核心契约：
//   ① 无选中节点 → 渲染空态 placeholder。
//   ② 单栏发送 → 经引擎 sendInSession（最高风险路径：useInferenceSession 的主出口），
//      且本轮 user 文本与节点正确透传。
//   ③ 切对比模式 → 双栏布局出现（compareMode 本地态切换 + 渲染分支）。
//
// 策略：
// - mock services/api 仅替换 index 用到的 streamChat/sendInSession/cancelSession（其余导出本树不触及）。
// - 用真实 appStore（storeReady 默认 false → 持久化 fetch 全 early-return，注入零副作用），
//   beforeEach 经 setState 重置关键域字段。
// - 对比按钮无可访问名，用稳定的 antd icon class（.anticon-column-width）定位。

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'

vi.mock('../../services/api', () => ({
  streamChat: vi.fn(),
  sendInSession: vi.fn(),
  cancelSession: vi.fn(),
}))

import NodeTestPage from './index'
import { sendInSession } from '../../services/api'
import { useAppStore } from '../../store/appStore'
import type { Provider, ProviderNode } from '../../services/types'

const provider: Provider = {
  id: 'p1',
  name: '测试供应商',
  baseURL: 'http://example.test/v1',
  apiKeys: [{ id: 'k1', key: 'sk-test', enabled: true, state: 'ok' }],
  rotationPolicy: 'round-robin',
  createdAt: Date.now(),
}

const textNode: ProviderNode = {
  id: 'n1',
  providerId: 'p1',
  nodeType: 'text',
  model: 'gpt-4o',
  enabled: true,
  maxConcurrency: 2,
  batchChars: 4000,
  intervalSec: 0,
}

function renderPage() {
  return render(
    <ConfigProvider>
      <AntApp>
        <NodeTestPage />
      </AntApp>
    </ConfigProvider>,
  )
}

beforeEach(() => {
  ;(sendInSession as Mock).mockClear()
  // 重置节点测试相关域字段（其它 slice 保持初始）。storeReady 默认 false → 不触发持久化。
  useAppStore.setState({
    providers: [],
    providerNodes: [],
    chatSessions: [],
    activeChatSessionId: null,
    sessionRuntimes: {},
    nodeTestGlobalForm: { provider: 'modelscope', nodeId: undefined },
    nodeTestFormPerNode: {},
    systemPromptPresets: [],
    systemPromptActiveId: null,
  })
})

describe('NodeTestPage · characterization', () => {
  it('无选中节点时渲染文本空态 placeholder', () => {
    renderPage()
    expect(screen.getByText('选择文本推理节点开始对话')).toBeInTheDocument()
  })

  it('单栏发送经引擎 sendInSession 并透传本轮 user 文本与节点', () => {
    useAppStore.setState({
      providers: [provider],
      providerNodes: [textNode],
      nodeTestGlobalForm: { provider: 'modelscope', nodeId: 'n1' },
      nodeTestFormPerNode: { n1: { prompt: '你好，世界' } },
    })
    renderPage()

    fireEvent.click(screen.getByText('发送'))

    expect(sendInSession as Mock).toHaveBeenCalledTimes(1)
    const arg = (sendInSession as Mock).mock.calls[0][0]
    expect(arg.userText).toBe('你好，世界')
    expect(arg.testMode).toBe('text')
    expect(arg.node.id).toBe('n1')
    // 无活动 session → 应已新建并激活一个 session 承载本轮
    expect(useAppStore.getState().activeChatSessionId).toBeTruthy()
  })

  it('切换对比模式后出现左右双栏', () => {
    useAppStore.setState({
      providers: [provider],
      providerNodes: [textNode],
      nodeTestGlobalForm: { provider: 'modelscope', nodeId: 'n1' },
    })
    const { container } = renderPage()

    const compareIcon = container.querySelector('.anticon-column-width')
    expect(compareIcon).toBeTruthy()
    fireEvent.click(compareIcon!.closest('button')!)

    expect(screen.getAllByText(/未选择节点/)).toHaveLength(2)
  })
})
