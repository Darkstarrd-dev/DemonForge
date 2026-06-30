// M2 设定卡片 · 实体类型元数据（标签+颜色）。
// 拆出独立文件以满足 react-refresh 规则（仅导出常量/函数时不与组件混用）。
import type { EntityType } from '../../../services/types'

export const TYPE_META: Record<EntityType, { label: string; color: string }> = {
  character: { label: '人物', color: 'blue' },
  location: { label: '地点', color: 'green' },
  item: { label: '物品', color: 'orange' },
  skill: { label: '技能', color: 'purple' },
  faction: { label: '势力', color: 'red' },
}
