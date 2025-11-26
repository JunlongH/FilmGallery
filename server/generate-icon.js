const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgPath = path.join(__dirname, '../assets/logo.svg');
const buildDir = path.join(__dirname, '../build');

if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

async function generate() {
    try {
        const pngPath = path.join(buildDir, 'icon.png');
        await sharp(svgPath)
            .resize(512, 512)
            .png()
            .toFile(pngPath);
        console.log('Generated icon.png at', pngPath);
    } catch (err) {
        console.error('Error generating icon:', err);
    }
}

generate();
