/**
 * Tag Service
 * 
 * Manages photo tagging with:
 * - Case-insensitive tag normalization
 * - Deduplication of tag names
 * - Automatic orphan cleanup
 * - Batch tag attachment to photos
 */

import { runAsync, allAsync } from '../utils/db-helpers';
import PreparedStmt from '../utils/prepared-statements';

// Interfaces
export interface Tag {
  id: number;
  name: string;
}

export interface PhotoRow {
  id: number;
  [key: string]: unknown;
}

export interface PhotoWithTags extends PhotoRow {
  tags: Tag[];
}

interface TagRow {
  id: number;
  name: string;
}

interface PhotoTagRow {
  photo_id: number;
  tag_id: number;
  name: string;
}

/**
 * Normalize tag names: trim, deduplicate (case-insensitive), convert to lowercase
 */
export function normalizeTagNames(input: unknown[]): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of input) {
    if (raw === null || raw === undefined) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(lower); // Store as lowercase for database
    }
  }

  return result;
}

/**
 * Ensure tags exist in database (insert if missing)
 */
export async function ensureTagsExist(names: string[]): Promise<Map<string, Tag>> {
  if (!names || !names.length) return new Map();

  // Insert all tags (INSERT OR IGNORE handles duplicates)
  for (const name of names) {
    try {
      await PreparedStmt.runAsync('tags.insert', [name]);
    } catch (err: unknown) {
      // If UNIQUE constraint fails despite OR IGNORE, log but continue
      console.warn(`[TAG] Insert failed for "${name}":`, (err as Error).message);
    }
  }

  // Retrieve all tags by name
  const placeholders = names.map(() => '?').join(',');
  const rows = await allAsync<TagRow>(
    `SELECT id, name FROM tags WHERE name IN (${placeholders})`,
    names
  );

  // Build map: lowercase name -> tag object
  const tagMap = new Map<string, Tag>();
  for (const row of rows) {
    if (row && row.id && row.name) {
      tagMap.set(row.name.toLowerCase(), { id: row.id, name: row.name });
    }
  }

  return tagMap;
}

/**
 * Save tags for a photo (replaces existing tags)
 */
export async function savePhotoTags(
  photoId: number,
  rawNames: unknown[]
): Promise<Tag[]> {
  console.log(`[TAG] savePhotoTags called for photo ${photoId}:`, rawNames);

  // Normalize: trim, deduplicate, lowercase
  const names = normalizeTagNames(rawNames);
  console.log(`[TAG] Normalized tag names:`, names);

  try {
    // Step 1: Remove all existing photo-tag associations for this photo
    await PreparedStmt.runAsync('photo_tags.deleteByPhoto', [photoId]);
    console.log(`[TAG] Deleted existing tags for photo ${photoId}`);

    if (!names.length) {
      console.log(`[TAG] No tags to add for photo ${photoId}`);
      // Cleanup orphaned tags (non-blocking)
      runAsync('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM photo_tags)')
        .catch(err => console.warn('[TAG] Cleanup failed (non-critical):', (err as Error).message));
      return [];
    }

    // Step 2: Ensure all tags exist in database
    const tagMap = await ensureTagsExist(names);
    console.log(`[TAG] Ensured ${tagMap.size} tags exist`);

    // Step 3: Link tags to photo
    const tagsToLink = names
      .map(name => tagMap.get(name))
      .filter((tag): tag is Tag => Boolean(tag));

    const linkPromises = tagsToLink.map(tag => {
      console.log(`[TAG] Linking tag ${tag.id} (${tag.name}) to photo ${photoId}`);
      return PreparedStmt.runAsync('photo_tags.insert', [photoId, tag.id]);
    });

    await Promise.all(linkPromises);
    console.log(`[TAG] Linked ${linkPromises.length} tags to photo ${photoId}`);

    // Step 4: Cleanup orphaned tags (non-blocking)
    runAsync('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM photo_tags)')
      .catch(err => console.warn('[TAG] Cleanup failed (non-critical):', (err as Error).message));

    // Step 5: Return the applied tags
    const appliedTags = Array.from(tagMap.values());
    console.log(`[TAG] Successfully saved tags for photo ${photoId}:`, appliedTags);
    return appliedTags;

  } catch (err) {
    console.error(`[TAG] Error in savePhotoTags for photo ${photoId}:`, err);
    throw err;
  }
}

/**
 * Attach tags to an array of photo rows
 */
export async function attachTagsToPhotos<T extends PhotoRow>(
  rows: T[] = []
): Promise<PhotoWithTags[]> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows.map(r => ({ ...r, tags: [] }));
  }

  const ids = rows
    .map(r => r?.id)
    .filter((id): id is number => id !== undefined && id !== null);

  if (!ids.length) {
    return rows.map(r => ({ ...r, tags: [] }));
  }

  const placeholders = ids.map(() => '?').join(',');
  const tagRows = await allAsync<PhotoTagRow>(
    `SELECT pt.photo_id, t.id AS tag_id, t.name
     FROM photo_tags pt
     JOIN tags t ON t.id = pt.tag_id
     WHERE pt.photo_id IN (${placeholders})
     ORDER BY t.name COLLATE NOCASE`,
    ids
  );

  const map = new Map<number, Tag[]>();
  tagRows.forEach(row => {
    if (!map.has(row.photo_id)) map.set(row.photo_id, []);
    map.get(row.photo_id)!.push({ id: row.tag_id, name: row.name });
  });

  return rows.map(r => ({
    ...r,
    tags: map.get(r.id) || []
  }));
}

// CommonJS compatibility
module.exports = { 
  savePhotoTags, 
  attachTagsToPhotos,
  normalizeTagNames,
  ensureTagsExist
};
