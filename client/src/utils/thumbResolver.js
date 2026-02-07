/**
 * Thumbnail URL Resolver
 *
 * Single source of truth for deciding which thumbnail/image path to display
 * on the client side.  Every component that shows a photo thumbnail should
 * import and use these helpers instead of hand‑rolling fallback chains.
 *
 * Priority rules (consistent everywhere):
 *   Positive mode:  positive_thumb_rel_path → thumb_rel_path → positive_rel_path → full_rel_path
 *   Negative mode:  negative_thumb_rel_path → thumb_rel_path → negative_rel_path
 *   Auto mode:      positive_thumb_rel_path → thumb_rel_path → negative_thumb_rel_path
 *                   → positive_rel_path → full_rel_path → negative_rel_path
 *
 * @module utils/thumbResolver
 */

// ── Thumb path (relative, DB value) ────────────────────────────────────────

/**
 * Return the best available *relative* thumb path for a photo object.
 *
 * @param {Object} photo        – Photo record (DB row or API response)
 * @param {'positive'|'negative'|'auto'} [mode='positive']
 * @returns {string|null}
 */
export function resolveThumbPath(photo, mode = 'positive') {
  if (!photo) return null;

  switch (mode) {
    case 'negative':
      return (
        photo.negative_thumb_rel_path ||
        photo.thumb_rel_path ||
        photo.negative_rel_path ||
        null
      );

    case 'auto':
      return (
        photo.positive_thumb_rel_path ||
        photo.thumb_rel_path ||
        photo.negative_thumb_rel_path ||
        photo.positive_rel_path ||
        photo.full_rel_path ||
        photo.negative_rel_path ||
        null
      );

    case 'positive':
    default:
      return (
        photo.positive_thumb_rel_path ||
        photo.thumb_rel_path ||
        photo.positive_rel_path ||
        photo.full_rel_path ||
        null
      );
  }
}

// ── Full‑size image path ────────────────────────────────────────────────────

/**
 * Return the best available *relative* full‑size image path.
 *
 * @param {Object} photo
 * @param {'positive'|'negative'|'auto'} [mode='positive']
 * @returns {string|null}
 */
export function resolveFullPath(photo, mode = 'positive') {
  if (!photo) return null;

  switch (mode) {
    case 'negative':
      return photo.negative_rel_path || photo.full_rel_path || null;

    case 'auto':
      return (
        photo.positive_rel_path ||
        photo.full_rel_path ||
        photo.negative_rel_path ||
        null
      );

    case 'positive':
    default:
      return photo.positive_rel_path || photo.full_rel_path || null;
  }
}
