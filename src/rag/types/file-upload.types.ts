import type { Request } from 'express';
import { BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

// Define types for callbacks
export type FileFilterCallback = (
  error: Error | null,
  acceptFile: boolean,
) => void;
export type FileNameCallback = (error: Error | null, filename: string) => void;

// Define file type
export interface UploadedFileType extends Express.Multer.File {
  destination: string;
  filename: string;
  path: string;
}

// Define fields interface for multiple files
export interface FileFields {
  events?: UploadedFileType[];
  guests?: UploadedFileType[];
}

// Storage config functions
export const generateFilename = (
  _req: Request,
  file: UploadedFileType,
  cb: FileNameCallback,
  prefix = '',
): void => {
  try {
    const randomName = `${prefix}${uuidv4()}`;
    cb(null, `${randomName}${extname(file.originalname as string)}`);
  } catch (error) {
    cb(error as Error, '');
  }
};

// File filter function
export const csvFileFilter = (
  _req: Request,
  file: UploadedFileType,
  cb: FileFilterCallback,
): void => {
  if (file.mimetype !== 'text/csv') {
    cb(new BadRequestException('Only CSV files are allowed'), false);
    return;
  }
  cb(null, true);
};
