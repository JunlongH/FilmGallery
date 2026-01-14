import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { ActivityIndicator, Button, HelperText, IconButton, Text, TextInput, useTheme, FAB } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import DatePickerField from '../components/DatePickerField';
import DraggableFab from '../components/DraggableFab';
import ShotModeModal from '../components/ShotModeModal';
import locationService from '../services/locationService.native';
import { parseISODate, toISODateString } from '../utils/date';
import { getFilmItem, updateFilmItem, getMetadataOptions, getCountries, searchLocations, getFilms } from '../api/filmItems';
import { getCamera, getCompatibleLenses } from '../api/equipment';
import { spacing, radius } from '../theme';

function parseShotLog(raw) {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data
      .map(entry => ({
        date: entry.date,
        count: Number(entry.count || entry.shots || 0) || 0,
        lens: entry.lens || '',
        aperture: entry.aperture !== undefined && entry.aperture !== null ? Number(entry.aperture) : null,
        shutter_speed: entry.shutter_speed || '',
        country: entry.country || '',
        city: entry.city || '',
        detail_location: entry.detail_location || '',
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null
      }))
      .filter(e => e.date && e.count > 0);
  } catch {
    return [];
  }
}

const FALLBACK_LENSES = [
  '50mm f/1.8',
  '35mm f/1.4',
  '28mm f/2.8',
  '85mm f/1.8',
  '24-70mm f/2.8',
  '70-200mm f/2.8'
];

const dedupeAndSort = (list) => Array.from(new Set((list || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));

export default function ShotLogScreen({ route, navigation }) {
  const theme = useTheme();
  const { itemId, filmName, autoOpenShotMode } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newShots, setNewShots] = useState('1');
  const [newLens, setNewLens] = useState('');
  const [newAperture, setNewAperture] = useState('');
  const [newShutter, setNewShutter] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [lensOptions, setLensOptions] = useState(FALLBACK_LENSES);
  const [countries, setCountries] = useState([]);
  const [countryCode, setCountryCode] = useState('');
  const [cities, setCities] = useState([]);
  const [showLensOptions, setShowLensOptions] = useState(false);
  const [showCountryOptions, setShowCountryOptions] = useState(false);
  const [showCityOptions, setShowCityOptions] = useState(false);
  const [showShotMode, setShowShotMode] = useState(false);
  const [filmIso, setFilmIso] = useState(400);
  const [didAutoOpen, setDidAutoOpen] = useState(false);
  // Geolocation state
  const [newLatitude, setNewLatitude] = useState(null);
  const [newLongitude, setNewLongitude] = useState(null);
  // Preloaded location for ShotModeModal - starts fetching when screen opens
  const [preloadedLocation, setPreloadedLocation] = useState(null);
  // Fixed lens camera info
  const [fixedLensInfo, setFixedLensInfo] = useState(null);
  const [cameraName, setCameraName] = useState('');
  const [cameraMount, setCameraMount] = useState('');
  // Inventory lenses (native and adapted)
  const [nativeLenses, setNativeLenses] = useState([]); // [{ id, displayName, ... }]
  const [adaptedLenses, setAdaptedLenses] = useState([]); // [{ id, displayName, mount, ... }]

  // Format lens for display
  const formatLensDisplay = (lens) => {
    const name = `${lens.brand || ''} ${lens.model || ''}`.trim();
    if (lens.focal_length_min) {
      const focalStr = lens.focal_length_min === lens.focal_length_max || !lens.focal_length_max
        ? `${lens.focal_length_min}mm`
        : `${lens.focal_length_min}-${lens.focal_length_max}mm`;
      const apertureStr = lens.max_aperture ? ` f/${lens.max_aperture}` : '';
      return name ? `${name} ${focalStr}${apertureStr}` : `${focalStr}${apertureStr}`;
    }
    return name || lens.name || 'Unknown Lens';
  };

  useEffect(() => {
    navigation.setOptions({ title: filmName ? `${filmName} Shot Log` : 'Shot Log' });
  }, [navigation, filmName]);

  // Preload location when screen opens - this gives ShotModeModal a head start
  useEffect(() => {
    let mounted = true;
    
    const preloadLocation = async () => {
      try {
        // Use locationService for preloading - it now includes geocode
        const result = await locationService.preloadLocation();
        
        if (!mounted) return;
        
        // Check if successful
        if (result.success && result.coords) {
          __DEV__ && console.log('[ShotLogScreen] Preloaded location:', result.source);
          
          // Use geocode from service if available
          if (result.geocode && (result.geocode.country || result.geocode.city)) {
            __DEV__ && console.log('[ShotLogScreen] Using geocode from service:', result.geocode);
            setPreloadedLocation({
              country: result.geocode.country || '',
              city: result.geocode.city || '',
              detail: result.geocode.detail || '',
              latitude: result.coords.latitude,
              longitude: result.coords.longitude,
              altitude: result.coords.altitude
            });
          } else {
            // Fallback: use locationService's reverseGeocode (BigDataCloud, works in China)
            try {
              const geocode = await locationService.reverseGeocode(
                result.coords.latitude,
                result.coords.longitude
              );
              
              setPreloadedLocation({
                country: geocode.country || '',
                city: geocode.city || '',
                detail: geocode.detail || '',
                latitude: result.coords.latitude,
                longitude: result.coords.longitude,
                altitude: result.coords.altitude
              });
            } catch (e) {
              // Reverse geocode failed, still save coords (location will show as coordinates only)
              __DEV__ && console.log('[ShotLogScreen] Reverse geocode failed, saving coords only');
              setPreloadedLocation({
                country: '',
                city: '',
                detail: '',
                latitude: result.coords.latitude,
                longitude: result.coords.longitude,
                altitude: result.coords.altitude
              });
            }
          }
        } else {
          __DEV__ && console.log('[ShotLogScreen] Preload failed:', result?.error);
        }

      } catch (e) {
        console.warn('[ShotLogScreen] Location preload failed:', e);
      }
    };

    preloadLocation();

    return () => {
      mounted = false;
      locationService.stopWatch();
    };
  }, []);

  useEffect(() => {
    if (!loading && autoOpenShotMode && !didAutoOpen) {
      setShowShotMode(true);
      setDidAutoOpen(true);
    }
  }, [loading, autoOpenShotMode, didAutoOpen]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!itemId) {
          throw new Error('Missing film item id');
        }
        const data = await getFilmItem(itemId);
        if (!mounted) return;
        const base = data.item || data;
        setEntries(parseShotLog(base.shot_logs));
        
        if (base.iso) {
          setFilmIso(Number(base.iso));
        } else if (base.film_id) {
          // Fallback: fetch film definition to get ISO
          try {
            const films = await getFilms();
            const film = films.find(f => f.id === base.film_id);
            if (film && film.iso) {
              setFilmIso(Number(film.iso));
            }
          } catch (e) {
            console.warn('Failed to fetch film ISO fallback', e);
          }
        }
        
        // Check camera: fixed lens or get compatible lenses for interchangeable lens cameras
        if (base.camera_equip_id) {
          try {
            const result = await getCompatibleLenses(base.camera_equip_id);
            
            if (result.fixed_lens) {
              // Fixed lens camera
              const fixedLensText = result.focal_length 
                ? `${result.focal_length}mm${result.max_aperture ? ` f/${result.max_aperture}` : ''}`
                : 'Fixed Lens';
              setCameraName(result.camera_name || '');
              setCameraMount('');
              setFixedLensInfo({
                text: fixedLensText,
                focal_length: result.focal_length,
                max_aperture: result.max_aperture
              });
              setNativeLenses([]);
              setAdaptedLenses([]);
              // Auto-fill lens for fixed lens cameras
              setNewLens(fixedLensText);
            } else {
              // Interchangeable lens camera - store native and adapted lenses
              setCameraName(result.camera_name || '');
              setCameraMount(result.camera_mount || '');
              setFixedLensInfo(null);
              
              // Process native lenses
              const native = (result.lenses || []).map(lens => ({
                ...lens,
                displayName: formatLensDisplay(lens)
              }));
              setNativeLenses(native);
              
              // Process adapted lenses
              const adapted = (result.adapted_lenses || []).map(lens => ({
                ...lens,
                displayName: formatLensDisplay(lens)
              }));
              setAdaptedLenses(adapted);
              
              // Add all to flat lensOptions for backward compatibility
              const allLensNames = [...native, ...adapted].map(l => l.displayName).filter(Boolean);
              setLensOptions(prev => dedupeAndSort([...allLensNames, ...prev]));
            }
          } catch (e) {
            console.warn('Failed to fetch camera/lens info', e);
          }
        } else if (base.loaded_camera) {
          setCameraName(base.loaded_camera);
        }
      } catch (err) {
        console.log('Failed to load shot log', err);
        if (mounted) setError('Failed to load shot log');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [itemId]);

  useEffect(() => {
    let mounted = true;
    getMetadataOptions()
      .then((opts) => {
        if (!mounted) return;
        const base = Array.isArray(opts?.lenses) && opts.lenses.length ? opts.lenses : FALLBACK_LENSES;
        // Add to existing options instead of replacing (to preserve compatible lenses from camera)
        setLensOptions(prev => dedupeAndSort([...prev, ...base]));
      })
      .catch(() => setLensOptions(prev => dedupeAndSort([...prev, ...FALLBACK_LENSES])));
    return () => { mounted = false; };
  }, []);

  const handleShotData = (data) => {
    setShowShotMode(false);
    if (data.iso) setFilmIso(Number(data.iso));
    if (data.lens) setNewLens(data.lens);
    if (data.f) setNewAperture(data.f.toString());
    if (data.s) setNewShutter(data.s.toString());
    if (data.location) {
      setNewCountry(data.location.country || '');
      setNewCity(data.location.city || '');
      setNewDetail(data.location.detail || '');
      // Extract GPS coordinates
      if (data.location.latitude != null) setNewLatitude(data.location.latitude);
      if (data.location.longitude != null) setNewLongitude(data.location.longitude);
    }
    setNewDate(new Date().toISOString().split('T')[0]);
  };

  useEffect(() => {
    setLensOptions((prev) => dedupeAndSort([...prev, ...entries.map(e => e.lens).filter(Boolean)]));
  }, [entries]);

  useEffect(() => {
    getCountries()
      .then(rows => {
        const sorted = (Array.isArray(rows) ? rows : []).sort((a, b) => (a.country_name || '').localeCompare(b.country_name || ''));
        setCountries(sorted);
      })
      .catch(() => setCountries([]));
  }, []);

  useEffect(() => {
    const matched = countries.find(c => (c.country_name || '').toLowerCase() === newCountry.toLowerCase());
    const code = matched ? matched.country_code : '';
    setCountryCode(code);
    if (code) {
      searchLocations({ country: code }).then(rows => setCities(Array.isArray(rows) ? rows : [])).catch(() => setCities([]));
    } else {
      setCities([]);
    }
  }, [newCountry, countries]);

  useEffect(() => {
    const last = entries[entries.length - 1];
    if (!last) return;
    if (!newLens) setNewLens(last.lens || '');
    if (!newCountry) setNewCountry(last.country || '');
    if (!newCity) setNewCity(last.city || '');
    if (!newDetail) setNewDetail(last.detail_location || '');
    if (!newAperture && (last.aperture || last.aperture === 0)) setNewAperture(String(last.aperture));
    if (!newShutter && last.shutter_speed) setNewShutter(last.shutter_speed);
  }, [entries.length]);

  const totalShots = entries.reduce((sum, e) => sum + e.count, 0);
  const daysLogged = new Set(entries.map(e => e.date)).size;

  const upsertEntry = () => {
    if (!newDate) return;
    const count = Number(newShots || 0) || 0;
    if (!count) return;
    const lensVal = newLens.trim();
    const last = entries[entries.length - 1] || {};
    const apertureVal = newAperture !== '' ? Number(newAperture) : (last.aperture ?? null);
    const shutterVal = newShutter || last.shutter_speed || '';
    setEntries(prev => {
      const next = [...prev, {
        date: newDate,
        count,
        lens: lensVal,
        aperture: Number.isFinite(apertureVal) ? apertureVal : null,
        shutter_speed: shutterVal,
        country: newCountry || last.country || '',
        city: newCity || last.city || '',
        detail_location: newDetail || last.detail_location || '',
        latitude: newLatitude,
        longitude: newLongitude
      }];
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
    if (lensVal) setLensOptions(prev => dedupeAndSort([...prev, lensVal]));
    setNewShots('1');
    setNewAperture(apertureVal !== null && apertureVal !== undefined && apertureVal !== '' ? String(apertureVal) : '');
    setNewShutter(shutterVal || '');
    setNewCountry(prev => prev || last.country || '');
    setNewCity(prev => prev || last.city || '');
    setNewDetail(prev => prev || last.detail_location || '');
    // Reset coordinates for next entry
    setNewLatitude(null);
    setNewLongitude(null);
    setShowLensOptions(false);
    setShowCountryOptions(false);
    setShowCityOptions(false);
  };

  const removeEntryAt = (idx) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const onSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = entries
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(e => ({
          date: e.date,
          count: e.count,
          lens: e.lens || '',
          aperture: Number.isFinite(e.aperture) ? e.aperture : (e.aperture !== undefined && e.aperture !== null && e.aperture !== '' ? Number(e.aperture) : null),
          shutter_speed: e.shutter_speed || '',
          country: e.country || '',
          city: e.city || '',
          detail_location: e.detail_location || '',
          latitude: e.latitude ?? null,
          longitude: e.longitude ?? null
        }));
      await updateFilmItem(itemId, { shot_logs: JSON.stringify(payload) });
      navigation.goBack();
    } catch (err) {
      console.log('Failed to save shot log', err);
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  if (!itemId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.error }}>Missing film item.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={entries.map((entry, idx) => ({ ...entry, _idx: idx })).sort((a, b) => b.date.localeCompare(a.date) || b._idx - a._idx)}
        keyExtractor={item => `${item.date}-${item._idx}`}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl * 2 }}
        ListHeaderComponent={() => (
          <View style={{ paddingBottom: spacing.md }}>
            {error ? (
              <HelperText type="error" visible style={{ marginBottom: spacing.sm }}>
                {error}
              </HelperText>
            ) : null}
            <View style={styles.statsRow}>
              <LinearGradient
                colors={['#6a11cb', '#2575fc']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statCard}
              >
                <Text style={styles.statLabel}>Total Shots</Text>
                <Text style={styles.statValue}>{totalShots}</Text>
              </LinearGradient>

              <LinearGradient
                colors={['#f093fb', '#f5576c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statCard}
              >
                <Text style={styles.statLabel}>Days Logged</Text>
                <Text style={styles.statValue}>{daysLogged}</Text>
              </LinearGradient>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: theme.colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium">{item.date}</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                {item.count} shots
              </Text>
              {item.lens ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Lens: {item.lens}
                </Text>
              ) : null}
              {(item.aperture !== undefined && item.aperture !== null) || item.shutter_speed ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.aperture !== undefined && item.aperture !== null ? `f${item.aperture}` : ''}{item.aperture && item.shutter_speed ? ' · ' : ''}{item.shutter_speed ? `s${item.shutter_speed}` : ''}
                </Text>
              ) : null}
              {(item.country || item.city || item.detail_location) ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  { [item.country, item.city].filter(Boolean).join(' / ') || '—' }{ item.detail_location ? ` · ${item.detail_location}` : '' }
                </Text>
              ) : null}
              {item.latitude != null && item.longitude != null ? (
                <Text variant="bodySmall" style={{ color: '#4ade80' }}>
                  📍 {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                </Text>
              ) : null}
            </View>
            <IconButton icon="delete" onPress={() => removeEntryAt(item._idx)} />
          </View>
        )}
        ListEmptyComponent={() => (
          <Text style={{ textAlign: 'center', marginVertical: spacing.xl, color: theme.colors.onSurfaceVariant }}>
            No shot logs yet.
          </Text>
        )}
      />

      <View style={styles.footer}>
        <Text variant="titleSmall" style={{ marginBottom: spacing.sm }}>Add Log Entry</Text>
        <View style={styles.inputRow}>
          <View style={{ flex: 2 }}>
            <DatePickerField
              label="Date"
              value={parseISODate(newDate) || new Date()}
              onChange={(d) => setNewDate(toISODateString(d))}
            />
          </View>
          <TextInput
            label="Shots"
            mode="outlined"
            keyboardType="numeric"
            value={newShots}
            onChangeText={setNewShots}
            style={[styles.input, { flex: 1 }]}
            dense
          />
          <Button
            mode="contained"
            onPress={upsertEntry}
            disabled={!newDate}
            style={styles.addButton}
          >
            Add
          </Button>
        </View>

        {/* Fixed Lens Camera Indicator */}
        {fixedLensInfo && (
          <View style={styles.fixedLensIndicator}>
            <Text style={styles.fixedLensText}>
              🔒 Fixed Lens Camera: {fixedLensInfo.text}
            </Text>
            <Text style={styles.fixedLensSubtext}>
              Lens is automatically set for {cameraName || 'this camera'}
            </Text>
          </View>
        )}

        {/* Lens input - disabled for fixed lens cameras */}
        <TextInput
          label={fixedLensInfo ? "Lens (Fixed)" : "Lens (custom or pick below)"}
          mode="outlined"
          value={newLens}
          onChangeText={fixedLensInfo ? undefined : setNewLens}
          style={[styles.input, { marginBottom: spacing.xs }, fixedLensInfo && styles.disabledInput]}
          dense
          disabled={!!fixedLensInfo}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          <TextInput
            label="Aperture (f)"
            mode="outlined"
            keyboardType="decimal-pad"
            value={newAperture}
            onChangeText={setNewAperture}
            placeholder="1.8"
            style={[styles.input, { flex: 1 }]}
            dense
          />
          <TextInput
            label="Shutter (s)"
            mode="outlined"
            value={newShutter}
            onChangeText={setNewShutter}
            placeholder="1/125"
            style={[styles.input, { flex: 1 }]}
            dense
          />
        </View>
        {/* Lens suggestions - hidden for fixed lens cameras, shown for interchangeable */}
        {!fixedLensInfo && (
          <>
            <Button
              mode="text"
              onPress={() => setShowLensOptions(v => !v)}
              style={{ alignSelf: 'flex-start', marginBottom: showLensOptions ? spacing.xs : spacing.sm }}
            >
              {showLensOptions ? 'Hide lens options' : `Select from ${nativeLenses.length + adaptedLenses.length || lensOptions.length} lenses`}
            </Button>
            {showLensOptions && (
              <View style={{ marginBottom: spacing.sm }}>
                {/* Native lenses section */}
                {nativeLenses.length > 0 && (
                  <>
                    <Text variant="labelMedium" style={{ color: theme.colors.primary, marginBottom: 6, fontWeight: '600' }}>
                      📷 Native Lenses {cameraMount ? `(${cameraMount})` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm }}>
                      {nativeLenses.map(l => (
                        <Button
                          key={`native-${l.id}`}
                          mode={newLens === l.displayName ? 'contained' : 'outlined'}
                          onPress={() => { setNewLens(l.displayName); setShowLensOptions(false); }}
                          compact
                          style={{ marginRight: 4 }}
                        >
                          {l.displayName}
                        </Button>
                      ))}
                    </View>
                  </>
                )}
                
                {/* Adapted lenses section */}
                {adaptedLenses.length > 0 && (
                  <>
                    <Text variant="labelMedium" style={{ color: theme.colors.secondary, marginBottom: 6, fontWeight: '600' }}>
                      🔄 Adapted Lenses
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm }}>
                      {adaptedLenses.map(l => (
                        <Button
                          key={`adapted-${l.id}`}
                          mode={newLens === l.displayName ? 'contained' : 'outlined'}
                          onPress={() => { setNewLens(l.displayName); setShowLensOptions(false); }}
                          compact
                          style={{ marginRight: 4 }}
                        >
                          {l.displayName} [{l.mount}]
                        </Button>
                      ))}
                    </View>
                  </>
                )}
                
                {/* Fallback: show flat options if no inventory lenses */}
                {nativeLenses.length === 0 && adaptedLenses.length === 0 && lensOptions.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm }}>
                    {lensOptions.map(l => (
                      <Button
                        key={l}
                        mode={newLens === l ? 'contained' : 'outlined'}
                        onPress={() => { setNewLens(l); setShowLensOptions(false); }}
                        compact
                        style={{ marginRight: 4 }}
                      >
                        {l}
                      </Button>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          <TextInput
            label="Country"
            mode="outlined"
            value={newCountry}
            onChangeText={setNewCountry}
            style={[styles.input, { flex: 1 }]}
            dense
          />
          <TextInput
            label="City"
            mode="outlined"
            value={newCity}
            onChangeText={setNewCity}
            style={[styles.input, { flex: 1 }]}
            dense
            disabled={!countryCode && !newCountry}
          />
        </View>

        <Button
          mode="text"
          onPress={() => setShowCountryOptions(v => !v)}
          style={{ alignSelf: 'flex-start', marginBottom: showCountryOptions ? spacing.xs : spacing.sm }}
        >
          {showCountryOptions ? 'Hide country suggestions' : 'Show country suggestions'}
        </Button>
        {showCountryOptions ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm }}>
            {countries
              .filter(c => !newCountry || (c.country_name || '').toLowerCase().includes(newCountry.toLowerCase()))
              .slice(0, 12)
              .map(c => (
                <Button
                  key={c.country_code || c.country_name}
                  mode={newCountry === c.country_name ? 'contained' : 'outlined'}
                  onPress={() => { setNewCountry(c.country_name); setShowCountryOptions(false); setShowCityOptions(true); }}
                  compact
                >
                  {c.country_name}
                </Button>
              ))}
          </View>
        ) : null}

        <Button
          mode="text"
          onPress={() => setShowCityOptions(v => !v)}
          disabled={!countryCode && !newCountry}
          style={{ alignSelf: 'flex-start', marginBottom: showCityOptions ? spacing.xs : spacing.sm }}
        >
          {showCityOptions ? 'Hide city suggestions' : 'Show city suggestions'}
        </Button>
        {showCityOptions && (countryCode || newCountry) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm }}>
            {cities
              .filter(ct => !newCity || (ct.city_name || '').toLowerCase().includes(newCity.toLowerCase()))
              .slice(0, 12)
              .map(ct => (
                <Button
                  key={ct.id}
                  mode={newCity === ct.city_name ? 'contained' : 'outlined'}
                  onPress={() => { setNewCity(ct.city_name); setShowCityOptions(false); }}
                  compact
                >
                  {ct.city_name}
                </Button>
              ))}
          </View>
        ) : null}

        <TextInput
          label="Detail location"
          mode="outlined"
          value={newDetail}
          onChangeText={setNewDetail}
          style={[styles.input, { marginBottom: spacing.xs }]}
          dense
        />
        
        {/* GPS Coordinates Indicator */}
        {newLatitude != null && newLongitude != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, paddingHorizontal: 4 }}>
            <Text style={{ color: '#4ade80', fontSize: 13 }}>
              📍 GPS: {newLatitude.toFixed(5)}, {newLongitude.toFixed(5)}
            </Text>
          </View>
        ) : (
          <View style={{ marginBottom: spacing.md, paddingHorizontal: 4 }}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
              💡 Use Shot Mode to capture GPS coordinates
            </Text>
          </View>
        )}

        <Button
          mode="contained"
          onPress={onSave}
          loading={saving}
          disabled={saving}
          style={styles.saveButton}
          buttonColor={theme.colors.primary}
        >
          Save Changes
        </Button>
      </View>

      <DraggableFab initialRight={16} initialBottom={380}>
        <FAB
          icon="camera-iris"
          onPress={() => setShowShotMode(true)}
          label="Shot Mode"
        />
      </DraggableFab>

      <ShotModeModal
        visible={showShotMode}
        onClose={() => setShowShotMode(false)}
        onUse={handleShotData}
        filmIso={filmIso}
        forcePsMode={!!fixedLensInfo}
        forcedMaxAperture={fixedLensInfo?.max_aperture || null}
        preloadedLocation={preloadedLocation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: { flex: 1, padding: spacing.md, borderRadius: radius.md, elevation: 2 },
  statLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 4 },
  statValue: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    elevation: 1
  },
  footer: {
    padding: spacing.lg,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    elevation: 8
  },
  inputRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  input: { backgroundColor: '#fff' },
  disabledInput: { backgroundColor: '#f0fdf4', opacity: 0.8 },
  addButton: { justifyContent: 'center', marginTop: 6 },
  saveButton: { marginTop: 0 },
  fixedLensIndicator: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  fixedLensText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
  },
  fixedLensSubtext: {
    color: '#15803d',
    fontSize: 12,
    marginTop: 2,
  },
});
