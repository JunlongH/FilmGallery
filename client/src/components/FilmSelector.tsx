// src/components/FilmSelector.tsx
import React from 'react';

interface Film {
  id: string | number;
  name: string;
  iso: string | number;
  category: string;
}

interface FilmSelectorProps {
  films?: Film[];
  value?: string | number | null;
  onChange: (value: string | null) => void;
}

export default function FilmSelector({ films = [], value, onChange }: FilmSelectorProps): React.JSX.Element {
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
