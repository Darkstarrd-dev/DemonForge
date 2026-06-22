// Type definitions for omggif
declare module 'omggif' {
  export class GifReader {
    constructor(data: Uint8Array);
    width: number;
    height: number;
    numFrames(): number;
    frameInfo(frameNum: number): {
      x: number;
      y: number;
      width: number;
      height: number;
      disposal: number;
      delay: number;
      transparent_index?: number;
    };
    decodeAndBlitFrameRGBA(frameNum: number, pixels: Uint8ClampedArray): void;
  }

  export class GifWriter {
    constructor(buf: Uint8Array, width: number, height: number, options?: {
      loop?: number;
      palette?: Uint8Array;
    });
    addFrame(
      x: number,
      y: number,
      width: number,
      height: number,
      indexedPixels: Uint8Array,
      options?: {
        delay?: number;
        disposal?: number;
        transparent?: number;
        palette?: Uint8Array;
      }
    ): void;
    end(): number;
  }
}
