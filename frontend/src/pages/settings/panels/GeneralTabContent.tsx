import { App, Button, Card, Segmented, Space, Switch, Typography } from 'antd'
import type { AppState } from '../../../store/types'

export default function GeneralTabContent(props: {
  theme: 'light' | 'dark'
  setState: AppState['setState']
  showMenuBar: boolean
  pushSettingsNow: () => void
  enable4KScale: boolean
  scaleBaseWidth: number
}) {
  const { message } = App.useApp()
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="通用设置">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <Typography.Text>主题</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Segmented
                    value={props.theme}
                    onChange={(v) => props.setState({ theme: v as 'light' | 'dark' })}
                    options={[
                      { value: 'light', label: '🌞 浅色' },
                      { value: 'dark', label: '🌙 深色' },
                    ]}
                  />
                </div>
              </div>
              <div>
                <Space>
                  <Typography.Text>显示菜单栏</Typography.Text>
                  <Switch checked={props.showMenuBar} onChange={(v) => props.setState({ showMenuBar: v })} />
                </Space>
              </div>
              <div>
                <Space wrap>
                  <Typography.Text>4K 基准缩放</Typography.Text>
                  <Switch checked={props.enable4KScale} onChange={(v) => props.setState({ enable4KScale: v })} />
                  <Button
                    size="small"
                    onClick={async () => {
                      const w = await window.electronAPI?.captureScaleBase?.()
                      if (w && w > 0) {
                        props.setState({ scaleBaseWidth: w })
                        message.success(`已捕获当前窗口宽度 ${w}px 作为缩放基准`)
                      } else {
                        message.warning('捕获失败：请在 Electron 应用窗口内操作')
                      }
                    }}
                  >
                    以当前窗口为基准
                  </Button>
                  <Typography.Text type="secondary">
                    {props.scaleBaseWidth > 0 ? `当前基准：${props.scaleBaseWidth}px` : '未设置基准（点左侧按钮捕获）'}
                  </Typography.Text>
                </Space>
                <div style={{ marginTop: 6, maxWidth: 720 }}>
                  <Typography.Text type="secondary">
                    用法：在 4K 显示器上<b>最大化</b>窗口 → 点「以当前窗口为基准」记录基准布局 → 开启开关。
                    之后窗口移动到其他分辨率显示器时，会以宽度等比缩放整体内容、保持同一套布局；
                    缩放计算基于显示器无关的 DIP 宽度，自动适配 Windows DPI 缩放。
                  </Typography.Text>
                </div>
              </div>
            </Space>
          </Card>
        </Space>
      </div>
    </div>
  )
}
