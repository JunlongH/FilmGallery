/**
 * URL generation utilities for photo and roll assets
 * 
 * Generates proper URLs for:
 * - Full-size photos
 * - Thumbnail photos
 * - Negative scans
 * - Roll cover images
 */

export interface PhotoWithPaths {
  thumb_rel_path?: string;
  negative_rel_path?: string;
  full_rel_path?: string;
  filename?: string;
  roll_id?: number | string;
}

export interface RollWithCover {
  coverPath?: string;
  cover_photo?: string;
}

export type PhotoType = 'full' | 'thumb' | 'negative';

/**
 * Get URL for a photo based on type
 * @param baseUrl - API server base URL
 * @param photo - Photo object with path properties
 * @param type - Photo type: 'full', 'thumb', or 'negative'
 * @returns Full URL to the photo or null if unavailable
 */
export const getPhotoUrl = (
  baseUrl: string | null | undefined, 
  photo: PhotoWithPaths | null | undefined, 
  type: PhotoType = 'full'
): string | null => {
  if (!baseUrl || !photo) return null;
  
  // If photo object has a direct path property for the requested type
  if (type === 'thumb' && photo.thumb_rel_path) {
    return `${baseUrl}/uploads/${photo.thumb_rel_path}`;
  }
  if (type === 'negative' && photo.negative_rel_path) {
    return `${baseUrl}/uploads/${photo.negative_rel_path}`;
  }
  if (type === 'full' && photo.full_rel_path) {
    return `${baseUrl}/uploads/${photo.full_rel_path}`;
  }

  // Fallback for legacy or missing paths
  // Assuming standard structure: /uploads/rolls/<rollId>/<type>/<filename>
  if (photo.filename && photo.roll_id) {
    const folder = type === 'thumb' ? 'thumb' : (type === 'negative' ? 'negative' : 'full');
    return `${baseUrl}/uploads/rolls/${photo.roll_id}/${folder}/${photo.filename}`;
  }

  return null;
};

/**
 * Get URL for a roll's cover image
 * @param baseUrl - API server base URL
 * @param roll - Roll object with cover path
 * @returns Full URL to the cover image or null if unavailable
 */
export const getRollCoverUrl = (
  baseUrl: string | null | undefined, 
  roll: RollWithCover | null | undefined
): string | null => {
  if (!baseUrl || !roll) return null;
  
  if (roll.coverPath) {
    // coverPath from DB usually starts with /uploads/ or is relative
    // If it starts with /, append to baseUrl
    if (roll.coverPath.startsWith('/')) {
      return `${baseUrl}${roll.coverPath}`;
    }
    // If it doesn't start with /, assume it's relative to uploads/
    return `${baseUrl}/uploads/${roll.coverPath}`;
  }
  
  if (roll.cover_photo) {
    return `${baseUrl}/uploads/${roll.cover_photo}`;
  }
  
  return null;
};
