/**
 * EquipmentScreen - Mobile equipment management
 * Manage cameras, lenses, and flashes
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { 
  Text, 
  FAB, 
  Card, 
  Chip, 
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
import { spacing, radius } from '../theme';

export default function EquipmentScreen({ navigation }) {
  const theme = useTheme();
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
    const text = `${item.brand || ''} ${item.model || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const renderItem = ({ item }) => (
    <Card 
      style={styles.card} 
      mode="outlined"
      onLongPress={() => setDeleteTarget(item)}
    >
      <Card.Content>
        <Text variant="titleMedium">{item.brand} {item.model}</Text>
        <View style={styles.chipRow}>
          {tab === 'camera' && (
            <>
              {item.camera_type && <Chip compact style={styles.chip}>{item.camera_type}</Chip>}
              {item.mount && <Chip compact style={styles.chip}>{item.mount}</Chip>}
              {item.has_fixed_lens && <Chip compact style={styles.chip} icon="camera-iris">Fixed Lens</Chip>}
            </>
          )}
          {tab === 'lens' && (
            <>
              {item.mount && <Chip compact style={styles.chip}>{item.mount}</Chip>}
              {item.focal_length_min && (
                <Chip compact style={styles.chip}>
                  {item.focal_length_min}{item.focal_length_max ? `-${item.focal_length_max}` : ''}mm
                </Chip>
              )}
              {item.max_aperture && <Chip compact style={styles.chip}>f/{item.max_aperture}</Chip>}
            </>
          )}
          {tab === 'flash' && (
            <>
              {item.guide_number && <Chip compact style={styles.chip}>GN{item.guide_number}</Chip>}
              {item.ttl_compatible && <Chip compact style={styles.chip} icon="flash">TTL</Chip>}
            </>
          )}
        </View>
      </Card.Content>
    </Card>
  );

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
        ]}
        style={styles.tabs}
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
  card: {
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.xs,
  },
  chip: {
    height: 24,
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
