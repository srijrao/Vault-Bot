declare module 'yazl' {
  import { Readable } from 'stream';
  import { Stats } from 'fs';

  export interface Options {
    compress?: boolean;
    mtime?: Date | null;
    mode?: number;
  }

  export class ZipFile {
    outputStream: Readable;
    addFile(realPath: string, metadataPath: string, options?: Options): void;
    addReadStream(readStream: Readable, metadataPath: string, options?: Options): void;
    end(): void;
  }
}
