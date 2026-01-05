// Diagnostic script to check file paths and permissions
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('=== FilmGallery Path Diagnostics ===\n');

// Load paths configuration
const { uploadsDir, tmpUploadDir, localTmpDir, rollsDir, filmDir } = require('./config/paths');

const checkPath = (name, dirPath) => {
  console.log(`\n[${name}]`);
  console.log(`  Path: ${dirPath}`);
  
  try {
    const exists = fs.existsSync(dirPath);
    console.log(`  Exists: ${exists ? '✓ YES' : '✗ NO'}`);
    
    if (exists) {
      const stats = fs.statSync(dirPath);
      console.log(`  Is Directory: ${stats.isDirectory() ? '✓ YES' : '✗ NO'}`);
      
      // Test write permission
      const testFile = path.join(dirPath, '.test-write-' + Date.now());
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log(`  Writable: ✓ YES`);
      } catch (writeErr) {
        console.log(`  Writable: ✗ NO (${writeErr.code})`);
      }
      
      // Check if it's on OneDrive
      const isOnOneDrive = dirPath.includes('OneDrive');
      console.log(`  OneDrive: ${isOnOneDrive ? '⚠ YES' : '✓ NO'}`);
      
      // Show disk
      if (process.platform === 'win32') {
        const drive = dirPath.substring(0, 2);
        console.log(`  Drive: ${drive}`);
      }
    } else {
      console.log(`  ⚠ Directory does not exist! Creating...`);
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  ✓ Created successfully`);
      } catch (createErr) {
        console.log(`  ✗ Failed to create: ${createErr.message}`);
      }
    }
  } catch (err) {
    console.log(`  ✗ Error checking path: ${err.message}`);
  }
};

console.log('\n=== Environment ===');
console.log(`OS: ${os.platform()} ${os.release()}`);
console.log(`Node: ${process.version}`);
console.log(`CWD: ${process.cwd()}`);
console.log(`\nEnvironment Variables:`);
console.log(`  DATA_ROOT: ${process.env.DATA_ROOT || '(not set)'}`);
console.log(`  UPLOADS_ROOT: ${process.env.UPLOADS_ROOT || '(not set)'}`);
console.log(`  USER_DATA: ${process.env.USER_DATA || '(not set)'}`);
console.log(`  LOCAL_TMP_ROOT: ${process.env.LOCAL_TMP_ROOT || '(not set)'}`);

console.log('\n=== Checking Paths ===');
checkPath('uploadsDir', uploadsDir);
checkPath('tmpUploadDir', tmpUploadDir);
checkPath('localTmpDir (OS Temp)', localTmpDir);
checkPath('rollsDir', rollsDir);
checkPath('filmDir', filmDir);

console.log('\n=== OS Temp Directory ===');
console.log(`  os.tmpdir(): ${os.tmpdir()}`);
console.log(`  Is OneDrive: ${os.tmpdir().includes('OneDrive') ? '⚠ YES (BAD)' : '✓ NO (GOOD)'}`);

console.log('\n=== Recommendations ===');
if (localTmpDir.includes('OneDrive')) {
  console.log('⚠ WARNING: localTmpDir is on OneDrive! This may cause file locking issues.');
  console.log('  Set LOCAL_TMP_ROOT to a non-OneDrive directory.');
}

if (rollsDir.includes('OneDrive')) {
  console.log('ℹ INFO: rollsDir is on OneDrive. This is expected but may cause delays.');
  console.log('  Consider pausing OneDrive sync during large uploads.');
}

console.log('\n=== Diagnostics Complete ===\n');
