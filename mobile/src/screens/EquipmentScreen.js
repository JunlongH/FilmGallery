/**
 * EquipmentScreen - Mobile equipment management
 * Manage cameras, lenses, flashes, and films
 */
import React, { useState, useEffect, useCallback, useContext } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { 
  Text, 
  FAB, 
  Searchbar, 
  SegmentedButtons, 
  ActivityIndicator,
  useTheme,
  Portal,
  Dialog,
  Button,
  TextInput,
  Surface
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCameras, getLenses, getFlashes, createCamera, createLens, createFlash, deleteCamera, deleteLens, deleteFlash } from '../api/equipment';
import { getFilms } from '../api/filmItems';
import { ApiContext } from '../context/ApiContext';
import CachedImage from '../components/CachedImage';
import { spacing, radius } from '../theme';

export default function EquipmentScreen({ navigation }) {
  const theme = useTheme();
  const { baseUrl } = useContext(ApiContext);
  const [tab, setTab] = useState('camera');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  
  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addBrand, setAddBrand] = useState('');
  const [addModel, setAddModel] = useState('');
  const [addMount, setAddMount] = useState('');
  const [addType, setAddType] = useState('SLR');

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    navigation.setOptions({ title: 'Equipment Library' });
  }, [navigation]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let data;
      if (tab === 'camera') {
        data = await getCameras();
      } else if (tab === 'lens') {
        data = await getLenses();
      } else if (tab === 'flash') {
        data = await getFlashes();
      } else if (tab === 'film') {
        data = await getFilms();
      }
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch equipment:', err);
      setItems([]);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchItems();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    if (!addBrand.trim() || !addModel.trim()) return;
    
    try {
      let newItem;
      if (tab === 'camera') {
        newItem = await createCamera({ 
          brand: addBrand.trim(), 
          model: addModel.trim(),
          camera_type: addType,
          mount: addMount.trim() || null
        });
      } else if (tab === 'lens') {
        newItem = await createLens({ 
          brand: addBrand.trim(), 
          model: addModel.trim(),
          mount: addMount.trim() || null
        });
      } else if (tab === 'flash') {
        newItem = await createFlash({ 
          brand: addBrand.trim(), 
          model: addModel.trim()
        });
      }
      
      if (newItem) {
        setItems(prev => [...prev, newItem]);
      }
    } catch (err) {
      console.error('Failed to create equipment:', err);
    }
    
    setShowAddDialog(false);
    setAddBrand('');
    setAddModel('');
    setAddMount('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      if (tab === 'camera') {
        await deleteCamera(deleteTarget.id);
      } else if (tab === 'lens') {
        await deleteLens(deleteTarget.id);
      } else if (tab === 'flash') {
        await deleteFlash(deleteTarget.id);
      }
      
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
    } catch (err) {
      console.error('Failed to delete equipment:', err);
    }
    
    setDeleteTarget(null);
  };

  // Filter items by search
  const filteredItems = items.filter(item => {
    if (tab === 'film') {
      const text = `${item.brand || ''} ${item.name || ''}`.toLowerCase();
      return text.includes(search.toLowerCase());
    }
    const text = `${item.brand || ''} ${item.model || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const getItemName = (item) => {
    if (tab === 'film') {
      return `${item.brand || ''} ${item.name || ''}`.trim();
    }
    return `${item.brand} ${item.model}`;
  };

  // Get thumbnail URL for equipment/film
  const getThumbnailUrl = (item) => {
    if (!baseUrl) return null;
    
    if (tab === 'film') {
      // Films use thumbnail_url or thumbPath
      if (item.thumbnail_url) {
        return item.thumbnail_url.startsWith('http') 
          ? item.thumbnail_url 
          : `${baseUrl}${item.thumbnail_url.startsWith('/') ? '' : '/'}${item.thumbnail_url}`;
      }
      if (item.thumbPath) {
        return `${baseUrl}${item.thumbPath.startsWith('/') ? '' : '/'}${item.thumbPath}`;
      }
      return null;
    }
    
    // Equipment uses image_path
    if (item.image_path) {
      return `${baseUrl}/uploads/${item.image_path}`;
    }
    return null;
  };

  // Get icon for placeholder
  const getPlaceholderIcon = () => {
    switch (tab) {
      case 'camera': return 'camera';
      case 'lens': return 'camera-iris';
      case 'flash': return 'flash';
      case 'film': return 'filmstrip';
      default: return 'image';
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'owned': return '#4caf50';
      case 'sold': return '#9e9e9e';
      case 'wishlist': return '#ff9800';
      case 'borrowed': return '#2196f3';
      default: return theme.colors.outline;
    }
  };

  const renderItem = ({ item }) => {
    const thumbnailUrl = getThumbnailUrl(item);
    const name = getItemName(item);
    
    // Build subtitle text
    let subtitle = '';
    if (tab === 'camera') {
      subtitle = [item.camera_type, item.mount].filter(Boolean).join(' • ') || 'Camera';
    } else if (tab === 'lens') {
      const focal = item.focal_length_min ? `${item.focal_length_min}${item.focal_length_max ? `-${item.focal_length_max}` : ''}mm` : null;
      const aperture = item.max_aperture ? `f/${item.max_aperture}` : null;
      subtitle = [focal, aperture, item.mount].filter(Boolean).join(' • ') || 'Lens';
    } else if (tab === 'flash') {
      const gn = item.guide_number ? `GN${item.guide_number}` : null;
      const ttl = item.ttl_compatible ? 'TTL' : null;
      subtitle = [gn, ttl].filter(Boolean).join(' • ') || 'Flash';
    } else if (tab === 'film') {
      const iso = item.iso ? `ISO ${item.iso}` : null;
      subtitle = [iso, item.format, item.category].filter(Boolean).join(' • ') || 'Film';
    }

    // Build tags array
    const tags = [];
    if (tab === 'camera' && item.has_fixed_lens === 1) {
      tags.push({ label: 'Fixed', icon: 'camera-iris' });
    }
    if (tab !== 'film' && item.condition) {
      tags.push({ label: item.condition });
    }
    
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('EquipmentRolls', { 
          type: tab, 
          id: item.id, 
          name 
        })}
        onLongPress={() => tab !== 'film' && setDeleteTarget(item)}
        style={styles.cardTouchable}
      >
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          {/* Thumbnail */}
          <View style={styles.thumbnailContainer}>
            {thumbnailUrl ? (
              <CachedImage 
                uri={thumbnailUrl} 
                style={styles.thumbnail}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.placeholderThumb, { backgroundColor: theme.colors.surfaceVariant }]}>
                <MaterialCommunityIcons 
                  name={getPlaceholderIcon()} 
                  size={32} 
                  color={theme.colors.onSurfaceVariant} 
                />
              </View>
            )}
            {/* Status indicator for equipment */}
            {tab !== 'film' && item.status && (
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            )}
          </View>
          
          {/* Content */}
          <View style={styles.cardContent}>
            <Text style={[styles.itemName, { color: theme.colors.onSurface }]} numberOfLines={1}>
              {name}
            </Text>
            
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
              {subtitle}
            </Text>
            
            {tags.length > 0 && (
              <View style={styles.tagsRow}>
                {tags.map((tag, idx) => (
                  <View key={idx} style={[styles.tag, { backgroundColor: theme.colors.secondaryContainer }]}>
                    {tag.icon && (
                      <MaterialCommunityIcons 
                        name={tag.icon} 
                        size={12} 
                        color={theme.colors.onSecondaryContainer}
                        style={{ marginRight: 4 }}
                      />
                    )}
                    <Text style={[styles.tagText, { color: theme.colors.onSecondaryContainer }]}>
                      {tag.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          
          {/* Arrow indicator */}
          <MaterialCommunityIcons 
            name="chevron-right" 
            size={24} 
            color={theme.colors.onSurfaceVariant}
          />
        </Surface>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Tabs - using ScrollView for horizontal scroll on small screens */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScrollView}>
        <SegmentedButtons
          value={tab}
          onValueChange={setTab}
          buttons={[
            { value: 'camera', label: 'Cameras', icon: 'camera' },
            { value: 'lens', label: 'Lenses', icon: 'camera-iris' },
            { value: 'flash', label: 'Flashes', icon: 'flash' },
            { value: 'film', label: 'Films', icon: 'filmstrip' },
          ]}
          style={styles.tabs}
        />
      </ScrollView>

      {/* Search */}
      <Searchbar
        placeholder="Search equipment..."
        value={search}
        onChangeText={setSearch}
        style={styles.searchbar}
      />

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text variant="bodyLarge">No {tab}s found</Text>
              <Text variant="bodyMedium" style={{ opacity: 0.6, marginTop: 4 }}>
                {tab === 'film' 
                  ? 'Add films from the desktop Equipment page'
                  : 'Tap + to add one'
                }
              </Text>
            </View>
          }
        />
      )}

      {/* FAB - not shown for films (managed on desktop) */}
      {tab !== 'film' && (
        <FAB
          icon="plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowAddDialog(true)}
        />
      )}

      {/* Add Dialog */}
      <Portal>
        <Dialog visible={showAddDialog} onDismiss={() => setShowAddDialog(false)}>
          <Dialog.Title>Add {tab === 'camera' ? 'Camera' : tab === 'lens' ? 'Lens' : 'Flash'}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Brand"
              mode="outlined"
              value={addBrand}
              onChangeText={setAddBrand}
              style={styles.dialogInput}
            />
            <TextInput
              label="Model"
              mode="outlined"
              value={addModel}
              onChangeText={setAddModel}
              style={styles.dialogInput}
            />
            {(tab === 'camera' || tab === 'lens') && (
              <TextInput
                label="Mount (e.g., Nikon F, Canon EF)"
                mode="outlined"
                value={addMount}
                onChangeText={setAddMount}
                style={styles.dialogInput}
              />
            )}
            {tab === 'camera' && (
              <SegmentedButtons
                value={addType}
                onValueChange={setAddType}
                buttons={[
                  { value: 'SLR', label: 'SLR' },
                  { value: 'Rangefinder', label: 'RF' },
                  { value: 'Point-and-Shoot', label: 'P&S' },
                ]}
                style={{ marginTop: spacing.sm }}
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onPress={handleAdd}>Add</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog visible={!!deleteTarget} onDismiss={() => setDeleteTarget(null)}>
          <Dialog.Title>Delete {tab === 'camera' ? 'Camera' : tab === 'lens' ? 'Lens' : 'Flash'}?</Dialog.Title>
          <Dialog.Content>
            <Text>
              Are you sure you want to delete {deleteTarget?.brand} {deleteTarget?.model}?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onPress={handleDelete} textColor={theme.colors.error}>Delete</Button>
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
  tabsScrollView: {
    flexGrow: 0,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  tabs: {
    marginRight: spacing.md,
  },
  searchbar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    elevation: 0,
    borderRadius: radius.lg,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
  },
  cardTouchable: {
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  thumbnailContainer: {
    position: 'relative',
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbnail: {
    width: 72,
    height: 72,
  },
  placeholderThumb: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  statusDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cardContent: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
  },
  dialogInput: {
    marginBottom: spacing.sm,
  },
});
