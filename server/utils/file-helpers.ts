/**
 * File Helpers - TypeScript Migration
 * 
 * Provides file move/copy operations with OneDrive-aware retry logic.
 */

import fs from 'fs';
import path from 'path';
import fsPromises from 'fs/promises';

/**
 * Synchronously move a file from src to dest.
 * Handles cross-device moves and locked files.
 */
export function moveFileSync(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    // Try atomic rename first
    fs.renameSync(src, dest);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EXDEV') {
      // Cross-device: copy and unlink
      fs.copyFileSync(src, dest);
      try { fs.unlinkSync(src); } catch (e) { /* ignore - source cleanup is best effort */ }
    } else if (error.code === 'EPERM' || error.code === 'EBUSY') {
      // Locked or permission issue.
      // Do NOT unlink dest explicitly, as it causes data loss if subsequent write fails.
      // Try copyFileSync which overwrites and might handle locks differently or at least fail safely.
      try {
        fs.copyFileSync(src, dest);
        try { fs.unlinkSync(src); } catch (e) { /* ignore - source cleanup is best effort */ }
      } catch (copyErr) {
        // If copy fails, throw the error. Dest is preserved (if it existed).
        console.error('moveFileSync failed (locked?):', copyErr);
        throw copyErr;
      }
    } else {
      throw err;
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Asynchronously move a file with retry logic for OneDrive sync contention.
 */
export async function moveFileAsync(src: string, dest: string, retries: number = 8): Promise<void> {
  await fsPromises.mkdir(path.dirname(dest), { recursive: true });
  
  for (let i = 0; i < retries; i++) {
    try {
      await fsPromises.rename(src, dest);
      return;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      console.log(`[moveFileAsync] Attempt ${i+1}/${retries} failed for ${path.basename(src)} -> ${path.basename(dest)}: ${error.code}`);
      const isLastAttempt = i === retries - 1;
      if (error.code === 'EXDEV') {
        // Cross-device: copy then unlink
        console.log(`[moveFileAsync] Cross-device move detected, using copy+unlink strategy`);
        await fsPromises.copyFile(src, dest);
        await fsPromises.unlink(src).catch(() => {});
        return;
      }
      
      // OneDrive sync or file system contention
      if (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EAGAIN') {
        if (isLastAttempt) {
          console.error(`[moveFileAsync] All ${retries} attempts failed for ${path.basename(src)}`);
          console.error(`[moveFileAsync] This may be caused by OneDrive sync locking the file. Error: ${error.message}`);
          throw err;
        }
        // Progressive backoff: 500ms, 1000ms, 1500ms, 2000ms, 2500ms, 3000ms, 3500ms, 4000ms
        const delay = 500 * (i + 1);
        console.log(`[moveFileAsync] File may be locked by OneDrive sync. Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      
      throw err;
    }
  }
}

/**
 * Asynchronously copy a file with retry logic for OneDrive sync contention.
 */
export async function copyFileAsyncWithRetry(src: string, dest: string, retries: number = 8): Promise<void> {
  await fsPromises.mkdir(path.dirname(dest), { recursive: true });

  for (let i = 0; i < retries; i++) {
    try {
      await fsPromises.copyFile(src, dest);
      return;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      console.log(`[copyFileAsync] Attempt ${i + 1}/${retries} failed for ${path.basename(src)} -> ${path.basename(dest)}: ${error.code}`);
      const isLastAttempt = i === retries - 1;

      if (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EAGAIN') {
        if (isLastAttempt) {
          console.error(`[copyFileAsync] All ${retries} attempts failed for ${path.basename(src)}`);
          console.error(`[copyFileAsync] This may be caused by OneDrive sync locking the destination. Error: ${error.message}`);
          throw err;
        }
        // Progressive backoff for OneDrive sync contention
        const delay = 500 * (i + 1);
        console.log(`[copyFileAsync] Destination may be locked by OneDrive sync. Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }
}

// CommonJS compatibility
module.exports = { moveFileSync, moveFileAsync, copyFileAsyncWithRetry };
