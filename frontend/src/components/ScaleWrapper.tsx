import { useEffect, type ReactNode } from 'react'
import { useAppStore } from '../store/appStore'

interface ScaleWrapperProps {
  children: ReactNode
  baseWidth?: number // 基准宽度，默认 4K (3840px)
}

/**
 * 缩放包装器 - 以 4K 为基准，根据窗口宽度等比缩放整个应用
 *
 * 工作原理：
 * - 使用 Electron 原生 webContents.setZoomFactor() 实现缩放
 * - 在浏览器引擎层面缩放，自动处理所有视口单位（vh/vw/%）
 * - 关闭缩放：zoomFactor = 1（正常显示）
 * - 开启缩放：
 *   - 4K 及以上（>= 3840px）：zoomFactor = 1（正常显示）
 *   - 小于 4K：zoomFactor = currentWidth / 3840（等比缩小）
 */
export default function ScaleWrapper({ children, baseWidth = 3840 }: ScaleWrapperProps) {
  const enable4KScale = useAppStore((s) => s.enable4KScale)

  useEffect(() => {
    const updateZoom = () => {
      if (!window.electronAPI?.setZoomFactor) {
        // 非 Electron 环境，不支持缩放
        return
      }

      const currentWidth = window.innerWidth
      let zoomFactor = 1

      if (enable4KScale && currentWidth < baseWidth) {
        // 开启缩放 + 窗口小于 4K：按比例缩放
        zoomFactor = currentWidth / baseWidth
      }

      window.electronAPI.setZoomFactor(zoomFactor)
    }

    // 初始化
    updateZoom()

    // 监听窗口大小变化
    window.addEventListener('resize', updateZoom)
    return () => window.removeEventListener('resize', updateZoom)
  }, [baseWidth, enable4KScale])

  // 直接渲染子组件，缩放由 Electron 处理
  return <>{children}</>
}
