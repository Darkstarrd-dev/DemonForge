// 修正gif.js的类型定义
declare module 'gif.js' {
  interface GifOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
    transparent?: number | string;
    background?: string;
    repeat?: number;
    dither?: boolean;
  }

  interface FrameOptions {
    delay?: number;
    copy?: boolean;
    dispose?: number;
  }

  export default class GIF {
    constructor(options?: GifOptions);
    addFrame(image: HTMLCanvasElement | CanvasRenderingContext2D | ImageData, options?: FrameOptions): void;
    on(event: 'finished', callback: (blob: Blob) => void): void;
    on(event: 'progress', callback: (progress: number) => void): void;
    on(event: 'abort', callback: () => void): void;
    render(): void;
    abort(): void;
    running: boolean;
  }
}
