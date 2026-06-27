// M2 设定卡片 · 批量生图服务层——按节点协议派发到三协议生图服务，附带小并发池。
// 复用 services/real/{image,gptImage,xaiImage}.ts，协议分支参考 sessionEngine.ts。
// done.image 现为 /api/image/file/<name> 归档 URL（非 b64），直接存进卡片。

import type { ProviderNode } from '../types'
import { generateImage } from './image'
import { generateImageGpt } from './gptImage'
import { generateImageXai } from './xaiImage'

/** 各协议可调的生图参数（面板可配，均有默认值）。 */
export interface CardImageParams {
  /** ModelScope / GPT 的尺寸，如 '1024x1024' */
  size?: string
  /** GPT 画质 'high' / 留空标准 */
  gptQuality?: string
  /** GPT 背景 'transparent' / 留空不透明 */
  gptBackground?: string
  /** xAI 宽高比，如 '1:1' */
  xaiAspectRatio?: string
  /** xAI 分辨率，如 '2k' */
  xaiResolution?: string
}

/** 在指定图片节点上生成一张图，resolve 出归档文件 URL。失败 / 中止抛错。 */
export async function generateOneCardImage(
  node: ProviderNode,
  prompt: string,
  params: CardImageParams,
  signal?: AbortSignal,
): Promise<string> {
  const protocol = node.protocol ?? 'modelscope'

  return new Promise<string>((resolve, reject) => {
    const onDone = (url: string) => resolve(url)

    if (protocol === 'gpt') {
      generateImageGpt(
        {
          baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, prompt,
          ...(params.size ? { size: params.size } : {}),
          ...(params.gptQuality ? { quality: params.gptQuality } : {}),
          ...(params.gptBackground ? { background: params.gptBackground } : {}),
        },
        { done: ({ image }) => onDone(image) },
        signal,
      ).catch(reject)
      return
    }

    if (protocol === 'xai') {
      generateImageXai(
        {
          baseURL: node.baseURL, apiKey: node.apiKey ?? '', model: node.model, prompt,
          ...(params.xaiAspectRatio ? { aspectRatio: params.xaiAspectRatio } : {}),
          ...(params.xaiResolution ? { resolution: params.xaiResolution } : {}),
        },
        { done: ({ image }) => onDone(image) },
        signal,
      ).catch(reject)
      return
    }

    // modelscope（默认）
    generateImage(
      {
        baseURL: node.baseURL, apiKey: node.apiKey ?? '', model: node.model, prompt,
        ...(params.size ? { size: params.size } : {}),
      },
      { done: ({ image }) => onDone(image) },
      signal,
    ).catch(reject)
  })
}

export type BatchItemStatus = 'pending' | 'generating' | 'done' | 'failed'

export interface BatchItemUpdate {
  index: number
  status: BatchItemStatus
  /** 成功时的归档 URL */
  url?: string
  /** 失败时的错误信息 */
  error?: string
}

/** 小并发池跑一批生图：每项状态经 onUpdate 上报；单项失败不中断其他项。 */
export async function runImageBatch(
  node: ProviderNode,
  prompts: string[],
  opts: { concurrency: number; params: CardImageParams; onUpdate: (u: BatchItemUpdate) => void },
  signal?: AbortSignal,
): Promise<void> {
  const { concurrency, params, onUpdate } = opts
  let cursor = 0
  const total = prompts.length

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return
      const index = cursor++
      if (index >= total) return
      onUpdate({ index, status: 'generating' })
      try {
        const url = await generateOneCardImage(node, prompts[index], params, signal)
        onUpdate({ index, status: 'done', url })
      } catch (e) {
        if (signal?.aborted) return
        onUpdate({ index, status: 'failed', error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  const n = Math.max(1, Math.min(concurrency, total))
  await Promise.all(Array.from({ length: n }, () => worker()))
}
