// src/components/FilmSelector.jsx
import React from 'react';

export default function FilmSelector({ films = [], value, onChange }) {
  // 防御性处理：确保 films 一定是数组
  const safeFilms = Array.isArray(films) ? films : [];

  // Format film display text: Brand + Name, ISO, Format
  const formatFilmLabel = (f) => {
    const displayName = f.brand ? `${f.brand} ${f.name}` : f.name;
    const format = f.format || '135';
    return `${displayName} • ${f.iso} • ${format}`;
  };

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">— Select film —</option>
      {safeFilms.map(f => (
        <option key={f.id} value={f.id}>
          {formatFilmLabel(f)}
        </option>
      ))}
    </select>
  );
}