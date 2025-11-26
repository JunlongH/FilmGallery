// src/components/FilmSelector.jsx
import React from 'react';

export default function FilmSelector({ films = [], value, onChange }) {
  // 防御性处理：确保 films 一定是数组
  const safeFilms = Array.isArray(films) ? films : [];

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">— Select film —</option>
      {safeFilms.map(f => (
        <option key={f.id} value={f.id}>
          {f.name} • {f.iso} • {f.category}
        </option>
      ))}
    </select>
  );
}