// 章节 Tabs 面板 —— Step3Clean 左侧四种视图切换（待处理/完成/节点/章节）。
// 受控组件：listTab + selectedTask + selectedNode 全部由父级管。
import { Col, Tabs } from 'antd'
import type { ImportChapter } from '../../../services/types'
import type { CleanRunNodeSession } from '../../../store/appStore'
import ChapterListPane from './ChapterListPane'
import NodeListPane from './NodeListPane'

export type ListTabKey = 'pending' | 'done' | 'nodes' | 'nodeTasks'

export interface ChapterTabsPanelProps {
  screens: { lg?: boolean } | undefined
  listTab: ListTabKey
  setListTab: (k: ListTabKey) => void
  /** 章节列表 */
  pendingChapters: ImportChapter[]
  doneChapters: ImportChapter[]
  /** 选中的工作节点会话 */
  selectedSession: CleanRunNodeSession | null
  /** 该会话下任务章节（assigned 序列） */
  nodeTaskChapters: ImportChapter[]
  /** 已完成集合（供已选节点视图打勾） */
  doneSet: Set<string> | undefined
  /** 实时状态 */
  selectedTask: string | null
  setSelectedTask: (id: string | null) => void
  activeIds: Set<string>
  activeIdsEmpty: Set<string>
  /** 状态颜色映射（传入子组件） */
  statusColor: (st: string) => string
}

export default function ChapterTabsPanel({
  screens,
  listTab,
  setListTab,
  pendingChapters,
  doneChapters,
  selectedSession,
  nodeTaskChapters,
  doneSet,
  selectedTask,
  setSelectedTask,
  activeIds,
  activeIdsEmpty,
  statusColor,
  nodeSessions,
  selectedNode,
  onPickNode,
}: ChapterTabsPanelProps & { nodeSessions: CleanRunNodeSession[]; selectedNode: string | null; onPickNode: (k: string) => void }) {
  return (
    <Col
      xs={24}
      lg={8}
      style={{
        height: screens?.lg ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: screens?.lg ? 0 : 16,
      }}
    >
      <Tabs
        className="m1-tabs-panel"
        size="small"
        activeKey={listTab}
        onChange={(k) => setListTab(k as ListTabKey)}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        items={[
          {
            key: 'pending',
            label: `待处理（${pendingChapters.length}）`,
            children: (
              <ChapterListPane
                chapters={pendingChapters}
                emptyText="无待处理章节"
                selectedTask={selectedTask}
                activeIds={activeIds}
                onPick={setSelectedTask}
                statusColor={statusColor}
              />
            ),
          },
          {
            key: 'done',
            label: `完成（${doneChapters.length}）`,
            children: (
              <ChapterListPane
                chapters={doneChapters}
                emptyText="暂无完成章节"
                selectedTask={selectedTask}
                activeIds={activeIdsEmpty}
                onPick={setSelectedTask}
                statusColor={statusColor}
              />
            ),
          },
          {
            key: 'nodes',
            label: `节点（${nodeSessions.length}）`,
            children: (
              <NodeListPane
                sessions={nodeSessions}
                selectedNode={selectedNode}
                onPick={onPickNode}
              />
            ),
          },
          {
            key: 'nodeTasks',
            label: selectedSession ? `${selectedSession.name}（${selectedSession.assigned.length}）` : '章节',
            children: (
              <ChapterListPane
                chapters={nodeTaskChapters}
                emptyText={selectedSession ? '该节点暂无任务' : '请在「工作节点」选择一个节点'}
                selectedTask={selectedTask}
                activeIds={activeIds}
                onPick={setSelectedTask}
                statusColor={statusColor}
                doneSet={doneSet}
              />
            ),
          },
        ]}
      />
    </Col>
  )
}
