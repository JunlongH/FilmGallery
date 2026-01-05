// Test Sharp processing with TIF files
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== Sharp Diagnostics ===\n');

// Configure sharp as in production
sharp.cache(false);
sharp.concurrency(1);

console.log('Sharp Configuration:');
console.log(`  Version: ${sharp.versions.sharp}`);
console.log(`  libvips: ${sharp.versions.vips}`);
console.log(`  Cache: disabled`);
console.log(`  Concurrency: 1`);

// Test basic functionality
console.log('\n=== Basic Sharp Test ===');

const testDir = path.join(os.tmpdir(), 'sharp-test-' + Date.now());
fs.mkdirSync(testDir, { recursive: true });

// Create a simple test image
const testImage = path.join(testDir, 'test.jpg');
const outputJpg = path.join(testDir, 'output.jpg');

console.log(`Creating test image at: ${testImage}`);

// Create a 1000x1000 red square
sharp({
  create: {
    width: 1000,
    height: 1000,
    channels: 3,
    background: { r: 255, g: 0, b: 0 }
  }
})
.jpeg()
.toFile(testImage)
.then(() => {
  console.log('✓ Test image created');
  
  // Test JPEG processing
  console.log('\n=== Testing JPEG Processing ===');
  const start = Date.now();
  return sharp(testImage)
    .jpeg({ quality: 95 })
    .toFile(outputJpg)
    .then(() => {
      const duration = Date.now() - start;
      const size = fs.statSync(outputJpg).size;
      console.log(`✓ JPEG processing successful`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Output size: ${(size / 1024).toFixed(2)} KB`);
    });
})
.then(() => {
  // Test thumbnail generation
  console.log('\n=== Testing Thumbnail Generation ===');
  const thumbOutput = path.join(testDir, 'thumb.jpg');
  const start = Date.now();
  return sharp(testImage)
    .resize({ width: 240, height: 240, fit: 'inside' })
    .jpeg({ quality: 40 })
    .toFile(thumbOutput)
    .then(() => {
      const duration = Date.now() - start;
      const size = fs.statSync(thumbOutput).size;
      console.log(`✓ Thumbnail generation successful`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Output size: ${(size / 1024).toFixed(2)} KB`);
    });
})
.then(() => {
  console.log('\n=== Timeout Test ===');
  console.log('Testing timeout mechanism...');
  
  const timeoutTest = (sharpOp, timeoutMs) => {
    return Promise.race([
      sharpOp,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      )
    ]);
  };
  
  const start = Date.now();
  return timeoutTest(
    sharp(testImage).jpeg({ quality: 95 }).toBuffer(),
    5000 // 5 second timeout
  ).then(() => {
    const duration = Date.now() - start;
    console.log(`✓ Operation completed within timeout (${duration}ms)`);
  });
})
.then(() => {
  console.log('\n=== TIF Format Support Test ===');
  
  // Check if sharp can handle TIF input
  const tifOutput = path.join(testDir, 'test.tif');
  console.log('Creating TIF file...');
  
  return sharp(testImage)
    .tiff()
    .toFile(tifOutput)
    .then(() => {
      const size = fs.statSync(tifOutput).size;
      console.log(`✓ TIF creation successful`);
      console.log(`  Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
      
      // Try to process the TIF
      console.log('\nProcessing TIF to JPEG...');
      const tifToJpg = path.join(testDir, 'tif-to-jpg.jpg');
      const start = Date.now();
      
      return sharp(tifOutput)
        .jpeg({ quality: 95 })
        .toFile(tifToJpg)
        .then(() => {
          const duration = Date.now() - start;
          const outputSize = fs.statSync(tifToJpg).size;
          console.log(`✓ TIF to JPEG conversion successful`);
          console.log(`  Duration: ${duration}ms`);
          console.log(`  Output size: ${(outputSize / 1024).toFixed(2)} KB`);
        });
    });
})
.then(() => {
  console.log('\n=== All Tests Passed ✓ ===');
  
  // Cleanup
  console.log('\nCleaning up test files...');
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('✓ Cleanup complete');
})
.catch(err => {
  console.error('\n=== Test Failed ✗ ===');
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  
  // Cleanup on error
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {
    console.error('Cleanup failed:', e.message);
  }
  
  process.exit(1);
});
