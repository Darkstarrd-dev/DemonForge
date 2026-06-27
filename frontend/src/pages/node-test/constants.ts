// 节点测试常量（A-8 从 index.tsx 抽出）。
// RESOLUTIONS：ModelScope 文生图分辨率预设；GPT_SIZES：GPT Image 4K 比例预设。

export const RESOLUTIONS = [
  { value: '1024x1024', label: '1024×1024（1:1）' },
  { value: '1280x720', label: '1280×720（16:9）' },
  { value: '720x1280', label: '720×1280（9:16）' },
  { value: '1024x768', label: '1024×768（4:3）' },
  { value: '768x1024', label: '768×1024（3:4）' },
]

export const GPT_SIZES = [
  { value: '3840x3840', label: '3840×3840（1:1）' },
  { value: '2560x3840', label: '2560×3840（2:3 竖图）' },
  { value: '3840x2560', label: '3840×2560（3:2 横图）' },
  { value: '3840x2880', label: '3840×2880（4:3）' },
  { value: '2880x3840', label: '2880×3840（3:4）' },
  { value: '3840x2160', label: '3840×2160（16:9）' },
  { value: '2160x3840', label: '2160×3840（9:16）' },
  { value: '3840x1646', label: '3840×1646（21:9）' },
  { value: '1646x3840', label: '1646×3840（9:21）' },
]
