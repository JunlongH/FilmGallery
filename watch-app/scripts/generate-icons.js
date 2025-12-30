const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Source icon path
const sourceIcon = path.join(__dirname, '..', '..', 'assets', 'icon.png');

// Output directories
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

// Icon sizes for different densities
const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function generateIcons() {
  console.log('Reading source icon:', sourceIcon);
  
  if (!fs.existsSync(sourceIcon)) {
    console.error('Error: Source icon not found at', sourceIcon);
    console.log('Please make sure assets/icon.png exists');
    process.exit(1);
  }

  // Read the source image
  const sourceBuffer = fs.readFileSync(sourceIcon);
  
  for (const [density, size] of Object.entries(sizes)) {
    const outputDir = path.join(resDir, density);
    
    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate square icon (ic_launcher.png)
    const squareOutput = path.join(outputDir, 'ic_launcher.png');
    await sharp(sourceBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(squareOutput);
    console.log(`✓ Generated ${density}/ic_launcher.png (${size}x${size})`);

    // Generate round icon (ic_launcher_round.png)
    // Create a circular mask
    const roundOutput = path.join(outputDir, 'ic_launcher_round.png');
    
    // Create circular mask
    const circle = Buffer.from(
      `<svg width="${size}" height="${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/>
      </svg>`
    );

    await sharp(sourceBuffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .composite([{
        input: circle,
        blend: 'dest-in'
      }])
      .png()
      .toFile(roundOutput);
    console.log(`✓ Generated ${density}/ic_launcher_round.png (${size}x${size} circular)`);
  }

  console.log('\n✅ All icons generated successfully!');
  console.log('Icons saved to:', resDir);
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
