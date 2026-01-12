/**
 * Film utility functions
 * Provides consistent film name formatting across the application
 */

/**
 * Get full display name for a film (brand + name)
 * @param {Object} film - Film object with optional brand and name properties
 * @returns {string} Formatted display name
 */
export function getFilmDisplayName(film) {
  if (!film) return 'Unknown Film';
  
  const brand = film.brand?.trim() || '';
  const name = film.name?.trim() || '';
  
  if (brand && name) {
    return `${brand} ${name}`;
  }
  return name || brand || 'Unknown Film';
}

/**
 * Get full display name for a film by ID from a films array
 * @param {number} filmId - Film ID
 * @param {Array} films - Array of film objects
 * @returns {string} Formatted display name
 */
export function getFilmDisplayNameById(filmId, films) {
  if (!filmId || !films) return 'Unknown Film';
  const film = films.find(f => f.id === filmId);
  return getFilmDisplayName(film);
}
