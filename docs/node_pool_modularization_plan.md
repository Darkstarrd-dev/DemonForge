# 节点池模块化方案 (Node Pool Modularization Plan)

| 元信息 | 值 |
|---|---|
| 创建日期 | 2026-06-29 |
| 状态 | 待实施 |
| 范围 | 把节点池/节点功能抽成独立、与其他业务解耦、可复用的模块 |
| 关联文件 | `frontend/src/services/types.ts`、`frontend/src/store/slices/providerSlice.ts`、`frontend/src/pages/settings/panels/NodesTabContent.tsx`、`frontend/src/services/real/{cleanScheduler,batch}.ts`、`frontend/src/utils/providerResolver.ts`、`server/src/routes/settings.ts`、`server/src/store/db.ts` |
| 评分基线 | 17/40 (42.5%) |

---

## 1. 背景与目标

### 1.1 背景

节点池在 `b9e95e7` 提交中刚完成"供应商→节点两层模型"重构,支持多 API KEY 轮询(Round-Robin / Failover)。本次审计发现:重构只完成了**类型层与纯函数策略层**的解耦,后端存储/路由、前端 store/UI、调度器消费接口仍与 novelhelper 业务深度绑定。

### 1.2 目标

把节点池抽成 `packages/node-pool/`(或同等独立模块),达到:

1. **可复用**:任何 Node.js + React 项目可直接引入节点池管理能力
2. **可独立测试**:模块自带单元测试,不依赖 novelhelper 业务数据
3. **可独立导入/导出**:节点池配置可单独备份/迁移,不必整体 settings 备份
4. **接口稳定**:业务调用方依赖抽象接口,节点池内部演进不影响调度器、生成器、role-chat

### 1.3 非目标(明确边界)

- ❌ 不改后端 LLM 客户端接口(`ProviderConfig { baseURL, apiKey, model }` 已最小化,保持不变)
- ❌ 不改 SSE 流式协议
- ❌ 不重写调度器核心算法(只抽公共策略,不改 per-node-per-slot vs pickCandidate 两种模式选择)
- ❌ 不引入新数据库(仍在 SQLite + settings.json 二选一中决策,见 §7 trade-off)

---

## 2. 现状审计

### 2.1 节点池相关文件清单(按层分组)

#### 模型 / 类型层
| 文件 | 角色 |
|---|---|
| `frontend/src/services/types.ts:340-428` | Provider / ProviderNode / ProviderApiKey / ResolvedProviderNode / ProviderNodeType / ImageProtocol / ProviderRotationPolicy / ProviderApiKeyState / ModuleKey / ModuleModelMapping 的**独立、自包含**类型定义 |
| `frontend/src/store/types.ts:138-298` | AppState 巨型接口,把 `providers`/`providerNodes`/`moduleMapping` 与 books/chapters 等业务实体**并列**在同一接口 |
| `frontend/src/store/types.ts:31-126` | NodeTestForm / SystemPromptPreset / CleanRunState 等节点测试相关类型 |
| `server/src/llmClient.ts:4-8` | `ProviderConfig { baseURL, apiKey, model }` —— 后端连接级最小接口 |

#### 存储层
| 文件 | 角色 |
|---|---|
| `server/src/store/db.ts:24-41` | ENTITIES 表清单,**无 providers/providerNodes 表**(节点池不入 SQLite) |
| `server/src/routes/settings.ts:7-77` | `settings.json` 读写;节点池数据存于此文件,与 m1SystemPrompt/assetDir/theme 等混存 |
| `frontend/src/store/persistence.ts:157-182` | `settingsPayload` 把 providers/providerNodes/moduleMapping 与其他设置项混合,整体 POST /api/settings |
| `frontend/src/store/bootstrap.ts:45-135` | 启动时从 settings.json 读出 providers/providerNodes,含旧 ProviderNode → 新两层模型迁移 |

#### 路由 / 服务层
| 文件 | 角色 |
|---|---|
| `server/src/routes/settings.ts:79-115` | 仅 `/api/settings`(GET/POST)与 `/api/settings/resolved-paths`,**无 /api/nodes 或 /api/providers 专用路由** |
| `server/src/routes/llm.ts` | /api/llm/{test,clean,embed,chat} 只接收 {baseURL, apiKey, model},不感知节点池 |
| `server/src/routes/creation.*.ts` / `image.ts` / `gptImage.ts` / `xaiImage.ts` | 同上,均从请求体解构连接级参数 |
| `server/src/llmClient.ts` | OpenAI 兼容客户端,无状态、不依赖 ProviderNode |
| `frontend/src/services/real/llm.ts:56-65` | **自定义** `CleanNode` 接口(运行时节点结构,ProviderNode 子集 + name + apiKey) |
| `frontend/src/services/real/batch.ts:20-30` | **自定义** `BatchGenNode` 接口(与 CleanNode 几乎重复) |
| `frontend/src/services/real/generation.ts:24-101` | DraftParams/FinalizeParams/ConsistencyParams 只需 {baseURL, apiKey, model} |

#### 状态 slice 层
| 文件 | 角色 |
|---|---|
| `frontend/src/store/slices/providerSlice.ts:7-90` | 独立 slice:providers/providerNodes/moduleMapping CRUD + consumeProviderUsage 次数扣减 |
| `frontend/src/store/slices/nodeTestSlice.ts:26-134` | 节点测试域(testHistory/chatSessions/sessionRuntimes/systemPromptPresets),与池分离 |
| `frontend/src/store/appStore.ts:15-27` | 组合根,把 6 个 slice spread 进同一个 AppState |

#### 策略 / 纯函数层(已解耦)
| 文件 | 角色 |
|---|---|
| `frontend/src/utils/providerResolver.ts:50-188` | selectApiKey(Round-Robin/Failover)/ markKeyUsed / updateKeyStateByError / resolveProviderNode —— 纯函数 |
| `frontend/src/utils/provider.ts:14-100` | normalizeProvider / normalizeProviderNode / normalizeProviderApiKey —— 纯函数 |
| `frontend/src/utils/nodePicker.ts:19-67` | nodeVendorName / nodeLabel / isMultimodalNode / supportsImageEditNode / groupProviders —— 纯函数 |
| `frontend/src/services/real/circuitBreaker.ts:7-53` | NodeCircuitBreaker 类 —— 纯状态机 |
| `frontend/src/hooks/useModuleNode.ts:36-70` | useModuleNode hook:解析模块默认节点(localOverride → moduleMapping → 兜底) |

#### UI 层
| 文件 | 角色 |
|---|---|
| `frontend/src/pages/settings/panels/NodesTabContent.tsx:14-63` | 节点池管理 Tab,**接收 30+ props**(CRUD + 测试 + 模块映射 + M1 提示词 + 测试文本) |
| `frontend/src/pages/settings/index.tsx:112-1315` | SettingsPage 1300+ 行巨组件,集中编排所有节点池业务逻辑 |
| `frontend/src/pages/node-test/` | 节点测试独立页面,通过 useModuleNode + nodeTestGlobalForm 选节点 |
| `frontend/src/pages/batch-generate/index.tsx:21-25` | 批量生产页面,自己 resolveProviderNodes 并构造 BatchGenNode[] |
| `frontend/src/pages/book-reader/ImmersiveReader.tsx:418-430` | 单章清理,手工 resolveProviderNode + 构造 CleanNode |

#### 业务调用方
| 文件 | 角色 |
|---|---|
| `frontend/src/services/real/cleanScheduler.ts:48-397` | CleanScheduler 类,per-node-per-slot worker 模式,内嵌可用性检查 + 熔断 |
| `frontend/src/services/real/batch.ts:71-267` | startBatchGenerate,pickCandidate 选择策略,自定义 BatchGenNode |
| `frontend/src/services/sessionEngine.ts:64-120` | 节点测试引擎,接收 ResolvedProviderNode 作为 SendArgs.node |
| `frontend/src/services/roleChatEngine.ts:93-120` | 角色交流引擎,直接 resolveProviderNode 读 store |
| `frontend/src/services/real/cardImage.ts:27-78` | 卡片生图,接收 ResolvedProviderNode 按 protocol 分发 |

#### 配置导入/导出
| 文件 | 角色 |
|---|---|
| `frontend/src/utils/backup.ts:56-146` | SettingsPayload 包含 providers/providerNodes;buildBundle 支持 redactApiKeys;**无法单独导出节点池** |
| `frontend/src/pages/settings/index.tsx:574-761` | handleExport / confirmImportSettings,节点池导入走增量合并 |

### 2.2 评估维度评分

| 维度 | 分数 | 证据 |
|---|---|---|
| **独立数据模型** | **3/5** | `services/types.ts:340-428` 有自包含定义;但全部堆在 550 行 services/types.ts 巨文件里,且 AppState(store/types.ts:138-298)把 providers/providerNodes 与业务实体混在一个 god state 接口 |
| **独立存储层** | **1/5** | `db.ts:24-41` ENTITIES 无 providers/providerNodes 表;节点池存于 settings.json(settings.ts:7-10),与 m1SystemPrompt/assetDir/theme/splitPatterns 等设置项混存;无独立仓储层 |
| **独立服务/路由** | **0/5** | `server/src/routes/` 下无 nodes.ts/providers.ts;节点池 CRUD 全靠前端 zustand → settingsPayload → POST /api/settings 整体写(settings.ts:85-105);后端 LLM 路由只接收 {baseURL,apiKey,model},不感知节点池存在 |
| **独立状态 slice** | **3/5** | `providerSlice.ts:7-90` 是独立 slice,封装了 CRUD + consumeProviderUsage;但通过 `Pick<AppState,...>`(第 7-19 行)从 god state 派生,无法脱离 AppState 使用;持久化路径与其他设置项混合(persistence.ts:157-182) |
| **独立 UI 组件** | **1/5** | `NodesTabContent.tsx:14-63` 接收 30+ props,混合节点 CRUD + 测试 + 模块映射 + M1 提示词 + 测试文本;`SettingsPage index.tsx` 1300+ 行集中编排所有节点池业务逻辑(saveProvider/saveNode/testNode/concurrencyTestNode/runBatchTest/startRealTest/fetchModels/batchAddNodes) |
| **选择策略可复用** | **4/5** | providerResolver.ts:50-188 的 selectApiKey/markKeyUsed/updateKeyStateByError/resolveProviderNode 是纯函数;nodePicker.ts/provider.ts/circuitBreaker.ts 均无副作用。扣 1 分:`batch.ts:105-126` 的 pickCandidate 与 `cleanScheduler.ts:262-279` 的可用性检查逻辑(并发/间隔/次数限制)重复,未抽成独立策略函数 |
| **业务调用方依赖反转** | **3/5** | 后端 LLM 客户端只依赖 ProviderConfig(llmClient.ts:4-8)——✅;但前端调度器消费自定义 CleanNode/BatchGenNode(llm.ts:56-65、batch.ts:20-30),调用方需手工映射 ResolvedProviderNode→CleanNode(ImmersiveReader.tsx:427-430);roleChatEngine 直接读 store(第 97 行);调度器通过 isNodeAvailable 回调接收次数限制判定,依赖反转不彻底 |
| **配置导入/导出** | **2/5** | backup.ts:56-72 SettingsPayload 包含 providers/providerNodes;buildBundle 支持 redactApiKeys 脱敏;但**无法单独导出/导入节点池**——只能整体 settings 或 full 备份;导入增量合并逻辑写在 SettingsPage 里(index.tsx:625-642) |

**总分:17/40(42.5%)** —— 节点池处于"类型与纯函数层已独立、状态/UI/存储/路由层深度耦合"的中间状态。

> **审计纠正**:explore 初版报告称 `cleanScheduler.ts:105-126` 与 `batch.ts:105-126` 重复实现 pickCandidate。实际 `cleanScheduler.ts` **没有** pickCandidate 函数(它采用 per-node-per-slot worker 绑定模式,worker 在 `workerLoopForNode:253-324` 内自行检查可用性);只有 `batch.ts:105-126` 有 pickCandidate。两者真正重复的是 `NodeRuntime` 接口(cleanScheduler.ts:23-26 与 batch.ts:59-62 完全相同)与节点可用性检查逻辑(并发/间隔/次数限制)。本方案 §5.3 据此修正。

---

## 3. 核心结论

**节点池目前尚未成为独立、解耦、可复用的模块。** 它呈现出明显的"两极分化":

- **已解耦的部分(可复用)**:
  - 类型定义(services/types.ts:340-428 的 Provider/ProviderNode/ResolvedProviderNode 块)
  - 纯函数工具层(provider.ts / providerResolver.ts / nodePicker.ts / circuitBreaker.ts)已经是无副作用、无框架依赖的独立模块,可直接被任何项目引用
  - 后端 LLM 客户端只依赖 ProviderConfig 最小接口,不感知节点池

- **未解耦的部分(阻碍复用)**:
  1. **后端无专用路由与仓储**:节点池 CRUD 全靠 /api/settings 整体 PATCH,数据混存 settings.json
  2. **前端无独立 store**:providerSlice 通过 Pick<AppState,...> 从 god state 派生,无法脱离 AppState
  3. **UI 严重耦合**:NodesTabContent 30+ props 混合 CRUD+测试+模块映射+M1 提示词+测试文本;SettingsPage 1300+ 行巨组件编排所有节点池业务逻辑
  4. **调度器消费接口不统一**:CleanNode / BatchGenNode 重复定义,调用方需手工映射 ResolvedProviderNode
  5. **配置导入/导出无法单独操作节点池**:只能整体 settings 或 full 备份

主要耦合点是 **UI 层**(NodesTabContent + SettingsPage 把节点池管理与测试、模块映射、M1 提示词、测试文本绑死)和 **后端存储层**(无独立 API、无独立表、混存 settings.json)。

---

## 4. 阻碍复用的 TOP 5 耦合点

| 排名 | 耦合点 | file:line 引用 | 说明 |
|---|---|---|---|
| 1 | NodesTabContent 接收 30+ props,混合节点 CRUD + 测试 + 模块映射 + M1 提示词 + 测试文本 | `frontend/src/pages/settings/panels/NodesTabContent.tsx:14-63` | 无法独立打包复用;节点池管理与 4 类业务逻辑绑死 |
| 2 | SettingsPage 1300+ 行巨组件,集中编排所有节点池业务逻辑 | `frontend/src/pages/settings/index.tsx:112-1315` | saveProvider/saveNode/testNode/concurrencyTestNode/runBatchTest/startRealTest/fetchModels/batchAddNodes/confirmImportSettings 全写在此文件,节点池逻辑没有自己的组件/hook 边界 |
| 3 | 后端无 providers/providerNodes 表与专用路由 | `server/src/store/db.ts:24-41` + `server/src/routes/settings.ts:79-115` | 节点池数据混存 settings.json,CRUD 靠整体 POST /api/settings,无独立 API;后端无法独立提供节点池服务 |
| 4 | settingsPayload 把 providers/providerNodes 与其他设置项混合;providerSlice 从 god state 派生 | `frontend/src/store/persistence.ts:157-182` + `frontend/src/store/slices/providerSlice.ts:7-19` | 持久化路径与其他设置项混合;slice 通过 Pick<AppState,...> 派生,无法脱离 AppState 独立使用 |
| 5 | 调度器消费自定义 CleanNode/BatchGenNode 而非节点池抽象;NodeRuntime 接口与可用性检查两处重复 | `frontend/src/services/real/llm.ts:56-65` + `batch.ts:20-30,59-62,105-126` + `cleanScheduler.ts:23-26,262-279` | 调用方需手工映射 ResolvedProviderNode→CleanNode(ImmersiveReader.tsx:427-430);两套调度器各维护一套运行态 |

---

## 5. 实施方案 5.1-5.7

按"成本低→高"排序,前 3 项是零/小成本搬迁,后 4 项需要实质性重构。**强烈建议按 5.1→5.7 顺序执行,每步独立可验证、可回滚。**

### 5.1 类型独立(零成本)

**目标**:把节点池类型抽到独立文件,原位置 re-export 保持向后兼容。

**改动文件**:
- 新增:`packages/node-pool/types.ts`
- 修改:`frontend/src/services/types.ts`(删除 340-428 行块,改为 re-export)

**代码 sketch**:

```ts
// packages/node-pool/types.ts
export type ProviderNodeType = 'text' | 'image'
export type ImageProtocol = 'modelscope' | 'gpt' | 'xai'
export type ProviderApiKeyState = 'ok' | 'exhausted' | 'disabled'
export type ProviderRotationPolicy = 'round-robin' | 'failover'

export interface ProviderApiKey { /* ... 原样搬迁 ... */ }
export interface Provider { /* ... */ }
export interface ProviderNode { /* ... */ }
export interface ResolvedProviderNode extends ProviderNode { /* ... */ }
export type ModuleKey = /* ... */
export interface ModuleModelMapping { /* ... */ }
```

```ts
// frontend/src/services/types.ts(替换 340-428 行)
export type {
  ProviderNodeType, ImageProtocol, ProviderApiKeyState, ProviderRotationPolicy,
  Provider, ProviderApiKey, ProviderNode, ResolvedProviderNode,
  ModuleKey, ModuleModelMapping,
} from '../../../packages/node-pool/types'
```

**依赖**:无

**验证点**:
- `bun run typecheck`(frontend)通过
- `bun run lint` 通过
- 设置页节点池 Tab 正常渲染(零行为变化)

**回滚策略**:`git revert` 单次提交。无数据迁移,无破坏性。

**成本估计**:0.5 人时。

---

### 5.2 纯函数层独立(零成本)

**目标**:把已无副作用的纯函数/纯类整块迁入 `packages/node-pool/`。

**改动文件**:
- 新增:
  - `packages/node-pool/normalize.ts`(从 `frontend/src/utils/provider.ts` 迁入)
  - `packages/node-pool/resolver.ts`(从 `frontend/src/utils/providerResolver.ts` 迁入)
  - `packages/node-pool/picker.ts`(从 `frontend/src/utils/nodePicker.ts` 迁入)
  - `packages/node-pool/circuitBreaker.ts`(从 `frontend/src/services/real/circuitBreaker.ts` 迁入)
- 修改:原 4 个文件改为 re-export

**代码 sketch**(以 resolver 为例):

```ts
// packages/node-pool/resolver.ts
import type { Provider, ProviderApiKey, ProviderNode, ResolvedProviderNode } from './types'

export interface ResolverState {
  providers: Provider[]
  providerNodes: ProviderNode[]
}

export function selectApiKey(provider: Provider): { key: ProviderApiKey; keyId: string } | null {
  /* ... 原样搬迁 ... */
}

export function resolveProviderNode(state: ResolverState, nodeId: string): ResolvedProviderNode | null {
  /* ... */
}
```

**依赖**:5.1 完成(类型已独立)。

**验证点**:
- 现有 `circuitBreaker.test.ts`、`persistence.test.ts` 全部通过
- 节点测试、单章清理、批量生成端到端跑通

**回滚策略**:`git revert`。无数据迁移。

**成本估计**:1 人时(主要是路径调整 + re-export)。

---

### 5.3 调度策略抽出(小成本)

**目标**:消除 cleanScheduler / batch 两套调度器的重复部分,抽公共策略函数。

**纠正说明**:初版报告称两处重复 `pickCandidate`,实际只有 `batch.ts:105-126` 有 pickCandidate;`cleanScheduler.ts` 用 per-node-per-slot 模式,worker 在 `workerLoopForNode:253-324` 自检可用性。两者真正重复的是:
1. `NodeRuntime` 接口(`cleanScheduler.ts:23-26` 与 `batch.ts:59-62` 字段完全相同)
2. 节点可用性检查逻辑(并发 / 间隔 / 次数限制)

**改动文件**:
- 新增:
  - `packages/node-pool/runtime.ts` —— `NodeRuntime` 接口 + `NodeRuntimeMap` 类型
  - `packages/node-pool/policy.ts` —— `isNodeAvailableNow(cfg, state, opts)` / `pickLeastLoadedNode(nodeConfigs, states, opts)`
- 修改:
  - `frontend/src/services/real/cleanScheduler.ts` —— 删除本地 `NodeRuntime`,改 import;`workerLoopForNode` 内可用性检查调用 `isNodeAvailableNow`
  - `frontend/src/services/real/batch.ts` —— 删除本地 `NodeRuntime` 与 `pickCandidate`,改调用 `pickLeastLoadedNode`
  - `frontend/src/services/real/llm.ts:56-65` —— `CleanNode` 改为 `ResolvedProviderNode` 的别名或子集,消除重复定义
  - `frontend/src/services/real/batch.ts:20-30` —— `BatchGenNode` 同上

**代码 sketch**:

```ts
// packages/node-pool/runtime.ts
export interface NodeRuntime {
  activeCount: number
  lastRequestTime: number
}
export type NodeRuntimeMap = Map<string, NodeRuntime>
```

```ts
// packages/node-pool/policy.ts
import type { NodeRuntime, NodeRuntimeMap } from './runtime'

export interface NodeConfigBase {
  id: string
  maxConcurrency: number
  intervalSec: number
}

export interface AvailabilityOpts {
  now: number
  isExternalAvailable?: (nodeId: string) => boolean
}

/** 检查节点当前是否可接受新请求(并发未满 + 间隔已过 + 外部次数未耗尽) */
export function isNodeAvailableNow<C extends NodeConfigBase>(
  cfg: C, state: NodeRuntime | undefined, opts: AvailabilityOpts,
): boolean {
  if (!state) return false
  if (state.activeCount >= cfg.maxConcurrency) return false
  const intervalMs = cfg.intervalSec * 1000
  if (intervalMs > 0 && opts.now - state.lastRequestTime < intervalMs) return false
  if (opts.isExternalAvailable && !opts.isExternalAvailable(cfg.id)) return false
  return true
}

/** batch 调度器专用:从所有节点中选"最久未用→最少连接" */
export function pickLeastLoadedNode<C extends NodeConfigBase>(
  nodeConfigs: C[], states: NodeRuntimeMap, opts: AvailabilityOpts,
): { cfg: C; state: NodeRuntime } | null {
  const candidates: { cfg: C; state: NodeRuntime }[] = []
  for (const cfg of nodeConfigs) {
    const state = states.get(cfg.id)
    if (!state) continue
    if (!isNodeAvailableNow(cfg, state, opts)) continue
    candidates.push({ cfg, state })
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const timeDiff = a.state.lastRequestTime - b.state.lastRequestTime
    if (timeDiff !== 0) return timeDiff
    return a.state.activeCount - b.state.activeCount
  })
  return candidates[0]
}
```

**统一调度消费接口**(消除 CleanNode / BatchGenNode 重复):

```ts
// packages/node-pool/types.ts(追加)
/** 调度器消费的运行时节点视图——ResolvedProviderNode 的调度子集 */
export interface SchedulableNode {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  maxConcurrency: number
  intervalSec: number
}
```

```ts
// frontend/src/services/real/llm.ts
export type CleanNode = SchedulableNode  // 别名,向后兼容
```

**依赖**:5.1、5.2 完成。

**验证点**:
- `cleanScheduler.test.ts`(若存在)、`dequeue.test.ts` 通过
- M1 章节清理 E2E 跑通(单章 + 批量 + 暂停/停止 + 自动重试 + 模型切换)
- 批量章节生成 E2E 跑通(draft→finalize 串行 + 失败即停)
- 单章清理(ImmersiveReader.tsx)正常

**回滚策略**:`git revert`。无数据迁移。需重点回归调度器所有路径。

**成本估计**:4 人时(含回归测试)。

**Trade-off**:
- ✅ 消除重复定义,后续策略演进(如加权轮询)只改一处
- ✅ 调度器消费 `SchedulableNode` 后,ImmersiveReader 不再需手工映射 ResolvedProviderNode→CleanNode
- ⚠️ `cleanScheduler.ts` 的 per-node-per-slot 模式不直接用 `pickLeastLoadedNode`,但通过 `isNodeAvailableNow` 仍能复用核心逻辑
- ⚠️ `SchedulableNode` 引入后,旧 CleanNode/BatchGenNode 字段若不完全对齐需逐一核对(实际字段一致,风险低)

---

### 5.4 状态 slice 解耦(中成本)

**目标**:把 providerSlice 从 `Pick<AppState,...>` 派生改为独立 store,可脱离 AppState 使用。

**改动文件**:
- 新增:
  - `packages/node-pool/store.ts` —— `NodePoolState` 接口 + `createNodePoolStore()` 工厂
  - `packages/node-pool/persistence.ts` —— `serializeNodePool(state)` / `hydrateNodePool(raw)` 独立序列化
- 修改:
  - `frontend/src/store/slices/providerSlice.ts` —— 改为薄封装,委托给 `createNodePoolStore()`
  - `frontend/src/store/persistence.ts:157-182` —— `settingsPayload` 中节点池部分改调 `serializeNodePool`
  - `frontend/src/store/bootstrap.ts:45-135` —— 启动 hydrate 改调 `hydrateNodePool`
  - `frontend/src/store/appStore.ts:15-27` —— 节点池 slice 通过 interop 层接入 AppState(保持现有 API 兼容)

**代码 sketch**:

```ts
// packages/node-pool/store.ts
import { createStore, type StoreApi } from 'zustand'
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping } from './types'

export interface NodePoolState {
  providers: Provider[]
  providerNodes: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
  addProvider: (p: Provider) => void
  updateProvider: (p: Provider) => void
  removeProvider: (id: string) => void
  addProviderNode: (n: ProviderNode) => void
  updateProviderNode: (n: ProviderNode) => void
  removeProviderNode: (id: string) => void
  consumeProviderUsage: (nodeId: string) => boolean
}

export function createNodePoolStore(initial?: Partial<NodePoolState>): StoreApi<NodePoolState> {
  return createStore<NodePoolState>((set, get) => ({
    providers: initial?.providers ?? [],
    providerNodes: initial?.providerNodes ?? [],
    moduleMapping: initial?.moduleMapping ?? {},
    /* ... CRUD 实现,从 providerSlice.ts 原样搬迁 ... */
  }))
}
```

```ts
// frontend/src/store/slices/providerSlice.ts(改为 interop)
import { createNodePoolStore, type NodePoolState } from '../../../packages/node-pool/store'

// 单例节点池 store(独立于 AppState 存在)
export const nodePoolStore = createNodePoolStore()

// AppState 上的薄封装:把调用委托给 nodePoolStore
export const createProviderSlice: StateCreator<AppState, [], [], ProviderSlice> = (set, get) => ({
  get providers() { return nodePoolStore.getState().providers },
  /* ... 其他 getter 委托 ... */
  addProvider: (p) => nodePoolStore.getState().addProvider(p),
  /* ... */
})
```

**依赖**:5.1、5.2、5.3 完成。

**验证点**:
- `persistence.test.ts`、`appStore.test.ts` 通过
- 节点池 Tab CRUD 操作(增删改查、模块映射、次数扣减)正常
- 跨页面(设置页 → 节点测试 → 批量生成 → 单章清理)节点池状态一致

**回滚策略**:`git revert`。**需备份 settings.json**——若新版 hydrate 有 bug 可能导致节点池数据丢失,有 .bak 兜底(settings.ts:57-72 已有原子写)。

**成本估计**:8 人时(含 interop 层 + 回归)。

**Trade-off**:
- ✅ 节点池 store 可被任何项目独立引入
- ✅ 持久化路径独立,可单独 pushNodePoolNow()
- ⚠️ AppState 上的 getter 委托有性能开销(每次访问调 `nodePoolStore.getState()`),对热点路径(如 cleanScheduler worker 循环每 50ms 读节点)需注意——可在 interop 层做快照缓存
- ⚠️ interop 层增加复杂度;若彻底废除 AppState 上的 providers/providerNodes 字段,则需改所有调用方(本次不做,保留 interop 渐进迁移)

---

### 5.5 后端独立路由 + 仓储(中成本)

**目标**:后端提供专用 `/api/providers`、`/api/nodes` CRUD,数据从 settings.json 迁到 SQLite 独立表。

**改动文件**:
- 新增:
  - `server/src/routes/nodes.ts` —— providers/nodes CRUD 路由
  - `server/src/store/nodePoolRepository.ts` —— SQLite 仓储层
- 修改:
  - `server/src/store/db.ts:24-41` —— ENTITIES 增加 `providers`、`provider_nodes` 两张表
  - `server/src/index.ts` —— 注册 nodesRoutes
  - `frontend/src/services/api.ts` —— 新增 `providers.list/create/update/remove`、`nodes.list/create/update/remove` 方法
  - `frontend/src/services/real/llm.ts` 等调用方 —— 仍读前端 store,但 store 启动时从 /api/providers 拉取而非 settings.json
- 迁移脚本:
  - `server/src/store/migrateNodePool.ts` —— 一次性脚本:从 settings.json 读 providers/providerNodes,INSERT 到新表,然后从 settings.json 删除两键

**代码 sketch**:

```ts
// server/src/store/db.ts(追加表)
ENTITIES.providers = {
  sql: `CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    baseURL TEXT NOT NULL,
    rotationPolicy TEXT NOT NULL,
    apiKeysJSON TEXT NOT NULL,  -- ProviderApiKey[] 序列化
    createdAt INTEGER NOT NULL
  )`,
}
ENTITIES.provider_nodes = {
  sql: `CREATE TABLE IF NOT EXISTS provider_nodes (
    id TEXT PRIMARY KEY,
    providerId TEXT NOT NULL,
    nodeType TEXT NOT NULL,
    protocol TEXT,
    model TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    maxConcurrency INTEGER NOT NULL,
    batchChars INTEGER NOT NULL,
    intervalSec INTEGER NOT NULL,
    usageLimitEnabled INTEGER,
    usageLimit INTEGER,
    usageLeft INTEGER,
    usageResetDate TEXT,
    isMultimodal INTEGER,
    lastTestResult TEXT,
    FOREIGN KEY (providerId) REFERENCES providers(id) ON DELETE CASCADE
  )`,
}
```

```ts
// server/src/routes/nodes.ts
export async function nodesRoutes(app: FastifyInstance) {
  app.get('/api/providers', listProviders)
  app.post('/api/providers', createProvider)
  app.put('/api/providers/:id', updateProvider)
  app.delete('/api/providers/:id', deleteProvider)
  app.get('/api/nodes', listNodes)
  app.post('/api/nodes', createNode)
  app.put('/api/nodes/:id', updateNode)
  app.delete('/api/nodes/:id', deleteNode)
}
```

**迁移脚本要点**:
- 启动时检测 settings.json 是否含 `providers` 键;有则灌入新表,然后**从 settings.json 删除该键**(写回)
- 迁移前自动备份 settings.json 为 `settings.json.pre-migrate.bak`
- 迁移失败不删原键,下次启动重试

**依赖**:5.4 完成(前端 store 已独立,只需改 hydrate 来源)。

**验证点**:
- 后端单元测试:`nodesRoutes` CRUD 全覆盖
- 迁移脚本:造一份含 providers 的旧 settings.json,启动后确认数据进入 SQLite,settings.json 不再含 providers 键
- 前端:启动后节点池 Tab 数据正常显示(来源切换为 /api/providers)
- 设置页整体 POST /api/settings 不再包含 providers/providerNodes

**回滚策略**:
- 迁移脚本保留 `settings.json.pre-migrate.bak`,失败可手动恢复
- 后端 nodes.ts 路由可通过环境变量 `NODE_POOL_LEGACY_SETTINGS=true` 退回读 settings.json(过渡期保留 1-2 个版本)
- 数据库新表不影响旧表,可直接 drop

**成本估计**:12 人时(含迁移脚本 + 回归)。

**Trade-off**(关键决策点):
- ✅ 后端真正独立提供节点池服务,未来可被其他前端/CLI 复用
- ✅ SQLite 事务性优于 settings.json 整体写,并发安全
- ⚠️ **重大破坏性变更**:迁移失败可能丢节点池数据,需充分测试 + 多重备份
- ⚠️ 增加后端复杂度(新表、新路由、迁移脚本)
- **替代方案**:不迁 SQLite,仅在 settings.json 上加 `/api/providers`、`/api/nodes` 路由(读写 settings.json 的 providers/providerNodes 键)。成本低、无迁移风险,但失去 SQLite 事务性,且后端仍混存。**建议:先做替代方案(过渡),后续再迁 SQLite**

---

### 5.6 UI 组件拆分(高成本但机械)

**目标**:把 NodesTabContent 拆为 5 个职责单一的子组件,把 SettingsPage 的节点池业务逻辑抽到独立 hooks。

**改动文件**:
- 新增:
  - `packages/node-pool/ui/NodePoolManager.tsx` —— 纯 CRUD(只接收 providers/providerNodes/onCrud)
  - `packages/node-pool/ui/NodeTestPanel.tsx` —— 测试入口
  - `packages/node-pool/ui/ModuleMappingPanel.tsx` —— 模块映射
  - `frontend/src/pages/settings/panels/M1PromptPanel.tsx` —— M1 提示词(留在主项目,不进 node-pool)
  - `frontend/src/pages/settings/panels/TestTextPanel.tsx` —— 测试文本(同上)
  - `frontend/src/hooks/useNodePoolCrud.ts` —— saveProvider/saveNode/duplicateNode/moveNode
  - `frontend/src/hooks/useNodeTesting.ts` —— testNode/concurrencyTestNode/runBatchTest/startRealTest/fetchModels/batchAddNodes
- 修改:
  - `frontend/src/pages/settings/panels/NodesTabContent.tsx` —— 改为组合 5 个子组件,props 从 30+ 降到 ~10
  - `frontend/src/pages/settings/index.tsx:112-1315` —— 节点池逻辑调用 hooks,SettingsPage 体积减半

**代码 sketch**(NodePoolManager):

```tsx
// packages/node-pool/ui/NodePoolManager.tsx
export interface NodePoolManagerProps {
  providers: Provider[]
  providerNodes: ProviderNode[]
  resolvedNodes: ResolvedProviderNode[]
  nodeTypeFilter: ProviderNodeType
  onNodeTypeFilterChange: (v: ProviderNodeType) => void
  onAddProvider: () => void
  onEditProvider: (p: Provider) => void
  onAddNodeForProvider: (providerId: string) => void
  onEditNode: (node: ProviderNode, provider: Provider) => void
  onRemoveProvider: (id: string) => void
  onRemoveNode: (id: string) => void
  onToggleNodeEnabled: (node: ProviderNode, enabled: boolean) => void
  onMoveNode: (nodeId: string, dir: -1 | 1) => void
  onDuplicateNode: (node: ProviderNode) => void
  nodeGroupExpanded: Record<string, boolean>
  onToggleGroup: (key: string) => void
  // 测试入口通过 children 注入,保持 Manager 纯 CRUD
  children?: React.ReactNode
}
```

**依赖**:5.4 完成(store 独立,UI 可独立打包)。

**验证点**:
- 节点池 Tab 视觉与交互零变化(截图对比)
- 每个子组件可独立 mount 渲染(Storybook 或单测)
- `useNodePoolCrud` / `useNodeTesting` 单元测试通过

**回滚策略**:`git revert`。无数据迁移。

**成本估计**:16 人时(UI 拆分机械但量大,含回归)。

**Trade-off**:
- ✅ NodePoolManager 可独立打包复用
- ✅ SettingsPage 减负,可维护性大幅提升
- ⚠️ M1PromptPanel / TestTextPanel 不进 node-pool(它们是 novelhelper 业务),拆分边界需谨慎
- ⚠️ 30+ props 拆到 5 个子组件后,组合层(props 传递)可能更复杂——建议配 context 或 hooks 减少透传

---

### 5.7 导入/导出独立(小成本)

**目标**:支持单独导出/导入节点池配置,不必整体 settings 备份。

**改动文件**:
- 修改:`frontend/src/utils/backup.ts` —— 新增 `buildNodePoolBundle(state, { redact })` / `parseNodePoolBundle(raw)`
- 修改:`frontend/src/pages/settings/index.tsx:574-761` —— 节点池 Tab 增加"导出节点池" / "导入节点池"按钮
- 新增:`packages/node-pool/serialize.ts` —— 独立序列化(供 backup.ts 与 5.4 persistence 共用)

**代码 sketch**:

```ts
// packages/node-pool/serialize.ts
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping } from './types'
import { normalizeProvider, normalizeProviderNode } from './normalize'

export interface NodePoolBundle {
  version: 1
  providers: Provider[]
  providerNodes: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
}

export function serializeNodePool(state: NodePoolState, opts: { redact?: boolean } = {}): NodePoolBundle {
  return {
    version: 1,
    providers: state.providers.map((p) => opts.redact ? redactProvider(p) : normalizeProvider(p)),
    providerNodes: state.providerNodes.map(normalizeProviderNode),
    moduleMapping: state.moduleMapping,
  }
}

export function hydrateNodePoolBundle(raw: unknown): NodePoolBundle {
  // 校验 + 默认值 + 旧版本迁移
}

function redactProvider(p: Provider): Provider {
  return { ...p, apiKeys: p.apiKeys.map((k) => ({ ...k, key: k.key.slice(0, 4) + '****' })) }
}
```

**依赖**:5.1、5.2 完成(类型与 normalize 已独立)。

**验证点**:
- 导出节点池 → JSON 文件 → 导入另一实例,节点池完整还原
- 脱敏模式:apiKeys.key 显示 `sk-1****`
- 与整体 settings 备份兼容(整体备份仍包含节点池,不冲突)

**回滚策略**:`git revert`。无数据迁移。

**成本估计**:3 人时。

---

## 6. Trade-off 分析(跨阶段)

### 6.1 monorepo vs 单项目内子目录

| 方案 | 优势 | 劣势 |
|---|---|---|
| `packages/node-pool/`(monorepo 风格) | 真正独立,可单独发布 npm | 需引入 workspace 配置(pnpm workspace / turbo),构建复杂度上升 |
| `frontend/src/packages/node-pool/`(单项目子目录) | 零构建配置改动,路径相对引用 | 仍嵌在 frontend,不能被其他项目直接 npm install |

**建议**:先做单项目子目录(`frontend/src/packages/node-pool/`),验证解耦完整后再升级为 monorepo 包。本次方案 §5 全部基于子目录路径,后续升级为 monorepo 仅需改 import 路径。

### 6.2 SQLite vs settings.json(§5.5 决策)

| 方案 | 优势 | 劣势 |
|---|---|---|
| 迁 SQLite(§5.5 主方案) | 事务性、并发安全、可独立查询 | 迁移风险大、破坏性变更 |
| 仅加路由仍存 settings.json(过渡方案) | 零迁移风险、立即获得独立 API | 失去事务性、后端仍混存 |

**建议**:5.5 拆两步执行:5.5a 加 `/api/providers`、`/api/nodes` 路由但仍读写 settings.json 的 providers/providerNodes 键(过渡);5.5b 后续再迁 SQLite(可独立排期)。本次方案文档不强制 5.5b 时机。

### 6.3 interop 保留 vs 彻底废除 AppState 节点池字段(§5.4 决策)

| 方案 | 优势 | 劣势 |
|---|---|---|
| interop 层(§5.4 主方案) | 调用方零改动,渐进迁移 | 双层状态、性能开销 |
| 彻底废除 AppState.providers/providerNodes | 单一数据源、性能最优 | 需改所有 `useAppState(s => s.providers)` 调用方,改动量大 |

**建议**:5.4 用 interop 层;后续在 5.6 UI 拆分时,新组件直接用 `nodePoolStore`,旧组件逐步迁移,最终废除 interop。

---

## 7. 与其他模块联动影响评估

### 7.1 调度器(cleanScheduler / batch)

- **影响**:5.3 抽出 `isNodeAvailableNow` / `pickLeastLoadedNode` 后,两个调度器各删 ~15 行本地实现
- **风险**:`cleanScheduler` 的 per-node-per-slot 模式与 `batch` 的 pickCandidate 模式本质不同,5.3 只复用"可用性检查",不改"选节点策略",风险可控
- **回归重点**:M1 自动重试(autoRetry)、模型切换(switchBatchNode)、节点热更新(hotUpdateNodes)、节点熔断

### 7.2 role-chat 引擎

- **影响**:`roleChatEngine.ts:93-120` 直接 `resolveProviderNode` 读 store;5.4 后 store 独立,需改 import 路径
- **风险**:零(纯 import 路径变更)
- **回归重点**:角色对话流式输出、模型切换

### 7.3 卡片生图(cardImage)

- **影响**:`cardImage.ts:27-78` 接收 ResolvedProviderNode 按 protocol 分发(modelscope/gpt/xai);5.1 类型独立后,protocol 类型从 node-pool 导出,无逻辑变化
- **风险**:零
- **回归重点**:三种协议的生图流程

### 7.4 节点测试(node-test)

- **影响**:`nodeTestSlice.ts` 与 providerSlice 已分离,5.4 不影响;`sessionEngine.ts` 接收 ResolvedProviderNode,5.1 后类型从 node-pool 导出
- **风险**:零
- **回归重点**:文本/多模态/图片三种测试、对话记录、System Instructions 预设

### 7.5 单章清理(ImmersiveReader)

- **影响**:`ImmersiveReader.tsx:418-430` 手工 `resolveProviderNode` + 构造 CleanNode;5.3 引入 `SchedulableNode` 后,ResolvedProviderNode 直接满足接口,无需手工映射
- **风险**:低(字段对齐即可)
- **回归重点**:单章清理流式 + DiffView + 接受覆盖

### 7.6 批量生成(batch-generate)

- **影响**:`batch-generate/index.tsx:21-25` 自己 resolveProviderNodes 并构造 BatchGenNode[];5.3 后 BatchGenNode = SchedulableNode,ResolvedProviderNode 直接满足
- **风险**:低
- **回归重点**:draft→finalize 串行、失败即停、节点热更新

### 7.7 设置页其他 Tab

- **影响**:GeneralTabContent / AdvancedTabContent / BackupTabContent 与节点池无耦合,5.x 不影响
- **风险**:零

### 7.8 备份/恢复(backup)

- **影响**:5.7 增加 `buildNodePoolBundle` 独立导出;整体 settings 备份仍包含节点池,兼容
- **风险**:零(纯增量)
- **回归重点**:整体备份/恢复、节点池单独导出/导入、脱敏

---

## 8. 风险与回滚矩阵

| 阶段 | 主要风险 | 回滚策略 | 数据影响 |
|---|---|---|---|
| 5.1 | 类型 re-export 路径错误 | git revert | 无 |
| 5.2 | 纯函数搬迁后循环依赖 | git revert | 无 |
| 5.3 | 调度器行为微变(可用性检查边界条件) | git revert + 调度器 E2E 回归 | 无 |
| 5.4 | interop 层性能问题 / hydrate bug | git revert + settings.json.bak 恢复 | 低(有 .bak) |
| 5.5a | 路由层 bug(过渡方案) | 退回读 settings.json | 无 |
| 5.5b | **迁移脚本丢数据** | settings.json.pre-migrate.bak 恢复 | **高**(需充分测试) |
| 5.6 | UI 拆分后 props 透传断裂 | git revert | 无 |
| 5.7 | 导入/导出格式不兼容 | 旧版本 backup 仍可用 | 无 |

---

## 9. 验收清单(模块化完成后的可复用性测试)

- [ ] `packages/node-pool/` 可被独立 import,不依赖 novelhelper 任何业务代码
- [ ] `packages/node-pool/types.ts` 类型定义自包含
- [ ] `packages/node-pool/{resolver,normalize,picker,circuitBreaker}.ts` 为纯函数/纯类,无副作用
- [ ] `packages/node-pool/policy.ts` 的 `isNodeAvailableNow` / `pickLeastLoadedNode` 有单元测试覆盖
- [ ] `packages/node-pool/store.ts` 的 `createNodePoolStore()` 可独立 createStore
- [ ] `packages/node-pool/ui/NodePoolManager.tsx` 可独立 mount,接收 props 渲染
- [ ] `packages/node-pool/serialize.ts` 的 `serializeNodePool` / `hydrateNodePoolBundle` 有单元测试
- [ ] 后端 `/api/providers`、`/api/nodes` CRUD 路由独立可用(5.5a 完成后)
- [ ] 调度器消费 `SchedulableNode` 接口,不再自定义 CleanNode/BatchGenNode
- [ ] 节点池可单独导出/导入(不依赖整体 settings 备份)
- [ ] 所有现有 E2E 路径(M1 清理、批量生成、单章清理、role-chat、节点测试、卡片生图)零行为变化

---

## 10. 不在本次范围

- ❌ 不改后端 LLM 客户端接口(`ProviderConfig { baseURL, apiKey, model }`)
- ❌ 不改 SSE 流式协议
- ❌ 不重写调度器核心算法(per-node-per-slot vs pickCandidate 模式选择保持不变)
- ❌ 不强制升级为 monorepo(先做单项目子目录,后续再议)
- ❌ 不强制迁 SQLite(5.5a 过渡方案优先,5.5b 独立排期)
- ❌ 不改 node-test 模块(已与 providerSlice 解耦)
- ❌ 不改 role-chat / cardImage 业务逻辑(只改 import 路径)

---

## 11. 实施顺序与依赖图

```
5.1 类型独立 (零成本)
   ↓
5.2 纯函数层独立 (零成本)
   ↓
5.3 调度策略抽出 (小成本)  ←─── 依赖 5.1+5.2
   ↓
5.4 状态 slice 解耦 (中成本)  ←─── 依赖 5.1+5.2 (5.3 可并行)
   ↓
5.5a 后端独立路由(过渡) (小成本)  ←─── 依赖 5.4
   ↓ (可选,独立排期)
5.5b 迁 SQLite (中成本)
   ↓
5.6 UI 组件拆分 (高成本)  ←─── 依赖 5.4
   ↓
5.7 导入/导出独立 (小成本)  ←─── 依赖 5.1+5.2 (可早期并行)
```

**建议实施批次**:
- **批次 1(零成本,可一次提交)**:5.1 + 5.2 + 5.7
- **批次 2(小成本)**:5.3
- **批次 3(中成本)**:5.4
- **批次 4(小成本过渡)**:5.5a
- **批次 5(高成本)**:5.6
- **批次 6(可选)**:5.5b

**总成本估计**:44.5 人时(不含 5.5b)/ 56.5 人时(含 5.5b)

---

## 12. 历史纠正记录

| 日期 | 纠正项 |
|---|---|
| 2026-06-29 | explore 初版报告称 `cleanScheduler.ts:105-126` 与 `batch.ts:105-126` 重复 pickCandidate。实际 cleanScheduler 无 pickCandidate(采用 per-node-per-slot worker 模式),worker 在 `workerLoopForNode:253-324` 内自检可用性。两者真正重复的是 `NodeRuntime` 接口与可用性检查逻辑。§5.3 已据此修正。 |
