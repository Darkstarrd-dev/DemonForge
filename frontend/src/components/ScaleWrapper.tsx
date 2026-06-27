import { useEffect, type ReactNode } from 'react'
import { useAppStore } from '../store/appStore'

/**
 * 4K 基准自适应缩放（仅 Electron 生效）。
 *
 * 设计要点：缩放计算全部在主进程完成 —— 主进程用 webContents 的 getContentBounds()
 * 拿到 DIP 宽度（不受 setZoomFactor 影响），计算 zoom = 当前宽 / 基准宽。
 * 这从根本上消除了旧实现「用 window.innerWidth 算缩放 → innerWidth 又被缩放反向改变」
 * 的自激反馈环（界面来回缩小/恢复闪烁）。
 *
 * 本组件只负责把「开关 + 基准宽度」同步给主进程，自身不做任何测量、不监听 resize。
 */
export default function ScaleWrapper({ children }: { children: ReactNode }) {
  const enable4KScale = useAppStore((s) => s.enable4KScale)
  const scaleBaseWidth = useAppStore((s) => s.scaleBaseWidth)

  useEffect(() => {
    window.electronAPI?.setScaleConfig?.({ enabled: enable4KScale, baseWidth: scaleBaseWidth })
  }, [enable4KScale, scaleBaseWidth])

  return <>{children}</>
}
