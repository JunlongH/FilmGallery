/**
 * @filmgallery/libraw-native - Test Suite
 * 
 * Basic tests for the LibRaw native bindings
 */

const path = require('path');
const assert = require('assert');

// Test module loading
console.log('=== LibRaw Native Module Tests ===\n');

let libraw;
try {
    libraw = require('../lib');
    console.log('✅ Module loaded successfully');
} catch (e) {
    console.error('❌ Failed to load module:', e.message);
    console.log('\nMake sure you have:');
    console.log('  1. Downloaded LibRaw source: npm run download-libraw');
    console.log('  2. Built the module: npm run build');
    process.exit(1);
}

// Test version
const version = libraw.getVersion();
console.log(`✅ LibRaw version: ${version.version} (${version.versionNumber})`);

// Test camera count
const cameraCount = libraw.getCameraCount();
console.log(`✅ Supported cameras: ${cameraCount}`);

// Test Panasonic S9 support
const s9Supported = libraw.isSupportedCamera('Panasonic DC-S9');
console.log(`✅ Panasonic DC-S9 supported: ${s9Supported}`);

// Test constants
assert(libraw.ColorSpace.SRGB === 1, 'ColorSpace.SRGB should be 1');
assert(libraw.DemosaicQuality.AHD === 3, 'DemosaicQuality.AHD should be 3');
assert(libraw.HighlightMode.CLIP === 0, 'HighlightMode.CLIP should be 0');
console.log('✅ Constants exported correctly');

// Test LibRawProcessor class
const processor = new libraw.LibRawProcessor();
assert(processor instanceof libraw.LibRawProcessor, 'Should create LibRawProcessor instance');
assert(processor.isLoaded() === false, 'Should not be loaded initially');
console.log('✅ LibRawProcessor class works');

processor.close();

console.log('\n=== All tests passed! ===\n');

// If a test file is provided, test decoding
const testFile = process.argv[2];
if (testFile) {
    console.log(`\n=== Testing with file: ${testFile} ===\n`);
    
    (async () => {
        try {
            const proc = new libraw.LibRawProcessor();
            
            console.log('Loading file...');
            const loadResult = await proc.loadFile(testFile);
            console.log(`✅ Loaded: ${loadResult.width}x${loadResult.height}`);
            
            console.log('Getting metadata...');
            const metadata = proc.getMetadata();
            console.log(`✅ Camera: ${metadata.make} ${metadata.model}`);
            console.log(`   ISO: ${metadata.iso}, Shutter: ${metadata.shutter}s, Aperture: f/${metadata.aperture}`);
            
            console.log('Processing...');
            const processResult = await proc.dcrawProcess();
            console.log(`✅ Processed: ${processResult.width}x${processResult.height}`);
            
            console.log('Creating memory image...');
            const imageResult = await proc.makeMemImage();
            console.log(`✅ Image: ${imageResult.width}x${imageResult.height}, ${imageResult.bits} bits, ${imageResult.colors} colors`);
            console.log(`   Data size: ${(imageResult.dataSize / 1024 / 1024).toFixed(2)} MB`);
            
            proc.close();
            
            console.log('\n=== File test passed! ===\n');
            
        } catch (e) {
            console.error('❌ File test failed:', e.message);
            process.exit(1);
        }
    })();
} else {
    console.log('Tip: Pass a RAW file path to test decoding:');
    console.log('  node test/test-decode.js /path/to/photo.rw2\n');
}
