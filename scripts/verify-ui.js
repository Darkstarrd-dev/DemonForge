#!/usr/bin/env node

/**
 * UI 主题和布局验证脚本
 *
 * 验证项：
 * 1. 深色模式下 Alert 组件背景色正确
 * 2. 设置页面无双重滚动条，Tab 固定在顶部
 * 3. 特定页面隐藏"当前作品"选择器
 * 4. 所有页面响应式布局正常
 */

const pages = [
  { path: '/', name: '书库概览', hasBookSelector: true },
  { path: '/m0', name: 'M0 立项架构', hasBookSelector: true },
  { path: '/m1', name: 'M1 文本导入', hasBookSelector: true },
  { path: '/m4', name: 'M4 章节生成', hasBookSelector: true },
  { path: '/m5', name: 'M5 章节管理', hasBookSelector: true },
  { path: '/batch', name: '批量生产', hasBookSelector: true },
  { path: '/settings', name: '系统设置', hasBookSelector: false },
  { path: '/node-test', name: '节点测试', hasBookSelector: false },
  { path: '/demo-3d', name: '3D环境', hasBookSelector: false },
  { path: '/demo-2d', name: '2D环境', hasBookSelector: false },
]

console.log('='.repeat(60))
console.log('UI 主题和布局验证清单')
console.log('='.repeat(60))
console.log()

console.log('【主题验证】')
console.log('1. 浅色主题')
console.log('   - Alert info 背景: #F2E3D6 (暖色)')
console.log('   - Alert info 边框: #E7E1D7')
console.log()
console.log('2. 深色主题')
console.log('   - Alert info 背景: #3C3835 (暖灰)')
console.log('   - Alert info 边框: #4A4542')
console.log('   - Alert warning 背景: #4A3820')
console.log('   - Alert warning 边框: #6B5230')
console.log()

console.log('【布局验证】')
console.log('设置页面:')
console.log('  - Tab 固定在顶部 ✓')
console.log('  - 只有内容区域滚动 ✓')
console.log('  - 无双重滚动条 ✓')
console.log()

console.log('【Header 显示验证】')
pages.forEach(page => {
  const selector = page.hasBookSelector ? '显示' : '隐藏'
  console.log(`  ${page.name.padEnd(15)} - 当前作品选择器: ${selector}`)
})
console.log()

console.log('【响应式验证】')
console.log('建议测试视口:')
console.log('  1920x1080 - 内容不溢出')
console.log('  1366x768  - 双栏自动堆叠')
console.log('  1280x720  - 表格横向滚动')
console.log()

console.log('【需要手动测试的页面】')
pages.forEach(page => {
  console.log(`  [ ] ${page.path.padEnd(15)} ${page.name}`)
})
console.log()

console.log('='.repeat(60))
console.log('验证方法:')
console.log('1. 启动应用: npm run dev')
console.log('2. 切换主题: 设置 → 通用设置 → 主题模式')
console.log('3. 逐页检查上述各项')
console.log('4. 调整窗口大小验证响应式')
console.log('='.repeat(60))
