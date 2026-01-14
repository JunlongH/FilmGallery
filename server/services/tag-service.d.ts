/**
 * Type definitions for tag-service.js
 * Provides type safety without full TypeScript migration
 */

/**
 * Save tags for a photo with intelligent deduplication
 * - Removes old tags and creates new associations
 * - Ensures all tags exist in tags table
 * 
 * @param photoId - Photo ID
 * @param tags - Array of tag names (strings)
 * @returns Promise resolving when complete
 */
export function savePhotoTags(
  photoId: number,
  tags: string[]
): Promise<void>;

/**
 * Get tags for a specific photo
 * @param photoId - Photo ID
 * @returns Array of tag names
 */
export function getPhotoTags(photoId: number): Promise<string[]>;

/**
 * Attach tags to an array of photo objects
 * Mutates the photo objects by adding a `tags` array property
 * 
 * @param photos - Array of photo objects with `id` property
 * @returns Same array with tags attached
 */
export function attachTagsToPhotos<T extends { id: number }>(
  photos: T[]
): Promise<Array<T & { tags: string[] }>>;

/**
 * Get all unique tags
 * @returns Array of tag objects with id, name, photo_count
 */
export function getAllTags(): Promise<Array<{
  id: number;
  name: string;
  photo_count: number;
}>>;

/**
 * Delete a tag and all its associations
 * @param tagId - Tag ID
 * @returns Promise resolving when complete
 */
export function deleteTag(tagId: number): Promise<void>;

/**
 * Ensure a tag exists in the database
 * - Creates tag if it doesn't exist
 * - Returns existing tag ID if it does
 * 
 * @param tagName - Tag name (will be normalized to lowercase)
 * @returns Tag ID
 */
export function ensureTagExists(tagName: string): Promise<number>;
