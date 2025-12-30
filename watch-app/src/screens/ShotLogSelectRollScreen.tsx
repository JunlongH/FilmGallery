import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { FilmItem } from '../types';

const ShotLogSelectRollScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [rolls, setRolls] = useState<FilmItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRolls();
  }, []);

  const loadRolls = async () => {
    try {
      setLoading(true);
      setError(null);
      // Only fetch 'loaded' items for shot logging
      const data = await api.getFilmItems('loaded');
      setRolls(data);
    } catch (err: any) {
      console.error('Failed to load rolls:', err);
      setError(err.message || 'Failed to load rolls');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRoll = (roll: FilmItem) => {
    navigation.navigate('ShotLogParams', { roll });
  };

  const renderItem = ({ item }: { item: FilmItem }) => (
    <TouchableOpacity
      style={styles.rollItem}
      onPress={() => handleSelectRoll(item)}
    >
      <Text style={styles.rollTitle}>{item.title}</Text>
      <Text style={styles.rollSubtitle}>
        {item.film_name || item.iso || 'Film'} • {item.loaded_camera || 'Camera'}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={loadRolls} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {rolls.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No active rolls found</Text>
        </View>
      ) : (
        <FlatList
          data={rolls}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  list: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  rollItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rollTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  rollSubtitle: {
    color: '#999',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 16,
  },
  errorText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
});

export default ShotLogSelectRollScreen;
