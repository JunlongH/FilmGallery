import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getCountries, getLocations } from '../api';

/**
 * LocationInput - Country/City input with autocomplete from database
 * 
 * IMPORTANT: This component ONLY handles country/city selection.
 * It does NOT modify latitude/longitude - those are handled separately by parent.
 * 
 * Props:
 * - value: { country_name, city_name } - current values to display
 * - onChange: callback when country/city changes -> { location_id, country_code, country_name, city_name }
 * - onCoordinatesAvailable: callback when matching city has coordinates -> { lat, lng } | null
 * 
 * Behavior:
 * 1. Country input shows autocomplete from database
 * 2. City input shows autocomplete filtered by selected country
 * 3. When city matches database entry with coordinates, calls onCoordinatesAvailable
 * 4. Parent component shows "Fill Coordinates" button based on onCoordinatesAvailable
 */
export default function LocationInput({ value, onChange, onCoordinatesAvailable }) {
  // Database data
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  
  // Input values (local state, synced from props)
  const [countryInput, setCountryInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  
  // Track if we're initializing to avoid calling onChange during init
  const isInitializing = useRef(true);
  
  // Track last notified values to avoid duplicate onChange calls
  const lastNotifiedRef = useRef({ country: '', city: '' });

  // ========== Load countries on mount ==========
  useEffect(() => {
    getCountries().then(rows => {
      const sorted = (Array.isArray(rows) ? rows : []).sort((a, b) => 
        (a.country_name || '').localeCompare(b.country_name || '')
      );
      setCountries(sorted);
    }).catch(err => {
      console.error('Failed to load countries:', err);
      setCountries([]);
    });
  }, []);

  // ========== Load cities when country changes ==========
  useEffect(() => {
    if (!countryInput.trim()) {
      setCities([]);
      return;
    }
    
    // Find matching country in database
    const match = countries.find(c => 
      c.country_name?.toLowerCase() === countryInput.toLowerCase() ||
      c.country_code?.toLowerCase() === countryInput.toLowerCase()
    );
    
    if (match) {
      // Use getLocations with hasRecords=false to get ALL cities for this country
      getLocations({ country: match.country_code, hasRecords: false }).then(rows => {
        console.log('[LocationInput] Loaded cities for', match.country_code, ':', rows?.length || 0, 'cities');
        setCities(Array.isArray(rows) ? rows : []);
      }).catch(err => {
        console.error('[LocationInput] Failed to load cities:', err);
        setCities([]);
      });
    } else {
      setCities([]);
    }
  }, [countryInput, countries]);

  // ========== Sync from props (only when props change externally) ==========
  useEffect(() => {
    const newCountry = value?.country_name || '';
    const newCity = value?.city_name || '';
    
    setCountryInput(newCountry);
    setCityInput(newCity);
    lastNotifiedRef.current = { country: newCountry, city: newCity };
    
    // After first render, no longer initializing
    setTimeout(() => {
      isInitializing.current = false;
    }, 100);
  }, [value?.country_name, value?.city_name]);

  // ========== Check for coordinates when cities load or city input changes ==========
  useEffect(() => {
    console.log('[LocationInput] Checking coords - cityInput:', cityInput, 'cities.length:', cities.length);
    
    if (!cityInput.trim() || cities.length === 0) {
      return;
    }
    
    const cityMatch = cities.find(c => 
      c.city_name?.toLowerCase() === cityInput.toLowerCase()
    );
    
    console.log('[LocationInput] cityMatch:', cityMatch);
    
    if (cityMatch && cityMatch.city_lat != null && cityMatch.city_lng != null) {
      console.log('[LocationInput] Calling onCoordinatesAvailable with:', cityMatch.city_lat, cityMatch.city_lng);
      onCoordinatesAvailable?.({ lat: cityMatch.city_lat, lng: cityMatch.city_lng });
    } else {
      onCoordinatesAvailable?.(null);
    }
  }, [cities, cityInput, onCoordinatesAvailable]);

  // ========== Notify parent of location change ==========
  const notifyChange = useCallback((country, city) => {
    // Skip if initializing
    if (isInitializing.current) return;
    
    // Skip if same as last notification
    if (country === lastNotifiedRef.current.country && city === lastNotifiedRef.current.city) {
      return;
    }
    
    lastNotifiedRef.current = { country, city };
    
    // If city is empty, notify null but parent should preserve lat/lng
    if (!city.trim()) {
      onChange?.(null);
      onCoordinatesAvailable?.(null);
      return;
    }
    
    // Try to find exact match in database
    const countryMatch = countries.find(c => 
      c.country_name?.toLowerCase() === country.toLowerCase() ||
      c.country_code?.toLowerCase() === country.toLowerCase()
    );
    
    const cityMatch = cities.find(c => 
      c.city_name?.toLowerCase() === city.toLowerCase()
    );
    
    if (cityMatch && countryMatch) {
      // Found in database - return with location_id
      const coords = (cityMatch.city_lat != null && cityMatch.city_lng != null)
        ? { lat: cityMatch.city_lat, lng: cityMatch.city_lng }
        : null;
      onCoordinatesAvailable?.(coords);
      
      onChange?.({
        location_id: cityMatch.id,
        country_code: countryMatch.country_code,
        country_name: countryMatch.country_name,
        city_name: cityMatch.city_name
        // NO lat/lng here - parent handles that separately
      });
    } else {
      // Custom input not in database
      onCoordinatesAvailable?.(null);
      
      onChange?.({
        location_id: null,
        country_code: null,
        country_name: country || null,
        city_name: city
      });
    }
  }, [countries, cities, onChange, onCoordinatesAvailable]);

  // ========== Handle country input change ==========
  const handleCountryChange = useCallback((e) => {
    const newValue = e.target.value;
    setCountryInput(newValue);
    // Don't notify parent yet - wait for blur or city selection
  }, []);

  // ========== Handle country blur ==========
  const handleCountryBlur = useCallback(() => {
    // Only notify if country actually changed AND we have a city
    const country = countryInput.trim();
    const city = cityInput.trim();
    
    if (country !== lastNotifiedRef.current.country && city) {
      notifyChange(country, city);
    } else {
      // Just update tracking without notifying
      lastNotifiedRef.current.country = country;
    }
  }, [countryInput, cityInput, notifyChange]);

  // ========== Handle city input change ==========
  const handleCityChange = useCallback((e) => {
    const newValue = e.target.value;
    setCityInput(newValue);
    
    // Check if user selected from datalist (exact match)
    const cityMatch = cities.find(c => 
      c.city_name?.toLowerCase() === newValue.toLowerCase()
    );
    
    if (cityMatch) {
      // User selected from autocomplete - notify immediately
      const country = countryInput.trim();
      notifyChange(country, newValue);
    }
  }, [cities, countryInput, notifyChange]);

  // ========== Handle city blur ==========
  const handleCityBlur = useCallback(() => {
    const country = countryInput.trim();
    const city = cityInput.trim();
    
    // Only notify if values actually changed
    if (country !== lastNotifiedRef.current.country || city !== lastNotifiedRef.current.city) {
      if (city) {
        notifyChange(country, city);
      }
    }
  }, [countryInput, cityInput, notifyChange]);

  // ========== Filtered suggestions ==========
  const filteredCountries = countries.filter(c =>
    c.country_name?.toLowerCase().includes(countryInput.toLowerCase())
  ).slice(0, 100);
  
  const filteredCities = cities.filter(c =>
    c.city_name?.toLowerCase().includes(cityInput.toLowerCase())
  ).slice(0, 100);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div>
        <input
          className="fg-input"
          list="location-country-list"
          value={countryInput}
          onChange={handleCountryChange}
          onBlur={handleCountryBlur}
          placeholder="Country"
          autoComplete="off"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <datalist id="location-country-list">
          {filteredCountries.map(c => (
            <option key={c.country_code} value={c.country_name} />
          ))}
        </datalist>
      </div>
      
      <div>
        <input
          className="fg-input"
          list="location-city-list"
          value={cityInput}
          onChange={handleCityChange}
          onBlur={handleCityBlur}
          placeholder="City"
          autoComplete="off"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <datalist id="location-city-list">
          {filteredCities.map(ct => (
            <option key={ct.id} value={ct.city_name} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
