declare module 'tar-stream' {
  import { Readable, Writable } from 'stream';

  interface EntryHeader {
    name: string;
    size?: number;
    mode?: number;
    mtime?: Date | number;
    type?: 'file' | 'directory' | 'symlink' | 'link';
  }

  interface Pack extends Writable {
    entry(header: EntryHeader, cb?: (err?: unknown) => void): Writable;
    finalize(): void;
    pipe<T extends NodeJS.WritableStream>(dest: T, opts?: any): T;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export function pack(): Pack;
}
