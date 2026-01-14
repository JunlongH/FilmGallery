/**
 * Film utility functions
 * Provides consistent film name formatting across the application
 */

interface Film {
  id?: number;
  name?: string;
  brand?: string;
}

/**
 * Get full display name for a film (brand + name)
 */
export function getFilmDisplayName(film: Film | null | undefined): string {
  if (!film) return 'Unknown Film';
  
  const name = film.name?.trim() || '';
  const brand = film.brand?.trim() || '';
  
  // Name field already contains full name (e.g., "CineStill CS 800T")
  // Only fallback to brand if name is empty
  return name || brand || 'Unknown Film';
}

/**
 * Get full display name for a film by ID from a films array
 */
export function getFilmDisplayNameById(filmId: number | null | undefined, films: Film[] | null | undefined): string {
  if (!filmId || !films) return 'Unknown Film';
  const film = films.find(f => f.id === filmId);
  return getFilmDisplayName(film);
}
