/**
 * Multer configuration module
 * 
 * Provides pre-configured multer instances for:
 * - uploadDefault: General file uploads to uploads directory
 * - uploadTmp: Temporary files in local temp (not cloud-synced)
 * - uploadFilm: Film files with 10MB limit
 */

import multer, { StorageEngine, Multer } from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadsDir, localTmpDir, filmDir } from './paths';
import { Request } from 'express';

/**
 * Generate unique filename with timestamp and UUID
 */
const generateFilename = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, filename: string) => void
): void => {
  const unique = `${Date.now()}-${uuidv4()}${path.extname(file.originalname) || ''}`;
  cb(null, unique);
};

/**
 * Default storage - uploads directory
 */
const storageDefault: StorageEngine = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => cb(null, uploadsDir),
  filename: generateFilename
});

const uploadDefault: Multer = multer({ storage: storageDefault });

/**
 * Temporary storage - local OS temp (not cloud-synced)
 * Important: Keeps temp uploads in local OS temp to avoid file-lock contention
 */
const storageTmp: StorageEngine = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => cb(null, localTmpDir),
  filename: generateFilename
});

// Allow larger single files for batch roll creation (200MB limit)
const uploadTmp: Multer = multer({ 
  storage: storageTmp, 
  limits: { fileSize: 200 * 1024 * 1024 } 
});

/**
 * Film storage - dedicated film directory
 */
const storageFilm: StorageEngine = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => cb(null, filmDir),
  filename: generateFilename
});

const uploadFilm: Multer = multer({ 
  storage: storageFilm, 
  limits: { fileSize: 10 * 1024 * 1024 } 
});

export { uploadDefault, uploadTmp, uploadFilm };

// CommonJS compatibility
module.exports = { uploadDefault, uploadTmp, uploadFilm };
