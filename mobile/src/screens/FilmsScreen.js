import React, { useContext, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, Dimensions } from 'react-native';
import { ActivityIndicator, useTheme, IconButton, Text, Surface, Button } from 'react-native-paper';
import { ApiContext } from '../context/ApiContext';
import axios from 'axios';
import FilmCard from '../components/FilmCard';

const numColumns = 2;
const screenWidth = Dimensions.get('window').width;
const itemSize = Math.floor((screenWidth - 16*2 - 8) / numColumns); // padding 16, gap ~8

export default function FilmsScreen({ navigation }) {
  const theme = useTheme();
  const { baseUrl } = useContext(ApiContext);
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchFilms = async () => {
    if (!baseUrl) return;
    setLoading(true);
    try {
      const res = await axios.get(`${baseUrl}/api/films`);
      setFilms(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilms();
  }, [baseUrl]);

  // Add header refresh button
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton icon="refresh" onPress={async () => { const { clearImageCache } = await import('../components/CachedImage'); await clearImageCache(); fetchFilms(); }} />
      )
    });
  }, [navigation, baseUrl]);

  const renderItem = ({ item }) => {
    const coverUri = item.thumbPath ? `${baseUrl}${item.thumbPath}` : null;
    // Display brand + name for better identification
    const displayName = item.brand ? `${item.brand} ${item.name}` : item.name;
    const leftText = `ISO ${item.iso}`;
    const rightText = item.format || '135';
    return (
      <FilmCard
        coverUri={coverUri}
        title={displayName}
        leftText={leftText}
        rightText={rightText}
        style={styles.gridItem}
        onPress={() => navigation.navigate('FilmRolls', { filmId: item.id, filmName: displayName })}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Info banner */}
      <Surface style={styles.infoBanner} elevation={1}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          To add or edit film types, use Equipment → Films on desktop.
        </Text>
      </Surface>
      
      {loading ? (
        <ActivityIndicator animating={true} size="large" style={styles.loader} color="#5a4632" />
      ) : (
        <FlatList
          data={films}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
          numColumns={numColumns}
          columnWrapperStyle={styles.columnWrapper}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text variant="bodyLarge">No films defined yet</Text>
              <Text variant="bodySmall" style={{ marginTop: 8, opacity: 0.7 }}>
                Add film types in Equipment Library on desktop
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfdfd' },
  infoBanner: { 
    margin: 16, 
    marginBottom: 8, 
    padding: 12, 
    borderRadius: 8,
    backgroundColor: '#f5f0e6',
  },
  list: { padding: 16, paddingTop: 8 },
  columnWrapper: { justifyContent: 'space-between' },
  gridItem: { width: itemSize, marginBottom: 12 },
  loader: { marginTop: 50 },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
});
