/**
 * EquipmentScreen - Mobile equipment management
 * Manage cameras, lenses, and flashes
 */
import React, { useState, useEffect, useCallback, useContext } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Image } from 'react-native';
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
  TextInput
} from 'react-native-paper';
import { getCameras, getLenses, getFlashes, createCamera, createLens, createFlash, deleteCamera, deleteLens, deleteFlash } from '../api/equipment';
import { getFilms } from '../api/filmItems';
import { spacing, radius } from '../theme';
import { ApiContext } from '../context/ApiContext';
import CachedImage from '../components/CachedImage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { buildUploadUrl } from '../utils/urlHelper';

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
    const text = `${item.brand || ''} ${item.model || ''} ${item.name || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const renderItem = ({ item }) => {
    // Display title: films use brand+name, equipment uses brand+model
    const displayTitle = tab === 'film' 
      ? `${item.brand || ''} ${item.name || ''}`.trim() 
      : `${item.brand || ''} ${item.model || ''}`.trim();
    
    // Build subtitle and tags
    let subtitle = '';
    let tags = [];
    
    if (tab === 'camera') {
      subtitle = item.camera_type || '';
      if (item.mount) tags.push(item.mount);
      if (item.has_fixed_lens) tags.push('Fixed Lens');
    } else if (tab === 'lens') {
      if (item.focal_length_min) {
        subtitle = item.focal_length_min === item.focal_length_max || !item.focal_length_max
          ? `${item.focal_length_min}mm`
          : `${item.focal_length_min}-${item.focal_length_max}mm`;
      }
      if (item.mount) tags.push(item.mount);
      if (item.max_aperture) tags.push(`f/${item.max_aperture}`);
    } else if (tab === 'flash') {
      if (item.guide_number) subtitle = `GN${item.guide_number}`;
      if (item.ttl_compatible) tags.push('TTL');
    } else if (tab === 'film') {
      subtitle = item.iso ? `ISO ${item.iso}` : '';
      if (item.format) tags.push(item.format);
      if (item.category) tags.push(item.category);
    }
    
    // Get thumbnail URL - use buildUploadUrl for proper path handling
    const thumbUrl = buildUploadUrl(item.image_path || item.thumbPath, baseUrl);
    
    // Debug: log first item to verify data
    if (filteredItems.indexOf(item) === 0) {
      console.log(`[${tab}] First item:`, {
        name: displayTitle,
        image_path: item.image_path,
        thumbPath: item.thumbPath,
        baseUrl,
        thumbUrl
      });
    }
    
    return (
      <TouchableOpacity
        style={styles.cardWrapper}
        onPress={() => navigation.navigate('EquipmentRolls', { 
          type: tab, 
          id: item.id, 
          name: displayTitle
        })}
        onLongPress={() => tab !== 'film' && setDeleteTarget(item)}
        activeOpacity={0.7}
      >
        <View style={styles.card}>
          {/* Thumbnail */}
          <View style={styles.thumbnail}>
            {thumbUrl ? (
              <CachedImage uri={thumbUrl} style={styles.thumbImage} contentFit="cover" />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <MaterialCommunityIcons 
                  name={tab === 'camera' ? 'camera' : tab === 'lens' ? 'camera-iris' : tab === 'flash' ? 'flash' : 'filmstrip'} 
                  size={32} 
                  color="#999" 
                />
              </View>
            )}
          </View>
          
          {/* Content */}
          <View style={styles.cardContent}>
            <Text variant="titleMedium" style={styles.cardTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
            {subtitle ? (
              <Text variant="bodySmall" style={styles.cardSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            {tags.length > 0 && (
              <View style={styles.tagRow}>
                {tags.map((tag, idx) => (
                  <View key={idx} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          
          {/* Arrow */}
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" style={styles.arrow} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Tabs */}
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
        density="small"
      />

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
                Tap + to add one
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => setShowAddDialog(true)}
      />

      {/* Add Dialog */}
      <Portal>
        <Dialog visible={showAddDialog} onDismiss={() => setShowAddDialog(false)}>
          <Dialog.Title>Add {tab === 'camera' ? 'Camera' : tab === 'lens' ? 'Lens' : tab === 'flash' ? 'Flash' : 'Film'}</Dialog.Title>
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
          <Dialog.Title>Delete {tab === 'camera' ? 'Camera' : tab === 'lens' ? 'Lens' : tab === 'flash' ? 'Flash' : 'Film'}?</Dialog.Title>
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
  tabs: {
    margin: spacing.md,
  },
  searchbar: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  list: {
    padding: spacing.md,
    paddingBottom: 80,
  },
  cardWrapper: {
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    flexShrink: 0,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  cardContent: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  arrow: {
    flexShrink: 0,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
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
