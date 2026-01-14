/**
 * Uploads Routes
 * 
 * Provides endpoint for uploading files to temporary directory
 * Used for preview before roll creation
 */

import express, { Request, Response, Router } from 'express';
import { uploadTmp } from '../config/multer';

const router: Router = express.Router();

// Type for multer file
interface UploadedFile {
  originalname: string;
  filename: string;
  path: string;
}

// Response type for uploaded files
interface UploadedFileResponse {
  originalName: string;
  tmpName: string;
  tmpPath: string;
  url: string;
}

/**
 * POST /api/uploads
 * Upload multiple files to tmp directory (for preview)
 * Multipart form, field name "files"
 * Returns { ok: true, files: [{ originalName, tmpName, url }] }
 */
router.post('/', uploadTmp.array('files', 100), (req: Request, res: Response) => {
  try {
    const files = (req.files as UploadedFile[]) || [];
    const uploaded: UploadedFileResponse[] = files.map(f => ({
      originalName: f.originalname,
      tmpName: f.filename,
      tmpPath: f.path,
      url: `/uploads/tmp/${f.filename}`
    }));
    res.json({ ok: true, files: uploaded });
  } catch (err) {
    console.error('POST /api/uploads error', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;

// CommonJS compatibility
module.exports = router;
