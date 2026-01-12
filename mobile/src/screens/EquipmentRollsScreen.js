/**
 * EquipmentRollsScreen - Shows rolls that use a specific piece of equipment
 * Navigates to RollDetail when a roll is tapped
 */
import React, { useContext, useEffect, useState, useLayoutEffect } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Card, Title, Paragraph, ActivityIndicator, Text, useTheme, IconButton } from 'react-native-paper';
import CachedImage from '../components/CachedImage';
import CoverOverlay from '../components/CoverOverlay';
import { colors, spacing, radius } from '../theme';
import { ApiContext } from '../context/ApiContext';
import { getRollsByEquipment } from '../api/equipment';
import { format } from 'date-fns';

export default function EquipmentRollsScreen({ route, navigation }) {
  const theme = useTheme();
  const { type, id, name } = route.params; // type: 'camera'|'lens'|'flash'|'film'
  const { baseUrl } = useContext(ApiContext);
  const [rolls, setRolls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRolls = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getRollsByEquipment(type, id);
      setRolls(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load rolls.');
      console.error('Failed to fetch rolls by equipment:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRolls();
  }, [type, id]);

  useEffect(() => {
    navigation.setOptions({ title: name || 'Equipment Rolls' });
  }, [navigation, name]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton icon="refresh" onPress={fetchRolls} />
      )
    });
  }, [navigation]);

  const getTypeLabel = () => {
    switch (type) {
      case 'camera': return 'Camera';
      case 'lens': return 'Lens';
      case 'flash': return 'Flash';
      case 'film': return 'Film';
      default: return 'Equipment';
    }
  };

  const renderItem = ({ item }) => {
    let coverUrl = null;
    if (item.coverPath) {
      coverUrl = `${baseUrl}${item.coverPath}`;
    } else if (item.cover_photo) {
      coverUrl = `${baseUrl}/uploads/${item.cover_photo}`;
    }

    const dateRange = item.start_date 
      ? `${format(new Date(item.start_date), 'yyyy-MM-dd')}${item.end_date ? ` - ${format(new Date(item.end_date), 'yyyy-MM-dd')}` : ''}`
      : '';

    return (
      <Card 
        style={styles.card} 
        onPress={() => navigation.navigate('RollDetail', { 
          rollId: item.id, 
          rollName: item.title || `Roll #${item.id}` 
        })}
        mode="elevated"
      >
        {coverUrl ? (
          <View style={styles.coverWrapper}>
            <CachedImage uri={coverUrl} style={styles.cover} contentFit="cover" />
            <CoverOverlay 
              title={item.title || `Roll #${item.id}`}
              leftText={item.film_name_joined || item.film_type || 'Unknown Film'}
              rightText={dateRange}
            />
          </View>
        ) : (
          <Card.Content style={styles.cardContent}>
            <Title style={styles.cardTitle}>{item.title || `Roll #${item.id}`}</Title>
            <Paragraph style={styles.meta}>
              {item.film_name_joined || item.film_type || 'Unknown Film'}
            </Paragraph>
            {dateRange ? <Paragraph style={styles.dateText}>{dateRange}</Paragraph> : null}
          </Card.Content>
        )}
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header info */}
      <View style={[styles.headerInfo, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Text style={[styles.headerLabel, { color: theme.colors.onSurfaceVariant }]}>
          {getTypeLabel()}
        </Text>
        <Text style={[styles.headerName, { color: theme.colors.onSurface }]}>
          {name}
        </Text>
        <Text style={[styles.headerCount, { color: theme.colors.onSurfaceVariant }]}>
          {rolls.length} roll{rolls.length !== 1 ? 's' : ''} found
        </Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      
      {loading && rolls.length === 0 ? (
        <ActivityIndicator animating={true} size="large" style={styles.loader} color={theme.colors.primary} />
      ) : (
        <FlatList
          data={rolls}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchRolls} colors={[theme.colors.primary]} />
          }
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyContainer}>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  No rolls found using this {getTypeLabel().toLowerCase()}.
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerInfo: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  headerCount: {
    fontSize: 13,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  card: {
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  coverWrapper: { 
    position: 'relative' 
  },
  cover: {
    height: 160,
  },
  cardContent: {
    paddingTop: spacing.md,
  },
  cardTitle: {
    fontWeight: '600',
    fontSize: 18,
  },
  meta: {
    fontSize: 14,
    opacity: 0.7,
  },
  dateText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  loader: {
    marginTop: 50,
  },
  errorContainer: {
    padding: spacing.md,
  },
  errorText: {
    color: colors.error || '#f44336',
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
});
