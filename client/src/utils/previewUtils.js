import exifr from 'exifr';
import { isRawFile } from '@filmgallery/shared';

const TIFF_EXTENSIONS = ['.tif', '.tiff'];

/**
 * Checks if a file is a TIFF file based on extension.
 * @param {string} filename 
 * @returns {boolean}
 */
export const isTiffFile = (filename) => {
  if (!filename) return false;
  const ext = '.' + filename.split('.').pop().toLowerCase();
  return TIFF_EXTENSIONS.includes(ext);
};

/**
 * Generates a preview URL for a file.
 * Prioritizes extracting embedded thumbnails for RAW/TIFF files.
 * Fallbacks to standard object URL.
 * 
 * @param {File} file 
 * @returns {Promise<string>} Blob URL or potentially null/placeholder
 */
export async function generatePreview(file) {
  if (!file) return null;

  // Handle RAW and TIFF files which browsers often can't display natively
  if (isRawFile(file.name) || isTiffFile(file.name)) {
    try {
      // Attempt to extract embedded thumbnail (this is much faster than full decode)
      // We increase firstChunkSize to 512KB to handle DNGs with large headers (e.g. Leica)
      const thumbUrl = await exifr.thumbnailUrl(file, { 
        thumbnail: true,
        firstChunkSize: 1024 * 1024 
      });
      
      if (thumbUrl) {
        return thumbUrl;
      }
    } catch (err) {
      console.warn('[PreviewUtils] Failed to extract thumbnail for', file.name, err);
    }
  }

// 5. Robust Fallback
  // If thumbnail extraction fails or file is not RAW/TIFF (e.g. unknown type), 
  // standard behavior is createObjectURL.
  // BUT for RAW files that failed extraction, createObjectURL will result in a broken image.
  // So we should return a placeholder if we KNOW it's a RAW file.
  if (isRawFile(file.name) || isTiffFile(file.name)) {
    // Return a data URI or path to a static asset for "RAW File"
    // Since we don't have a guaranteed asset, use a data URI SVG as fallback
    return `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+CiAgPHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNlMGUwZTAiIC8+CiAgPHRleHQgeD0iNTAiIHk9IjUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIiBmaWxsPSIjNzU3NTc1Ij5SQVc8L3RleHQ+Cjwvc3ZnPg==`;
  }

  // Fallback to minimal browser native handling
  // For RAW/TIFF without thumbnail, this might show as broken image icon depending on browser
  return URL.createObjectURL(file);
}
