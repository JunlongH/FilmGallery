import React, { useContext, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Dimensions, ListRenderItem } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiContext } from '../context/ApiContext';
import axios from 'axios';
import CachedImage from '../components/CachedImage';
import { RootStackParamList, Photo } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'TagDetail'>;

const numColumns = 3;
const screenWidth = Dimensions.get('window').width;
const tileSize = screenWidth / numColumns;

const TagDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { tagId } = route.params;
  const { baseUrl } = useContext(ApiContext);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchPhotos = async () => {
    if (!baseUrl) return;
    setLoading(true);
    try {
      const res = await axios.get(`${baseUrl}/api/tags/${tagId}/photos`);
      setPhotos(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [baseUrl, tagId]);

  const renderItem: ListRenderItem<Photo> = ({ item, index }) => {
    let thumbUrl: string;
    if (item.thumb_rel_path) {
      thumbUrl = `${baseUrl}/uploads/${item.thumb_rel_path}`;
    } else {
      thumbUrl = `${baseUrl}/uploads/rolls/${item.roll_id}/thumb/${item.filename}`;
    }
    
    return (
      <TouchableOpacity 
        onPress={() => navigation.navigate('PhotoView', { photo: item, rollId: item.roll_id, photos, initialIndex: index, viewMode: 'positive' })}
      >
        <CachedImage
          uri={thumbUrl}
          style={{ width: tileSize, height: tileSize, margin: 1 }}
          contentFit="cover"
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator animating={true} size="large" style={styles.loader} color="#5a4632" />
      ) : (
        <FlatList
          data={photos}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          numColumns={numColumns}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfdfd' },
  loader: { marginTop: 50 },
  listContent: { paddingBottom: 20 },
});

export default TagDetailScreen;
