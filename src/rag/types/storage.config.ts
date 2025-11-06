import { StorageEngine } from 'multer';
import { Request } from 'express';
import type { FileNameCallback, UploadedFileType } from './file-upload.types';

export interface StorageConfig {
  storage: StorageEngine;
}

class FileStorage implements StorageEngine {
  constructor(
    private destination: string,
    private filenameCallback: (
      req: Request,
      file: UploadedFileType,
      cb: FileNameCallback,
    ) => void,
  ) {}

  _handleFile(
    req: Request,
    file: Express.Multer.File,
    callback: (
      error?: Error | null,
      info?: Partial<Express.Multer.File>,
    ) => void,
  ): void {
    try {
      this.filenameCallback(
        req,
        file as UploadedFileType,
        (error, filename) => {
          if (error) {
            callback(error);
            return;
          }
          callback(null, {
            destination: this.destination,
            filename,
            path: `${this.destination}/${filename}`,
          });
        },
      );
    } catch (error) {
      callback(error as Error);
    }
  }

  _removeFile(
    _req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ): void {
    // Since we don't need to handle file removal in this implementation
    callback(null);
  }
}

export const createStorage = (
  destination: string,
  filenameCallback: (
    req: Request,
    file: UploadedFileType,
    cb: FileNameCallback,
  ) => void,
): StorageConfig => {
  return {
    storage: new FileStorage(destination, filenameCallback),
  };
};
