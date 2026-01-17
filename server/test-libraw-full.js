/**
 * Test libraw-wasm workflow in Node.js
 */
try {
  if (typeof global.Worker === 'undefined') {
    global.Worker = require('web-worker');
  }
} catch (e) {
  console.error('Failed to polyfill Worker:', e);
}

const fs = require('fs');
const path = require('path');

async function testDecode() {
  const testFile = process.argv[2];
  if (!testFile) {
    console.error('Usage: node test-libraw-full.js <path-to-dng>');
    return;
  }
  
  console.log('Loading libraw-wasm...');
  const librawPkg = require('libraw-wasm');
  const LibRaw = librawPkg.default || librawPkg;
  
  console.log('Reading file:', testFile);
  const fileBuffer = fs.readFileSync(testFile);
  const u8 = new Uint8Array(fileBuffer);
  console.log('File size:', u8.length, 'bytes');

  console.log('Creating LibRaw instance...');
  const processor = new LibRaw();
  
  console.log('Opening file in processor...');
  
  // Set a timeout to detect hang
  const timeout = setTimeout(() => {
    console.error('TIMEOUT: processor.open() took more than 30 seconds');
    process.exit(1);
  }, 30000);
  
  try {
    await processor.open(u8);
    clearTimeout(timeout);
    console.log('File opened successfully!');
    
    console.log('Getting image data...');
    const decoded = await processor.imageData();
    console.log('Decoded:', decoded ? `${decoded.width}x${decoded.height}` : 'null');
    
  } catch (e) {
    clearTimeout(timeout);
    console.error('Error during decode:', e);
  }
}

testDecode().catch(console.error);
