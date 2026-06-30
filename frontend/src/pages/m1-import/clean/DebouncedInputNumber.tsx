// 防抖数字输入：本地状态即时显示，失焦才交父组件（避免每按键写 store / 重渲染）。
// 与原 Step3Clean 内联实现完全等价。
import { useState } from 'react'
import { InputNumber } from 'antd'
import type { InputNumberProps } from 'antd'

export interface DebouncedInputNumberProps extends Omit<InputNumberProps, 'onChange' | 'onBlur' | 'value'> {
  value: number | null
  onCommit: (v: number | null) => void
}

export default function DebouncedInputNumber({ value, onCommit, ...rest }: DebouncedInputNumberProps) {
  const numValue = (typeof value === 'number' ? value : null) as number | null
  const [local, setLocal] = useState<number | null>(numValue)
  const [tracked, setTracked] = useState<number | null>(numValue)
  if (numValue !== tracked) {
    setTracked(numValue)
    setLocal(numValue)
  }
  return (
    <InputNumber
      {...rest}
      value={local}
      onChange={(v) => setLocal(typeof v === 'number' ? v : null)}
      onBlur={() => onCommit(local)}
    />
  )
}
