import { useState } from 'react'
import { useNodePoolCrud } from '../../../hooks/useNodePoolCrud'
import { useNodeTesting } from '../../../hooks/useNodeTesting'
import NodePoolManager from '../../../packages/node-pool/ui/NodePoolManager'
import NodeTestPanel from '../../../packages/node-pool/ui/NodeTestPanel'
import ModuleMappingPanel from '../../../packages/node-pool/ui/ModuleMappingPanel'

export default function NodesTabContent() {
  const crud = useNodePoolCrud()
  const testing = useNodeTesting()

  const [modelMappingModalOpen, setModelMappingModalOpen] = useState(false)

  return (
    <>
      <NodePoolManager
        providers={crud.providers}
        providerNodes={crud.providerNodes}
        resolvedNodes={crud.resolvedNodes}
        nodeTypeFilter={crud.nodeTypeFilter}
        onNodeTypeFilterChange={crud.setNodeTypeFilter}
        onAddProvider={crud.openProviderEdit}
        onEditProvider={crud.editProvider}
        onAddNodeForProvider={crud.addNodeForProvider}
        onEditNode={crud.editNode}
        onRemoveProvider={crud.removeProvider}
        onRemoveNode={crud.removeNode}
        onToggleNodeEnabled={crud.toggleNodeEnabled}
        onDuplicateNode={crud.duplicateNode}
        onTestNode={testing.testNode}
        onConcurrencyTestNode={testing.concurrencyTestNode}
        onReorderProviders={crud.reorderProviders}
        onReorderNodes={crud.reorderNodes}
        nodeGroupExpanded={crud.nodeGroupExpanded}
        onToggleGroup={crud.toggleGroup}
        onFetchModels={crud.fetchModels}
        fetchingModels={crud.fetchingModels}
        onOpenModelMapping={() => setModelMappingModalOpen(true)}
        onExportNodePool={crud.handleExportNodePool}
        onImportNodePool={crud.handleImportNodePool}
        batchTesting={testing.batchTesting}
        onRunBatchTest={() => testing.runBatchTest(crud.nodeTypeFilter)}
        editingProvider={crud.editingProvider}
        setEditingProvider={crud.setEditingProvider}
        selectedExistingProvider={crud.selectedExistingProvider}
        setSelectedExistingProvider={crud.setSelectedExistingProvider}
        providerForm={crud.providerForm}
        onSaveProvider={crud.saveProvider}
        editingNode={crud.editingNode}
        setEditingNode={crud.setEditingNode}
        nodeForm={crud.nodeForm}
        onSaveNode={crud.saveNode}
        availableModels={crud.availableModels}
        selectedModels={crud.selectedModels}
        setSelectedModels={crud.setSelectedModels}
        modelSelectOpen={crud.modelSelectOpen}
        setModelSelectOpen={crud.setModelSelectOpen}
        fetchModelsProvider={crud.fetchModelsProvider}
        onBatchAddNodes={crud.batchAddNodes}
      />

      <NodeTestPanel
        testResult={testing.testResult}
        setTestResult={testing.setTestResult}
        onApplyTestModel={testing.applyTestModel}
        concurrencyResult={testing.concurrencyResult}
        setConcurrencyResult={testing.setConcurrencyResult}
        onApplyConcurrencyParams={testing.applyConcurrencyParams}
        testingNode={testing.testingNode}
        setTestingNode={testing.setTestingNode}
        testStreaming={testing.testStreaming}
        testStreamLeft={testing.testStreamLeft}
        testStreamRight={testing.testStreamRight}
        onStartRealTest={testing.startRealTest}
        m1SystemPrompt={testing.m1SystemPrompt}
        m1TestText={testing.m1TestText}
      />

      <ModuleMappingPanel
        open={modelMappingModalOpen}
        onClose={() => setModelMappingModalOpen(false)}
        moduleMapping={crud.moduleMapping}
        MODULE_LABELS={crud.MODULE_LABELS}
        setModuleNode={crud.setModuleNode}
        providers={crud.providers}
        providerNodes={crud.providerNodes}
        resolvedNodes={testing.resolvedNodes}
      />
    </>
  )
}
