/**
 * Contact Sheet Generator - Authentic 35mm Film Strip Style (TypeScript Migration)
 * 
 * Layout reference (真实35mm胶片):
 * ┌────────────────────────────────────────────────────────────────┐
 * │ KODAK 400TX  20  ◄►  21  ◄►  22  ◄►  23  ◄►  24  ◄►  25       │  <- 边缘文字区 (外侧)
 * │ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ │  <- 齿孔区
 * │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐               │
 * │ │     │ │     │ │     │ │     │ │     │ │     │               │  <- 照片区 (3:2)
 * │ │ 20  │ │ 21  │ │ 22  │ │ 23  │ │ 24  │ │ 25  │               │
 * │ │     │ │     │ │     │ │     │ │     │ │     │               │
 * │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘               │
 * │ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ │  <- 齿孔区
 * │ 20A  KODAK 5063  21A  KODAK 5063  22A  KODAK 5063  ...        │  <- 边缘文字区 (外侧)
 * └────────────────────────────────────────────────────────────────┘
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// Load style templates
const STYLES = require('../assets/contact-sheet-styles.json');
export { STYLES };

// Configuration constants
export const DEFAULT_COLUMNS = 6;
export const DEFAULT_MAX_TOTAL_WIDTH = 4800;
export const DEFAULT_MAX_PHOTO_WIDTH = 400;
const DEFAULT_STYLE = 'kodak';

// Film frame aspect ratio (3:2 landscape, standard 35mm)
const FRAME_ASPECT_RATIO = 3 / 2;

// Base dimensions (designed for frameWidth = 120px, will scale proportionally)
const BASE_FRAME_WIDTH = 120;
const FILM_BASE = {
  edgeMargin: 16,
  edgeTextHeight: 14,
  sprocketHeight: 10,
  sprocketWidth: 6,
  sprocketsPerFrame: 8,
  frameGap: 2,
  rowGap: 8
};

interface ScaledFilm {
  edgeMargin: number;
  edgeTextHeight: number;
  sprocketHeight: number;
  sprocketWidth: number;
  sprocketsPerFrame: number;
  frameGap: number;
  rowGap: number;
  filmNameFontSize: number;
  frameNumFontSize: number;
  separatorFontSize: number;
  dxBarWidth: number;
  dxBarGap: number;
  dxBarHeight: number;
}

interface Style {
  background: string;
  sprocketHoleColor: string;
  frameNumberColor: string;
  showSprockets: boolean;
  frameNumberFont: {
    family: string;
    size: number;
  };
}

interface Photo {
  id?: number;
  frame_number?: number | string;
  resolved_path?: string;
  full_rel_path?: string;
  thumb_rel_path?: string;
}

interface RollInfo {
  id?: number;
  title?: string;
  film_name?: string;
  iso?: number | string;
  camera?: string;
  photo_count?: number;
}

interface RollMetadata {
  title?: string;
  film_name_joined?: string;
  film_type?: string;
  iso?: number;
  film_iso_joined?: number;
  camera?: string;
}

interface GenerateOptions {
  photos?: Photo[];
  rollMetadata?: RollMetadata;
  uploadsDir: string;
  columns?: number;
  maxTotalWidth?: number;
  maxPhotoWidth?: number;
  styleName?: string;
  quality?: number;
  onProgress?: (current: number, total: number, message: string) => void;
}

// Helper to get scaled FILM dimensions based on actual frameWidth and style
function getScaledFilm(frameWidth: number, styleName: string = DEFAULT_STYLE): ScaledFilm {
  const scale = frameWidth / BASE_FRAME_WIDTH;
  return {
    edgeMargin: Math.round(FILM_BASE.edgeMargin * scale),
    edgeTextHeight: Math.round(FILM_BASE.edgeTextHeight * scale),
    sprocketHeight: Math.round(FILM_BASE.sprocketHeight * scale),
    sprocketWidth: Math.round(FILM_BASE.sprocketWidth * scale),
    sprocketsPerFrame: FILM_BASE.sprocketsPerFrame,
    frameGap: Math.round(FILM_BASE.frameGap * scale),
    // minimal模式下行间距更大，防止编号被遮挡
    rowGap: styleName === 'minimal' ? Math.max(18, Math.round(FILM_BASE.rowGap * scale)) : Math.round(FILM_BASE.rowGap * scale),
    // Font sizes (scaled)
    filmNameFontSize: Math.round(9 * scale),
    frameNumFontSize: Math.round(8 * scale),
    separatorFontSize: Math.round(7 * scale),
    // DX barcode dimensions (scaled)
    dxBarWidth: Math.round(2 * scale),
    dxBarGap: Math.round(1.5 * scale),
    dxBarHeight: Math.round(10 * scale)
  };
}

/**
 * Generate DX code barcode pattern based on real film information
 */
function generateDXCode(rollInfo: RollInfo, frameIndex: number = 0): boolean[] {
  const filmName = (rollInfo.film_name || 'KODAK').toUpperCase();
  const iso = parseInt(String(rollInfo.iso)) || 400;
  const photoCount = rollInfo.photo_count || 36;
  
  // 1. Film brand/model encoding (6 bits) - hash based on film name
  const filmHash = filmName.split('').reduce((acc, char, i) => {
    return acc + char.charCodeAt(0) * (i + 1);
  }, 0);
  const brandBits: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    brandBits.push(((filmHash >> i) & 1) === 1);
  }
  
  // 2. ISO encoding (4 bits) - based on DX ISO standard
  const isoMap: Record<number, number> = {
    25: 0, 50: 1, 64: 1, 100: 2, 125: 2, 160: 3, 200: 3, 
    250: 4, 320: 4, 400: 4, 500: 5, 640: 5, 800: 5, 
    1000: 6, 1250: 6, 1600: 6, 2000: 7, 2500: 7, 3200: 7
  };
  const isoValues = Object.keys(isoMap).map(Number).sort((a, b) => a - b);
  const closestIso = isoValues.reduce((prev, curr) => 
    Math.abs(curr - iso) < Math.abs(prev - iso) ? curr : prev
  );
  const isoCode = isoMap[closestIso] || 4;
  const isoBits: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    isoBits.push(((isoCode >> i) & 1) === 1);
  }
  
  // 3. Exposure count encoding (4 bits)
  const countCode = Math.floor(photoCount / 12);
  const countBits: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    countBits.push(((countCode >> i) & 1) === 1);
  }
  
  const allBits = [...brandBits, ...isoBits, ...countBits];
  
  // Add slight variation per frame
  const variedBits = allBits.map((bit, i) => {
    if (i >= 10 && (frameIndex + i) % 7 === 0) {
      return !bit;
    }
    return bit;
  });
  
  return variedBits;
}

/**
 * Process photo with intelligent aspect ratio handling
 */
async function processPhotoForFrame(photoPath: string, frameWidth: number, frameHeight: number): Promise<Buffer> {
  const metadata = await sharp(photoPath).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;
  
  console.log(`[ContactSheet] Processing: ${path.basename(photoPath)}, dimensions: ${imageWidth}x${imageHeight}`);
  
  const isPortrait = imageHeight > imageWidth;
  
  let pipeline;
  
  if (isPortrait) {
    console.log(`[ContactSheet] Portrait detected, rotating 90° clockwise`);
    pipeline = sharp(photoPath)
      .rotate(90)
      .resize(frameWidth, frameHeight, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 });
  } else {
    pipeline = sharp(photoPath)
      .resize(frameWidth, frameHeight, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 });
  }
  
  const processed = await pipeline.toBuffer();
  return processed;
}

interface FilmStripRowParams {
  frameWidth: number;
  frameHeight: number;
  photos: Photo[];
  startIndex: number;
  columns: number;
  style: Style;
  rollInfo: RollInfo;
  FILM: ScaledFilm;
}

interface FilmStripRowResult {
  svg: string;
  totalRowHeight: number;
  photoY: number;
}

/**
 * Generate authentic film strip row with proper layout
 */
function generateFilmStripRowSVG({
  frameWidth,
  frameHeight,
  photos,
  startIndex,
  columns,
  style,
  rollInfo,
  FILM
}: FilmStripRowParams): FilmStripRowResult {
  const photosInRow = photos.slice(startIndex, startIndex + columns);
  const actualColumns = photosInRow.length;
  
  const topEdgeY = 0;
  const topSprocketY = FILM.edgeTextHeight;
  const photoY = topSprocketY + FILM.sprocketHeight;
  const bottomSprocketY = photoY + frameHeight;
  const bottomEdgeY = bottomSprocketY + FILM.sprocketHeight;
  const totalRowHeight = bottomEdgeY + FILM.edgeTextHeight;
  
  const textColor = style.frameNumberColor;
  
  let svg = '';
  
  // ===== TOP EDGE TEXT =====
  const filmStock = rollInfo.film_name || 'KODAK';
  
  svg += `
    <text 
      x="${Math.round(FILM.frameGap * 2)}" 
      y="${topEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.2)}" 
      font-family="'Courier New', Courier, monospace" 
      font-weight="bold"
      font-size="${Math.round(FILM.filmNameFontSize * 0.9)}" 
      fill="${textColor}"
      letter-spacing="1.2"
    >${filmStock}</text>
  `;
  
  photosInRow.forEach((photo, col) => {
    const frameNum = photo.frame_number || String(startIndex + col + 1).padStart(2, '0');
    const frameX = col * (frameWidth + FILM.frameGap);
    
    if (col < photosInRow.length - 1) {
      const separatorX = frameX + frameWidth + FILM.frameGap / 2;
      svg += `
        <text 
          x="${separatorX - Math.round(FILM.frameGap * 4)}" 
          y="${topEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.2)}" 
          text-anchor="end"
          font-family="'Courier New', Courier, monospace" 
          font-weight="bold"
          font-size="${Math.round(FILM.frameNumFontSize * 1.1)}" 
          fill="${textColor}"
          letter-spacing="0.8"
        >${frameNum}A</text>
      `;
      svg += `
        <text 
          x="${separatorX}" 
          y="${topEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.2)}" 
          text-anchor="middle"
          font-family="'Courier New', Courier, monospace" 
          font-weight="bold"
          font-size="${Math.round(FILM.separatorFontSize * 1.2)}" 
          fill="${textColor}"
        >◄►</text>
      `;
    } else {
      svg += `
        <text 
          x="${frameX + frameWidth - Math.round(FILM.frameGap * 2)}" 
          y="${topEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.2)}" 
          text-anchor="end"
          font-family="'Courier New', Courier, monospace" 
          font-weight="bold"
          font-size="${Math.round(FILM.frameNumFontSize * 1.1)}" 
          fill="${textColor}"
          letter-spacing="0.8"
        >${frameNum}A</text>
      `;
    }
  });
  
  // ===== SPROCKET HOLES =====
  const sprocketSpacing = frameWidth / FILM.sprocketsPerFrame;
  for (let col = 0; col < actualColumns; col++) {
    const frameStartX = col * (frameWidth + FILM.frameGap);
    for (let s = 0; s < FILM.sprocketsPerFrame; s++) {
      const sx = frameStartX + s * sprocketSpacing + (sprocketSpacing - FILM.sprocketWidth) / 2;
      svg += `<rect x="${sx}" y="${topSprocketY}" width="${FILM.sprocketWidth}" height="${FILM.sprocketHeight}" rx="1" fill="${style.sprocketHoleColor}"/>`;
      svg += `<rect x="${sx}" y="${bottomSprocketY}" width="${FILM.sprocketWidth}" height="${FILM.sprocketHeight}" rx="1" fill="${style.sprocketHoleColor}"/>`;
    }
  }
  
  // ===== BOTTOM EDGE TEXT =====
  photosInRow.forEach((photo, col) => {
    const frameNum = photo.frame_number || String(startIndex + col + 1).padStart(2, '0');
    const frameX = col * (frameWidth + FILM.frameGap);
    const centerX = frameX + frameWidth / 2;
    
    svg += `
      <text 
        x="${centerX}" 
        y="${bottomEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.15)}" 
        text-anchor="middle"
        font-family="'Courier New', Courier, monospace" 
        font-weight="bold"
        font-size="${Math.round(FILM.frameNumFontSize * 1.1)}" 
        fill="${textColor}"
        letter-spacing="0.6"
      >${frameNum}</text>
    `;
  });
  
  // DX code barcode patterns
  for (let col = 0; col < actualColumns; col++) {
    const frameX = col * (frameWidth + FILM.frameGap);
    const barcodeX = frameX + frameWidth / 2 + Math.round(FILM.frameNumFontSize * 1.2);
    const bottomDxBarY = bottomEdgeY + Math.round(FILM.edgeTextHeight * 0.15);
    const maxBarcodeEnd = frameX + frameWidth - FILM.frameGap;
    
    const frameIndex = startIndex + col;
    const dxBits = generateDXCode(rollInfo, frameIndex);
    
    for (let i = 0; i < dxBits.length; i++) {
      const barX = barcodeX + i * (FILM.dxBarWidth + FILM.dxBarGap);
      if (barX + FILM.dxBarWidth <= maxBarcodeEnd && dxBits[i]) {
        svg += `<rect x="${barX}" y="${bottomDxBarY}" width="${FILM.dxBarWidth}" height="${FILM.dxBarHeight}" fill="${textColor}" opacity="0.85"/>`;
      }
    }
  }
  
  return { svg, totalRowHeight, photoY };
}

interface OverlayParams {
  totalWidth: number;
  totalHeight: number;
  frameWidth: number;
  frameHeight: number;
  photos: Photo[];
  columns: number;
  rows: number;
  style: Style;
  rollInfo: RollInfo;
  padding: number;
  rowHeightWithFilm: number;
  FILM: ScaledFilm;
}

/**
 * Generate complete contact sheet overlay
 */
function generateContactSheetOverlay(params: OverlayParams): string {
  const {
    totalWidth,
    totalHeight,
    frameWidth,
    frameHeight,
    photos,
    columns,
    rows,
    style,
    rollInfo,
    padding,
    rowHeightWithFilm,
    FILM
  } = params;
  
  let svg = `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;
  
  svg += `<rect width="${totalWidth}" height="${totalHeight}" fill="${style.background}"/>`;
  
  const rowTotalHeight = rowHeightWithFilm + FILM.rowGap;
  
  for (let row = 0; row < rows; row++) {
    const startIndex = row * columns;
    const yOffset = padding + row * rowTotalHeight;
    
    if (style.showSprockets) {
      const filmBgColor = adjustBrightness(style.background, 1.15);
      svg += `<rect x="${padding - 4}" y="${yOffset - 2}" width="${totalWidth - 2*padding + 8}" height="${rowHeightWithFilm + 4}" fill="${filmBgColor}" rx="2"/>`;
      
      const { svg: rowSvg } = generateFilmStripRowSVG({
        frameWidth,
        frameHeight,
        photos,
        startIndex,
        columns,
        style,
        rollInfo,
        FILM
      });
      
      svg += `<g transform="translate(${padding}, ${yOffset})">${rowSvg}</g>`;
    } else {
      const photosInRow = photos.slice(startIndex, startIndex + columns);
      svg += `<g transform="translate(${padding}, ${yOffset})">`;
      photosInRow.forEach((photo, col) => {
        const frameNum = photo.frame_number || String(startIndex + col + 1).padStart(2, '0');
        const x = col * (frameWidth + FILM.frameGap) + frameWidth / 2;
        svg += `
          <text 
            x="${x}" 
            y="${frameHeight + 12}" 
            text-anchor="middle" 
            font-family="${style.frameNumberFont.family}" 
            font-size="${style.frameNumberFont.size}" 
            fill="${style.frameNumberColor}"
          >${frameNum}</text>
        `;
      });
      svg += `</g>`;
    }
  }
  
  svg += '</svg>';
  return svg;
}

/**
 * Adjust color brightness
 */
function adjustBrightness(hexColor: string, factor: number): string {
  const hex = hexColor.replace('#', '');
  const r = Math.min(255, Math.max(0, Math.round(parseInt(hex.substr(0, 2), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(hex.substr(2, 2), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(hex.substr(4, 2), 16) * factor)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 26, g: 26, b: 26 };
}

/**
 * Main contact sheet generator
 */
export async function generateContactSheet({
  photos = [],
  rollMetadata = {},
  uploadsDir,
  columns = DEFAULT_COLUMNS,
  maxTotalWidth = DEFAULT_MAX_TOTAL_WIDTH,
  maxPhotoWidth = DEFAULT_MAX_PHOTO_WIDTH,
  styleName = DEFAULT_STYLE,
  quality = 95,
  onProgress = () => {}
}: GenerateOptions): Promise<Buffer> {
  if (photos.length === 0) {
    throw new Error('No photos to generate contact sheet');
  }
  
  const style = STYLES[styleName] || STYLES[DEFAULT_STYLE];
  
  const rows = Math.ceil(photos.length / columns);
  
  const baseAvailableWidth = maxTotalWidth - 2 * FILM_BASE.edgeMargin - (columns - 1) * FILM_BASE.frameGap;
  const frameWidth = Math.min(Math.floor(baseAvailableWidth / columns), maxPhotoWidth);
  const frameHeight = Math.round(frameWidth / FRAME_ASPECT_RATIO);
  
  const FILM = getScaledFilm(frameWidth, styleName);
  
  const padding = FILM.edgeMargin;
  
  const rowHeightWithFilm = style.showSprockets 
    ? FILM.edgeTextHeight * 2 + FILM.sprocketHeight * 2 + frameHeight
    : frameHeight + 20;
  
  const rowTotalHeight = rowHeightWithFilm + FILM.rowGap;
  
  const totalWidth = 2 * padding + columns * frameWidth + (columns - 1) * FILM.frameGap;
  const totalHeight = 2 * padding + rows * rowHeightWithFilm + (rows - 1) * FILM.rowGap;
  
  console.log(`[ContactSheet] Config: ${photos.length} photos, ${columns}x${rows}, frame ${frameWidth}x${frameHeight}, scale ${(frameWidth/BASE_FRAME_WIDTH).toFixed(2)}x, total ${totalWidth}x${totalHeight}`);
  
  onProgress(0, photos.length, 'Initializing...');
  
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  
  const photoOffsetY = style.showSprockets 
    ? FILM.edgeTextHeight + FILM.sprocketHeight 
    : 0;
  
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const row = Math.floor(i / columns);
    const col = i % columns;
    
    onProgress(i + 1, photos.length, `Processing photo ${i + 1}/${photos.length}`);
    
    let photoPath: string | null = null;
    const relPath = photo.resolved_path || photo.full_rel_path || photo.thumb_rel_path;
    if (relPath) {
      const normalizedPath = relPath.replace(/^\/+/, '').replace(/\//g, path.sep);
      photoPath = path.join(uploadsDir, normalizedPath);
    }
    
    if (!photoPath) {
      console.warn(`[ContactSheet] Photo ${photo.id} has no path, skipping`);
      continue;
    }
    
    try {
      await fs.access(photoPath);
      
      const processedImage = await processPhotoForFrame(photoPath, frameWidth, frameHeight);
      
      const left = padding + col * (frameWidth + FILM.frameGap);
      const top = padding + row * rowTotalHeight + photoOffsetY;
      
      composites.push({
        input: processedImage,
        left: Math.round(left),
        top: Math.round(top)
      });
    } catch (err) {
      const error = err as Error;
      console.error(`[ContactSheet] Failed: ${photoPath}:`, error.message);
    }
  }
  
  if (composites.length === 0) {
    throw new Error('No valid photos could be processed. Check file paths.');
  }
  
  onProgress(photos.length, photos.length, 'Generating film overlay...');
  
  const overlaySVG = generateContactSheetOverlay({
    totalWidth,
    totalHeight,
    frameWidth,
    frameHeight,
    photos,
    columns,
    rows,
    style,
    rollInfo: {
      title: rollMetadata.title,
      film_name: rollMetadata.film_name_joined || rollMetadata.film_type || 'FILM',
      iso: rollMetadata.iso || rollMetadata.film_iso_joined,
      camera: rollMetadata.camera
    },
    padding,
    rowHeightWithFilm,
    FILM
  });
  
  onProgress(photos.length, photos.length, 'Compositing...');
  
  const bgRGB = hexToRgb(style.background || '#1a1a1a');
  
  const result = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 3,
      background: bgRGB
    }
  })
  .composite([
    { input: Buffer.from(overlaySVG), top: 0, left: 0 },
    ...composites
  ])
  .jpeg({ quality })
  .toBuffer();
  
  onProgress(photos.length, photos.length, 'Complete');
  
  return result;
}

// CommonJS compatibility
module.exports = {
  generateContactSheet,
  STYLES,
  DEFAULT_COLUMNS,
  DEFAULT_MAX_TOTAL_WIDTH,
  DEFAULT_MAX_PHOTO_WIDTH
};
