const fs = require('fs');
const path = require('path');
const fsPromises = require('fs').promises;

function moveFileSync(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    // Try atomic rename first
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-device: copy and unlink
      fs.copyFileSync(src, dest);
      try { fs.unlinkSync(src); } catch (e) { /* ignore - source cleanup is best effort */ }
    } else if (err.code === 'EPERM' || err.code === 'EBUSY') {
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function moveFileAsync(src, dest, retries = 8) {
  await fsPromises.mkdir(path.dirname(dest), { recursive: true });
  
  for (let i = 0; i < retries; i++) {
    try {
      await fsPromises.rename(src, dest);
      return;
    } catch (err) {
      console.log(`[moveFileAsync] Attempt ${i+1}/${retries} failed for ${path.basename(src)} -> ${path.basename(dest)}: ${err.code}`);
      const isLastAttempt = i === retries - 1;
      if (err.code === 'EXDEV') {
        // Cross-device: copy then unlink
        console.log(`[moveFileAsync] Cross-device move detected, using copy+unlink strategy`);
        await fsPromises.copyFile(src, dest);
        await fsPromises.unlink(src).catch(() => {});
        return;
      }
      
      // OneDrive sync or file system contention
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EAGAIN') {
        if (isLastAttempt) {
          console.error(`[moveFileAsync] All ${retries} attempts failed for ${path.basename(src)}`);
          console.error(`[moveFileAsync] This may be caused by OneDrive sync locking the file. Error: ${err.message}`);
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

async function copyFileAsyncWithRetry(src, dest, retries = 8) {
  await fsPromises.mkdir(path.dirname(dest), { recursive: true });

  for (let i = 0; i < retries; i++) {
    try {
      await fsPromises.copyFile(src, dest);
      return;
    } catch (err) {
      console.log(`[copyFileAsync] Attempt ${i + 1}/${retries} failed for ${path.basename(src)} -> ${path.basename(dest)}: ${err.code}`);
      const isLastAttempt = i === retries - 1;

      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EAGAIN') {
        if (isLastAttempt) {
          console.error(`[copyFileAsync] All ${retries} attempts failed for ${path.basename(src)}`);
          console.error(`[copyFileAsync] This may be caused by OneDrive sync locking the destination. Error: ${err.message}`);
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

module.exports = { moveFileSync, moveFileAsync, copyFileAsyncWithRetry };
