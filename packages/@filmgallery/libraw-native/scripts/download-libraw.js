/**
 * Download LibRaw 0.22 source code
 * 
 * Run this script to download and extract LibRaw source before building
 * 
 * Usage: node scripts/download-libraw.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LIBRAW_VERSION = '0.22.0';
const LIBRAW_URL = `https://github.com/LibRaw/LibRaw/archive/refs/tags/${LIBRAW_VERSION}.tar.gz`;
const DEPS_DIR = path.join(__dirname, '..', 'deps');
const LIBRAW_DIR = path.join(DEPS_DIR, 'libraw');

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url}...`);
        const file = fs.createWriteStream(dest);
        
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(dest);
                downloadFile(response.headers.location, dest)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize) {
                    const percent = Math.round((downloadedSize / totalSize) * 100);
                    process.stdout.write(`\rDownloading... ${percent}%`);
                }
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log('\nDownload complete.');
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    console.log(`=== LibRaw ${LIBRAW_VERSION} Downloader ===\n`);
    
    // Check if already exists
    if (fs.existsSync(path.join(LIBRAW_DIR, 'libraw', 'libraw.h'))) {
        console.log('LibRaw source already exists. Delete deps/libraw to re-download.');
        return;
    }
    
    // Create deps directory
    if (!fs.existsSync(DEPS_DIR)) {
        fs.mkdirSync(DEPS_DIR, { recursive: true });
    }
    
    const tarPath = path.join(DEPS_DIR, 'libraw.tar.gz');
    
    try {
        // Download
        await downloadFile(LIBRAW_URL, tarPath);
        
        // Extract
        console.log('Extracting...');
        
        // Use tar on all platforms (Windows has tar since Windows 10 1803)
        execSync(`tar -xzf "${tarPath}" -C "${DEPS_DIR}"`, { stdio: 'inherit' });
        
        // Rename
        const extractedDir = path.join(DEPS_DIR, `LibRaw-${LIBRAW_VERSION}`);
        if (fs.existsSync(extractedDir)) {
            if (fs.existsSync(LIBRAW_DIR)) {
                fs.rmSync(LIBRAW_DIR, { recursive: true });
            }
            fs.renameSync(extractedDir, LIBRAW_DIR);
        }
        
        // Cleanup
        fs.unlinkSync(tarPath);
        
        console.log('\n✅ LibRaw source downloaded and extracted successfully!');
        console.log(`Location: ${LIBRAW_DIR}`);
        console.log('\nYou can now build the native module:');
        console.log('  npm run build');
        
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        
        // Cleanup on error
        if (fs.existsSync(tarPath)) {
            fs.unlinkSync(tarPath);
        }
        
        console.log('\nAlternative: Download manually from:');
        console.log(`  https://github.com/LibRaw/LibRaw/releases/tag/${LIBRAW_VERSION}`);
        console.log(`\nExtract to: ${LIBRAW_DIR}`);
        
        process.exit(1);
    }
}

main();
