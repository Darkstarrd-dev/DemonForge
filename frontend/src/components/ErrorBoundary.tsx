import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Result, Button, Space, Typography } from 'antd'
import { ReloadOutlined, HomeOutlined } from '@ant-design/icons'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  // 通过改变 resetKey 强制 ErrorBoundary 重新挂载子树（重置内部 state）
  resetKey: number
}

/**
 * 全局错误边界。
 * 捕获子树渲染 / 生命周期抛出的同步异常（包括 WASM panic 冒泡到 React 的部分），
 * 降级为可恢复的错误页，避免整个 app 白屏。
 *
 * 注意：异步回调（setTimeout / requestAnimationFrame / Promise.then）里抛出的异常
 * React 捕获不到，需要各页面自行 try/catch。本边界主要兜住「渲染期间」与
 * 「事件处理期间」的崩溃。
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, resetKey: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] 捕获到子树异常:', error, info)
  }

  /** 重置错误状态并重新挂载子树 */
  handleReset = () => {
    this.setState({ hasError: false, error: null, resetKey: this.state.resetKey + 1 })
  }

  /** 返回首页（hash 路由跳转，绕过可能已损坏的子树） */
  handleGoHome = () => {
    // HashRouter：改 hash 回首页。原 assign('/') 会在 Electron file:// 下导航到文件系统根而白屏。
    // 直接改 location 也绕过可能已卸载的路由上下文。
    window.location.hash = '#/'
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error
      const errName = err?.name ?? 'Error'
      const errMsg = err?.message ?? '未知错误'
      return (
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <Result
            status="error"
            title="页面运行出错"
            subTitle={
              <Space direction="vertical" align="center" size={4}>
                <Typography.Text type="secondary">{`${errName}: ${errMsg}`}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  可以尝试重置当前页面，或返回首页继续使用其它功能。
                </Typography.Text>
              </Space>
            }
            extra={
              <Space>
                <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleReset}>
                  重置页面
                </Button>
                <Button icon={<HomeOutlined />} onClick={this.handleGoHome}>
                  返回首页
                </Button>
              </Space>
            }
          />
        </div>
      )
    }

    // key 变化时子树重新挂载，丢弃内部损坏的状态
    return <div key={this.state.resetKey}>{this.props.children}</div>
  }
}
