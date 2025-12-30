import React, { useContext, useEffect, useMemo, useState, useCallback, useLayoutEffect } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { Card, Title, Paragraph, FAB, ActivityIndicator, Text, Chip, useTheme, IconButton, Dialog, Portal, List, Button } from 'react-native-paper';
import TouchScale from '../components/TouchScale';
import { colors, spacing, radius } from '../theme';
import CachedImage from '../components/CachedImage';
import CoverOverlay from '../components/CoverOverlay';
import { ApiContext } from '../context/ApiContext';
import axios from 'axios';
import { format } from 'date-fns';
import { getRollCoverUrl } from '../utils/urls';
import { getFilmItems, getFilms } from '../api/filmItems';

export default function HomeScreen({ navigation }) {
  const theme = useTheme();
  const { baseUrl } = useContext(ApiContext);
  const [rolls, setRolls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null); // null = all years

  // Quick Meter (select from loaded film items)
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [loadedFilmItems, setLoadedFilmItems] = useState([]);
  const [films, setFilms] = useState([]);

  const fetchRolls = useCallback(async () => {
    if (!baseUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${baseUrl}/api/rolls`);
      setRolls(res.data);
    } catch (err) {
      setError('Failed to connect to server. Check Settings.');
      console.log(err);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchRolls();
  }, [fetchRolls]);

  const loadLoadedFilmItems = useCallback(async () => {
    if (!baseUrl) return;
    setQuickLoading(true);
    setQuickError('');
    try {
      const [itemsRes, filmsRes] = await Promise.all([
        getFilmItems({ status: 'loaded' }),
        getFilms(),
      ]);
      const items = itemsRes && Array.isArray(itemsRes.items) ? itemsRes.items : [];
      setLoadedFilmItems(items);
      setFilms(Array.isArray(filmsRes) ? filmsRes : []);
    } catch (e) {
      console.log('Failed to load loaded film items', e);
      setQuickError('Failed to load loaded film items');
      setLoadedFilmItems([]);
      setFilms([]);
    } finally {
      setQuickLoading(false);
    }
  }, [baseUrl]);

  const openQuickMeter = useCallback(async () => {
    setQuickOpen(true);
    await loadLoadedFilmItems();
  }, [loadLoadedFilmItems]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton icon="refresh" onPress={async () => { const { clearImageCache } = await import('../components/CachedImage'); await clearImageCache(); fetchRolls(); }} />
      ),
    });
  }, [navigation, fetchRolls]);

  // Derive year list from rolls
  const years = useMemo(() => {
    const set = new Set();
    rolls.forEach(r => {
      const dateStr = r.start_date || r.startDate || r.shot_date || r.created_at || r.createdAt || r.date || r.end_date || r.endDate;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) set.add(d.getFullYear());
    });
    return Array.from(set).sort((a,b)=> b - a); // desc
  }, [rolls]);

  // Filter rolls by selected year (null shows all)
  const filteredRolls = useMemo(() => {
    if (!selectedYear) return rolls;
    return rolls.filter(r => {
      const sStr = r.start_date || r.startDate || r.shot_date || r.created_at || r.createdAt || r.date;
      const eStr = r.end_date || r.endDate;
      const dates = [sStr, eStr].filter(Boolean);
      if (dates.length === 0) return false;
      return dates.some(ds => {
        const d = new Date(ds);
        return !isNaN(d.getTime()) && d.getFullYear() === selectedYear;
      });
    });
  }, [rolls, selectedYear]);

  const renderItem = ({ item }) => {
    const coverUrl = getRollCoverUrl(baseUrl, item);
    const filmLabel = item.film_name_joined || item.film_type || 'Unknown Film';
    const dateStr = item.start_date ? format(new Date(item.start_date), 'yyyy-MM-dd') : '';
    const dateRange = item.end_date ? `${dateStr} - ${format(new Date(item.end_date), 'yyyy-MM-dd')}` : dateStr;

    return (
      <TouchScale onPress={() => navigation.navigate('RollDetail', { rollId: item.id, rollName: item.title || `Roll #${item.id}` })}>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated">
          {coverUrl && (
            <View style={styles.coverWrapper}>
              <CachedImage uri={coverUrl} style={styles.cover} contentFit="cover" />
              <CoverOverlay title={item.title || `Roll #${item.id}`} leftText={filmLabel} rightText={dateRange} />
            </View>
          )}
          {!coverUrl && (
             <Card.Content>
                <Title>{item.title || `Roll #${item.id}`}</Title>
                <Paragraph>{filmLabel}</Paragraph>
                <Paragraph>{dateRange}</Paragraph>
             </Card.Content>
          )}
        </Card>
      </TouchScale>
    );
  };

  const filmById = useMemo(() => {
    const map = new Map();
    (films || []).forEach(f => {
      if (f && f.id != null) map.set(f.id, f);
    });
    return map;
  }, [films]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      
      {loading && rolls.length === 0 ? (
        <ActivityIndicator animating={true} size="large" style={styles.loader} color={theme.colors.primary} />
      ) : (
        <View>
          {/* Year filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearBar}>
            <Chip
              selected={!selectedYear}
              onPress={() => setSelectedYear(null)}
              style={styles.yearChip}
            >All</Chip>
            {years.map(y => (
              <Chip
                key={y}
                selected={selectedYear === y}
                onPress={() => setSelectedYear(y)}
                style={styles.yearChip}
              >{y}</Chip>
            ))}
          </ScrollView>

          <FlatList
            data={filteredRolls}
            renderItem={renderItem}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={fetchRolls} colors={[theme.colors.primary]} />
            }
          />
        </View>
      )}

      <FAB
        style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
        icon="cog"
        color={theme.colors.primary}
        onPress={() => navigation.navigate('Settings')}
      />

      <FAB
        style={[styles.quickFab, { backgroundColor: theme.colors.primary }]}
        icon="camera-iris"
        color={theme.colors.onPrimary}
        label="Quick Meter"
        onPress={openQuickMeter}
      />

      <Portal>
        <Dialog visible={quickOpen} onDismiss={() => setQuickOpen(false)}>
          <Dialog.Title>Select loaded film</Dialog.Title>
          <Dialog.Content>
            {quickError ? (
              <Text style={{ color: theme.colors.error, marginBottom: spacing.sm }}>{quickError}</Text>
            ) : null}
            {quickLoading ? (
              <ActivityIndicator animating size="small" />
            ) : loadedFilmItems.length === 0 ? (
              <Text style={{ color: theme.colors.onSurfaceVariant }}>No loaded film items.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {loadedFilmItems.map((it) => {
                  const film = filmById.get(it.film_id) || null;
                  const filmName = film?.name || it.film_name || it.film_type || `Film #${it.film_id || ''}`;
                  const secondary = [it.label, it.loaded_camera ? `Loaded on ${it.loaded_camera}` : null].filter(Boolean).join(' • ');
                  return (
                    <List.Item
                      key={String(it.id)}
                      title={filmName}
                      description={secondary}
                      left={(props) => <List.Icon {...props} icon="filmstrip" />}
                      onPress={() => {
                        setQuickOpen(false);
                        navigation.navigate('ShotLog', {
                          itemId: it.id,
                          filmName,
                          autoOpenShotMode: true,
                        });
                      }}
                    />
                  );
                })}
              </ScrollView>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setQuickOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  coverWrapper: {
    position: 'relative',
  },
  cover: {
    height: 200,
  },
  overlayFilmInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.40)',
    padding: spacing.sm,
  },
  overlayTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 2
  },
  overlayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overlayFilmText: {
    color: '#eee',
    fontSize: 12,
    fontWeight: '500'
  },
  overlayDateText: {
    color: '#eee',
    fontSize: 12,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  quickFab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 80,
  },
  loader: {
    marginTop: 50,
  },
  errorContainer: {
    padding: 10,
  },
  errorText: {
    textAlign: 'center',
  },
  yearBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  yearChip: {
    marginRight: spacing.sm,
  }
});
