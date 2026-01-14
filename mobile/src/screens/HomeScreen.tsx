/**
 * HomeScreen - Main roll gallery view
 * TypeScript migration example using apiService
 */

import React, { useContext, useEffect, useMemo, useState, useCallback, useLayoutEffect } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Card, Title, Paragraph, FAB, ActivityIndicator, Text, Chip, useTheme, IconButton } from 'react-native-paper';
import TouchScale from '../components/TouchScale';
import { colors, spacing, radius } from '../theme';
import CachedImage from '../components/CachedImage';
import CoverOverlay from '../components/CoverOverlay';
import { ApiContext } from '../context/ApiContext';
import { format } from 'date-fns';
import { getRollCoverUrl } from '../utils/urls';
import type { Roll } from '@filmgallery/types';
import * as api from '../services/apiService';

interface HomeScreenProps {
  navigation: any; // TODO: Type with RootStackParamList
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const theme = useTheme();
  const { baseUrl } = useContext(ApiContext);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const fetchRolls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRolls();
      setRolls(data);
    } catch (err) {
      setError('Failed to connect to server. Check Settings.');
      console.log(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRolls();
  }, [fetchRolls]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton 
          icon="refresh" 
          onPress={async () => { 
            const { clearImageCache } = await import('../components/CachedImage'); 
            await clearImageCache(); 
            fetchRolls(); 
          }} 
        />
      ),
    });
  }, [navigation, fetchRolls]);

  // Derive year list from rolls
  const years = useMemo(() => {
    const set = new Set<number>();
    rolls.forEach(r => {
      const dateStr = r.start_date || r.created_at;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) set.add(d.getFullYear());
    });
    return Array.from(set).sort((a, b) => b - a); // desc
  }, [rolls]);

  // Filter rolls by selected year
  const filteredRolls = useMemo(() => {
    if (!selectedYear) return rolls;
    return rolls.filter(r => {
      const dateStr = r.start_date || r.created_at;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d.getFullYear() === selectedYear;
    });
  }, [rolls, selectedYear]);

  const renderRoll = ({ item: roll }: { item: Roll }) => {
    const coverUrl = getRollCoverUrl(baseUrl, roll);
    const dateStr = roll.start_date || roll.created_at;
    const displayDate = dateStr ? format(new Date(dateStr), 'yyyy-MM-dd') : 'No date';

    return (
      <TouchScale
        style={styles.card}
        onPress={() => navigation.navigate('RollDetail', { rollId: roll.id })}
      >
        <View>
          <Card>
            <View style={styles.imageContainer}>
              <CachedImage 
                uri={coverUrl} 
                style={styles.image}
              />
              <CoverOverlay 
                title={roll.title || `Roll #${roll.id}`}
                leftText={displayDate}
                rightText={`${roll.photo_count || 0} photos`}
                style={{}}
              />
            </View>
            <Card.Content>
              <Title numberOfLines={1}>{roll.title || `Roll #${roll.id}`}</Title>
              <Paragraph numberOfLines={2}>
                {roll.film_type || 'Unknown film'} • {roll.camera || 'Unknown camera'}
              </Paragraph>
            </Card.Content>
          </Card>
        </View>
      </TouchScale>
    );
  };

  if (loading && rolls.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <FAB
          icon="refresh"
          onPress={fetchRolls}
          style={styles.fab}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Year filter chips */}
      {years.length > 0 && (
        <View style={styles.chipContainer}>
          <Chip
            selected={selectedYear === null}
            onPress={() => setSelectedYear(null)}
            style={styles.chip}
          >
            All ({rolls.length})
          </Chip>
          {years.map(year => (
            <Chip
              key={year}
              selected={selectedYear === year}
              onPress={() => setSelectedYear(year)}
              style={styles.chip}
            >
              {year} ({rolls.filter(r => {
                const d = new Date(r.start_date || r.created_at || '');
                return !isNaN(d.getTime()) && d.getFullYear() === year;
              }).length})
            </Chip>
          ))}
        </View>
      )}

      <FlatList
        data={filteredRolls}
        renderItem={renderRoll}
        keyExtractor={item => item.id.toString()}
        refreshControl={
          <RefreshControl 
            refreshing={loading} 
            onRefresh={fetchRolls}
            colors={[theme.colors.primary]}
          />
        }
        contentContainerStyle={styles.list}
      />

      <FAB
        icon="plus"
        onPress={() => navigation.navigate('CreateRoll')}
        style={styles.fab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  list: {
    padding: spacing.md,
  },
  card: {
    marginBottom: spacing.md,
  },
  imageContainer: {
    position: 'relative',
    height: 200,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
  },
});
