// Test script to verify exiftool functionality
const { exiftool } = require('exiftool-vendored');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testExif() {
  console.log('[TEST] Starting EXIF test...');
  
  // Find a test image from the uploads folder
  const uploadsDir = process.env.UPLOADS_ROOT || path.join(process.cwd(), 'uploads');
  const testImageCandidates = [
    path.join(uploadsDir, 'rolls', '37', 'full', '37_05.jpg'),
    path.join(uploadsDir, 'rolls', '37', 'full', '37_01.jpg'),
  ];
  
  let testImage = null;
  for (const candidate of testImageCandidates) {
    if (fs.existsSync(candidate)) {
      testImage = candidate;
      break;
    }
  }
  
  if (!testImage) {
    console.error('[TEST] No test image found. Checked:', testImageCandidates);
    return;
  }
  
  console.log('[TEST] Using test image:', testImage);
  
  // Read existing EXIF
  console.log('\n[TEST] Reading existing EXIF...');
  try {
    const existing = await exiftool.read(testImage);
    console.log('[TEST] Existing Make:', existing.Make);
    console.log('[TEST] Existing Model:', existing.Model);
    console.log('[TEST] Existing ISO:', existing.ISO);
    console.log('[TEST] Existing FNumber:', existing.FNumber);
    console.log('[TEST] Existing ExposureTime:', existing.ExposureTime);
  } catch (e) {
    console.log('[TEST] Could not read existing EXIF:', e.message);
  }
  
  // Create temp copy for writing
  const tempPath = path.join(os.tmpdir(), `test_exif_${Date.now()}.jpg`);
  fs.copyFileSync(testImage, tempPath);
  console.log('\n[TEST] Created temp copy:', tempPath);
  
  // Write EXIF data
  console.log('\n[TEST] Writing EXIF data...');
  const exifData = {
    Make: 'Pentax',
    Model: 'Pentax MX',
    LensModel: 'Pentax M50 F1.7',
    Artist: 'Junlong',
    Copyright: '© Junlong',
    ISO: 200,
    FNumber: 5.6,
    ExposureTime: '1/100',
    FocalLength: 50,
    DateTimeOriginal: '2025:11:18 14:30:00',
    ImageDescription: 'Test photo | Roll: Test Roll | Film: Kodak Portra 400',
    Subject: ['Street', 'Portrait', 'Film'],
    Keywords: ['Street', 'Portrait', 'Film'],
    Software: 'FilmGallery v1.8.0'
  };
  
  try {
    await exiftool.write(tempPath, exifData, ['-overwrite_original']);
    console.log('[TEST] ✅ EXIF write successful');
  } catch (e) {
    console.error('[TEST] ❌ EXIF write failed:', e.message);
    console.error('[TEST] Error details:', e);
    return;
  }
  
  // Verify written EXIF
  console.log('\n[TEST] Verifying written EXIF...');
  try {
    const written = await exiftool.read(tempPath);
    console.log('[TEST] Written Make:', written.Make);
    console.log('[TEST] Written Model:', written.Model);
    console.log('[TEST] Written LensModel:', written.LensModel);
    console.log('[TEST] Written Artist:', written.Artist);
    console.log('[TEST] Written ISO:', written.ISO);
    console.log('[TEST] Written FNumber:', written.FNumber);
    console.log('[TEST] Written ExposureTime:', written.ExposureTime);
    console.log('[TEST] Written FocalLength:', written.FocalLength);
    console.log('[TEST] Written DateTimeOriginal:', written.DateTimeOriginal);
    console.log('[TEST] Written ImageDescription:', written.ImageDescription);
    console.log('[TEST] Written Subject:', written.Subject);
    console.log('[TEST] Written Software:', written.Software);
    
    console.log('\n[TEST] ✅ Verification complete. Temp file saved at:', tempPath);
    console.log('[TEST] You can check this file in Windows Properties → Details to verify EXIF');
  } catch (e) {
    console.error('[TEST] ❌ Verification failed:', e.message);
  }
}

testExif()
  .then(() => {
    console.log('\n[TEST] Test completed');
    process.exit(0);
  })
  .catch(e => {
    console.error('\n[TEST] Test failed:', e);
    process.exit(1);
  });
