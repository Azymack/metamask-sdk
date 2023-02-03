import { Duplex } from 'stream';

export interface PostMessageStream extends Duplex {
  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void;
  start(): void;
}
