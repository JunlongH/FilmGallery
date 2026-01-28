/**
 * LibraryScreen
 * 
 * Modern dashboard combining previous tabs into organized sections.
 * Part of the 3-tab main navigation.
 * 
 * Sections:
 * - Favorites (quick access)
 * - Collections (Themes/Tags)
 * - Equipment overview
 * - Inventory summary
 * - Statistics overview
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Dimensions,
} from 'react-native';
import { useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { Icon, Card, Badge } from '../components/ui';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export default function LibraryScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    favorites: 0,
    themes: 0,
    equipment: 0,
    inventory: 0,
    rolls: 0,
    photos: 0,
  });
  const [recentFavorites, setRecentFavorites] = useState([]);
  const [topThemes, setTopThemes] = useState([]);
  const [topEquipment, setTopEquipment] = useState([]);

  // Fetch library data
  const fetchData = useCallback(async () => {
    try {
      // Fetch multiple endpoints in parallel
      const [favoritesRes, themesRes, equipmentRes, statsRes] = await Promise.all([
        axios.get('/api/favorites').catch(() => ({ data: [] })),
        axios.get('/api/tags').catch(() => ({ data: [] })),
        axios.get('/api/equipment').catch(() => ({ data: [] })),
        axios.get('/api/stats/overview').catch(() => ({ data: {} })),
      ]);

      // Process favorites
      const favorites = Array.isArray(favoritesRes.data) ? favoritesRes.data : [];
      setRecentFavorites(favorites.slice(0, 4));

      // Process themes
      const themes = Array.isArray(themesRes.data) ? themesRes.data : [];
      setTopThemes(themes.slice(0, 6));

      // Process equipment
      const equipment = Array.isArray(equipmentRes.data) ? equipmentRes.data : [];
      setTopEquipment(equipment.slice(0, 4));

      // Process stats
      const statsData = statsRes.data || {};
      setStats({
        favorites: favorites.length,
        themes: themes.length,
        equipment: equipment.length,
        inventory: statsData.inventory_count || 0,
        rolls: statsData.total_rolls || 0,
        photos: statsData.total_photos || 0,
      });
    } catch (error) {
      console.log('Failed to fetch library data:', error.message);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.onSurface,
    },
    seeAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    seeAllText: {
      fontSize: 14,
      color: theme.colors.primary,
      marginRight: 4,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -6,
    },
    statCard: {
      width: (width - 44) / 3,
      margin: 6,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      alignItems: 'center',
    },
    statIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.primaryContainer,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    statValue: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
    quickAccessGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -8,
    },
    quickCard: {
      width: CARD_WIDTH,
      margin: 8,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
    },
    quickCardImage: {
      width: '100%',
      height: 100,
      backgroundColor: theme.colors.surfaceVariant,
    },
    quickCardContent: {
      padding: 12,
    },
    quickCardTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    quickCardSubtitle: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
    themesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -4,
    },
    themeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      margin: 4,
      borderWidth: 1,
      borderColor: theme.colors.outline + '30',
    },
    themeIcon: {
      marginRight: 6,
    },
    themeName: {
      fontSize: 14,
      color: theme.colors.onSurface,
    },
    themeCount: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginLeft: 6,
      backgroundColor: theme.colors.surfaceVariant,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    equipmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      padding: 12,
      borderRadius: 12,
      marginBottom: 8,
    },
    equipmentIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.secondaryContainer,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    equipmentInfo: {
      flex: 1,
    },
    equipmentName: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    equipmentMeta: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
    emptyState: {
      alignItems: 'center',
      padding: 24,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      marginTop: 8,
    },
  });

  // Render empty state for a section
  const renderEmpty = (text) => (
    <View style={styles.emptyState}>
      <Icon name="inbox" size={32} color={theme.colors.onSurfaceVariant} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Quick Stats */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Overview</Text>
          </View>
          <View style={styles.statsGrid}>
            <TouchableOpacity 
              style={styles.statCard}
              onPress={() => navigation.navigate('Stats')}
            >
              <View style={styles.statIconContainer}>
                <Icon name="film" size={22} color={theme.colors.primary} />
              </View>
              <Text style={styles.statValue}>{stats.rolls}</Text>
              <Text style={styles.statLabel}>Rolls</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.statCard}
              onPress={() => navigation.navigate('Stats')}
            >
              <View style={styles.statIconContainer}>
                <Icon name="image" size={22} color={theme.colors.primary} />
              </View>
              <Text style={styles.statValue}>{stats.photos}</Text>
              <Text style={styles.statLabel}>Photos</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.statCard}
              onPress={() => navigation.navigate('Favorites')}
            >
              <View style={[styles.statIconContainer, { backgroundColor: '#FFE4E4' }]}>
                <Icon name="heart" size={22} color="#E53935" />
              </View>
              <Text style={styles.statValue}>{stats.favorites}</Text>
              <Text style={styles.statLabel}>Favorites</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Favorites */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Favorites</Text>
            <TouchableOpacity 
              style={styles.seeAllButton}
              onPress={() => navigation.navigate('Favorites')}
            >
              <Text style={styles.seeAllText}>See All</Text>
              <Icon name="chevron-right" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
          
          {recentFavorites.length > 0 ? (
            <View style={styles.quickAccessGrid}>
              {recentFavorites.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.quickCard}
                  onPress={() => navigation.navigate('PhotoView', { photoId: photo.id })}
                >
                  <Image
                    source={{ uri: photo.thumbnail_url }}
                    style={styles.quickCardImage}
                  />
                  <View style={styles.quickCardContent}>
                    <Text style={styles.quickCardTitle} numberOfLines={1}>
                      {photo.filename || 'Photo'}
                    </Text>
                    <Text style={styles.quickCardSubtitle} numberOfLines={1}>
                      {photo.roll_name || 'Unknown Roll'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : renderEmpty('No favorites yet')}
        </View>

        {/* Collections/Themes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Collections</Text>
            <TouchableOpacity 
              style={styles.seeAllButton}
              onPress={() => navigation.navigate('Themes')}
            >
              <Text style={styles.seeAllText}>See All</Text>
              <Icon name="chevron-right" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
          
          {topThemes.length > 0 ? (
            <View style={styles.themesGrid}>
              {topThemes.map((tag) => (
                <TouchableOpacity
                  key={tag.id}
                  style={styles.themeChip}
                  onPress={() => navigation.navigate('TagDetail', { 
                    tagId: tag.id, 
                    tagName: tag.name 
                  })}
                >
                  <Icon 
                    name="tag" 
                    size={14} 
                    color={tag.color || theme.colors.primary} 
                    style={styles.themeIcon}
                  />
                  <Text style={styles.themeName}>{tag.name}</Text>
                  <Text style={styles.themeCount}>{tag.count || 0}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : renderEmpty('No collections yet')}
        </View>

        {/* Equipment */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Equipment</Text>
            <TouchableOpacity 
              style={styles.seeAllButton}
              onPress={() => navigation.navigate('Equipment')}
            >
              <Text style={styles.seeAllText}>See All</Text>
              <Icon name="chevron-right" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
          
          {topEquipment.length > 0 ? (
            <View>
              {topEquipment.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.equipmentRow}
                  onPress={() => navigation.navigate('EquipmentRolls', { 
                    id: item.id, 
                    name: item.name 
                  })}
                >
                  <View style={styles.equipmentIcon}>
                    <Icon 
                      name={item.type === 'camera' ? 'camera' : 'aperture'} 
                      size={20} 
                      color={theme.colors.secondary} 
                    />
                  </View>
                  <View style={styles.equipmentInfo}>
                    <Text style={styles.equipmentName}>{item.name}</Text>
                    <Text style={styles.equipmentMeta}>
                      {item.roll_count || 0} rolls • {item.type || 'Camera'}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
              ))}
            </View>
          ) : renderEmpty('No equipment yet')}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Access</Text>
          </View>
          
          <View style={styles.quickAccessGrid}>
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => navigation.navigate('Inventory')}
            >
              <View style={[styles.quickCardImage, { 
                justifyContent: 'center', 
                alignItems: 'center',
                backgroundColor: theme.colors.primaryContainer + '40',
              }]}>
                <Icon name="package" size={40} color={theme.colors.primary} />
              </View>
              <View style={styles.quickCardContent}>
                <Text style={styles.quickCardTitle}>Inventory</Text>
                <Text style={styles.quickCardSubtitle}>{stats.inventory} items</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => navigation.navigate('Stats')}
            >
              <View style={[styles.quickCardImage, { 
                justifyContent: 'center', 
                alignItems: 'center',
                backgroundColor: theme.colors.secondaryContainer + '40',
              }]}>
                <Icon name="bar-chart-2" size={40} color={theme.colors.secondary} />
              </View>
              <View style={styles.quickCardContent}>
                <Text style={styles.quickCardTitle}>Statistics</Text>
                <Text style={styles.quickCardSubtitle}>View insights</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
