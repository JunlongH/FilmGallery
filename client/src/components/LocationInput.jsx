import React, { useEffect, useState } from 'react';
import { getCountries, searchLocations } from '../api';

/**
 * LocationInput - Free-form input for country/city with autocomplete suggestions
 * Supports custom values (including Chinese) not in database
 */
export default function LocationInput({ value, onChange }) {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  
  const [countryInput, setCountryInput] = useState('');
  const [cityInput, setCityInput] = useState('');

  // Load countries on mount for autocomplete
  useEffect(() => {
    getCountries().then(rows => {
      const sorted = (Array.isArray(rows) ? rows : []).sort((a, b) => 
        (a.country_name || '').localeCompare(b.country_name || '')
      );
      setCountries(sorted);
    });
  }, []);

  // Load cities when country input changes (for suggestions only)
  useEffect(() => {
    if (!countryInput.trim()) {
      setCities([]);
      return;
    }
    
    // Try to find matching country in database
    const match = countries.find(c => 
      c.country_name.toLowerCase() === countryInput.toLowerCase() ||
      c.country_code.toLowerCase() === countryInput.toLowerCase()
    );
    
    if (match) {
      searchLocations({ country: match.country_code }).then(rows => {
        setCities(Array.isArray(rows) ? rows : []);
      }).catch(() => setCities([]));
    } else {
      setCities([]);
    }
  }, [countryInput, countries]);

  // Initialize from value
  useEffect(() => {
    if (!value) {
      setCountryInput('');
      setCityInput('');
      return;
    }
    
    // Value can be { location_id, country_name, city_name } or { country_name, city_name }
    if (value.country_name) setCountryInput(value.country_name);
    if (value.city_name) setCityInput(value.city_name);
  }, [value]);

  // Notify parent when inputs change
  const handleChange = () => {
    const country = countryInput.trim();
    const city = cityInput.trim();
    
    if (!city) {
      onChange?.(null);
      return;
    }
    
    // Try to find exact match in database
    const countryMatch = countries.find(c => 
      c.country_name.toLowerCase() === country.toLowerCase() ||
      c.country_code.toLowerCase() === country.toLowerCase()
    );
    
    const cityMatch = cities.find(c => 
      c.city_name.toLowerCase() === city.toLowerCase()
    );
    
    // If found in DB, return with location_id
    if (cityMatch && countryMatch) {
      onChange?.({
        location_id: cityMatch.id,
        country_code: countryMatch.country_code,
        country_name: countryMatch.country_name,
        city_name: cityMatch.city_name,
        latitude: cityMatch.city_lat,
        longitude: cityMatch.city_lng
      });
    } else {
      // Custom input not in database
      onChange?.({
        location_id: null,
        country_code: null,
        country_name: country || null,
        city_name: city,
        latitude: null,
        longitude: null
      });
    }
  };

  // Filter suggestions based on input
  const filteredCountries = countries.filter(c =>
    c.country_name.toLowerCase().includes(countryInput.toLowerCase())
  ).slice(0, 100);
  
  const filteredCities = cities.filter(c =>
    c.city_name.toLowerCase().includes(cityInput.toLowerCase())
  ).slice(0, 100);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
      <div style={{ position: 'relative' }}>
        <input
          className="fg-input"
          list="country-input-list"
          value={countryInput}
          onChange={e => setCountryInput(e.target.value)}
          onBlur={handleChange}
          placeholder="Country (any text)"
          autoComplete="off"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <datalist id="country-input-list">
          {filteredCountries.map(c => (
            <option key={c.country_code} value={c.country_name} />
          ))}
        </datalist>
      </div>
      
      <div style={{ position: 'relative' }}>
        <input
          className="fg-input"
          list="city-input-list"
          value={cityInput}
          onChange={e => setCityInput(e.target.value)}
          onBlur={handleChange}
          placeholder="City (any text)"
          autoComplete="off"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <datalist id="city-input-list">
          {filteredCities.map(ct => (
            <option key={ct.id} value={ct.city_name} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
