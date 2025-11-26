const fs = require('fs');
const path = require('path');

function moveFileSync(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    // Try atomic rename first
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-device: copy and unlink
      fs.copyFileSync(src, dest);
      try { fs.unlinkSync(src); } catch (e) {}
    } else if (err.code === 'EPERM' || err.code === 'EBUSY') {
      // Locked or permission issue: try to unlink dest first
      try {
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
        fs.renameSync(src, dest);
      } catch (retryErr) {
        // If still failing, try copy (sometimes works if rename fails)
        try {
          fs.copyFileSync(src, dest);
          try { fs.unlinkSync(src); } catch (e) {}
        } catch (copyErr) {
          console.error('moveFileSync failed:', copyErr);
          throw copyErr;
        }
      }
    } else {
      throw err;
    }
  }
}

module.exports = { moveFileSync };
