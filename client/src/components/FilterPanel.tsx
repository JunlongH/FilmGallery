import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMetadataOptions, getLocations, getFilms, MetadataOptions } from '../api';

// Type definitions
interface Film {
  id: number;
  name: string;
}

interface Location {
  id: number;
  city_name?: string;
  city?: string;
  country_name?: string;
}

// Extended options including films as objects (from getFilms API)
interface ExtendedOptions extends MetadataOptions {
  filmsData: Film[];
}

export interface PhotoFilters {
  camera: string[];
  lens: string[];
  photographer: string[];
  location_id: string[];
  year: string[];
  ym: string[];
  film: string[];
}

interface NormalizedItem {
  value: string;
  label: string;
}

export interface FilterPanelProps {
  /** Whether the filter panel is open/visible */
  isOpen: boolean;
  /** Callback when filters change */
  onChange: (filters: PhotoFilters) => void;
}

const EMPTY_FILTERS: PhotoFilters = {
  camera: [],
  lens: [],
  photographer: [],
  location_id: [],
  year: [],
  ym: [],
  film: []
};

const MONTHS = [
  { v: '01', l: 'Jan' }, { v: '02', l: 'Feb' }, { v: '03', l: 'Mar' }, { v: '04', l: 'Apr' },
  { v: '05', l: 'May' }, { v: '06', l: 'Jun' }, { v: '07', l: 'Jul' }, { v: '08', l: 'Aug' },
  { v: '09', l: 'Sep' }, { v: '10', l: 'Oct' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dec' }
];

const FilterPanel: React.FC<FilterPanelProps> = ({ isOpen, onChange }) => {
  const [options, setOptions] = useState<ExtendedOptions>({
    cameras: [],
    lenses: [],
    photographers: [],
    films: [],
    filmsData: []
  });
  const [locations, setLocations] = useState<Location[]>([]);
  const [filters, setFilters] = useState<PhotoFilters>(EMPTY_FILTERS);
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});
  const [years, setYears] = useState<string[]>([]);

  useEffect(() => {
    getMetadataOptions()
      .then((o) => {
        setOptions(prev => ({ ...prev, ...o }));
        // Extract years from the API response if available
        const oWithYears = o as unknown as { years?: string[] };
        if (oWithYears.years) {
          setYears(oWithYears.years);
        }
      })
      .catch(console.error);
    getLocations()
      .then((locs) => setLocations(locs as Location[]))
      .catch(console.error);
    getFilms()
      .then((arr) => {
        if (Array.isArray(arr)) {
          setOptions(prev => ({
            ...prev,
            filmsData: arr as Film[]
          }));
        }
      })
      .catch(console.error);
  }, []);

  const toggleValue = (key: keyof PhotoFilters, value: string) => {
    setFilters(prev => {
      const cur = Array.isArray(prev[key]) ? prev[key] : [];
      const exists = cur.includes(value);
      const next = exists ? cur.filter(v => v !== value) : [...cur, value];
      const newFilters = { ...prev, [key]: next };
      onChange(newFilters);
      return newFilters;
    });
  };

  const toggleYear = (year: string) => {
    setFilters(prev => {
      const curYears = Array.isArray(prev.year) ? prev.year : [];
      const isOn = curYears.includes(year);
      const nextYears = isOn ? curYears.filter(y => y !== year) : [...curYears, year];
      // If turning off a year, also drop any ym entries for that year
      const nextYm = (prev.ym || []).filter(v => !String(v).startsWith(`${year}-`));
      const newFilters = { ...prev, year: nextYears, ym: nextYm };
      onChange(newFilters);
      return newFilters;
    });
    setOpenYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleYearMonth = (year: string, month: string) => {
    const ym = `${year}-${month}`;
    setFilters(prev => {
      const list = prev.ym || [];
      const exists = list.includes(ym);
      const next = exists ? list.filter(v => v !== ym) : [...list, ym];
      // Ensure the year is selected
      const years = prev.year.includes(year) ? prev.year : [...prev.year, year];
      const newFilters = { ...prev, ym: next, year: years };
      onChange(newFilters);
      return newFilters;
    });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    onChange(EMPTY_FILTERS);
    setOpenYears({});
  };

  const normalizeItems = (items: (string | NormalizedItem)[]): NormalizedItem[] =>
    items.map(it => (typeof it === 'object' ? it : { value: String(it), label: String(it) }));

  interface SectionProps {
    title: string;
    items: (string | NormalizedItem)[];
    keyName: keyof PhotoFilters;
  }

  const Section: React.FC<SectionProps> = ({ title, items = [], keyName }) => (
    <div className="fg-field" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
      <label className="fg-label">{title}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {normalizeItems(items).map((it, idx) => {
          const val = it.value;
          const label = it.label;
          const active = (filters[keyName] || []).includes(val);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggleValue(keyName, val)}
              className="chip-option"
              aria-pressed={active}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          style={{ overflow: 'hidden', marginBottom: isOpen ? 24 : 0 }}
        >
          <div style={{
            background: 'var(--color-bg-alt)',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px 16px',
            alignItems: 'start'
          }}>
            <Section title="Camera" items={options.cameras} keyName="camera" />
            <Section title="Lens" items={options.lenses} keyName="lens" />
            <Section title="Photographer" items={options.photographers} keyName="photographer" />
            <Section title="Location" items={locations.map(l => ({ value: String(l.id), label: l.city_name || l.city || '' }))} keyName="location_id" />
            <Section title="Film" items={(options.filmsData || []).map(f => ({ value: String(f.id), label: f.name }))} keyName="film" />
            
            <div className="fg-field" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
              <label className="fg-label">Year</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {normalizeItems(years || []).map((it, idx) => {
                  const y = it.value;
                  const active = (filters.year || []).includes(y);
                  return (
                    <button
                      key={idx}
                      type="button"
                      className="chip-option"
                      aria-pressed={active}
                      onClick={() => toggleYear(y)}
                    >
                      {it.label}
                      <span style={{ marginLeft: 6, opacity: 0.7 }}>{openYears[y] ? '▴' : '▾'}</span>
                    </button>
                  );
                })}
              </div>
              {/* Expandable month chips per selected year */}
              {(filters.year || []).map((y) => (
                openYears[y] ? (
                  <div key={`months-${y}`} style={{ marginTop: 8, padding: '8px 4px', borderTop: '1px dashed var(--color-border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Months of {y}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {MONTHS.map(m => {
                        const active = (filters.ym || []).includes(`${y}-${m.v}`);
                        return (
                          <button
                            key={`${y}-${m.v}`}
                            type="button"
                            className="chip-option"
                            aria-pressed={active}
                            onClick={() => toggleYearMonth(y, m.v)}
                          >
                            {m.l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
              <button
                className="fg-btn"
                onClick={clearFilters}
                style={{ height: '38px', marginTop: 8 }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FilterPanel;
