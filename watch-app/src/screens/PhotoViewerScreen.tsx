import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  GestureResponderEvent,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { api } from '../services/api';
import { Photo } from '../types';

const { width, height } = Dimensions.get('window');

const PhotoViewerScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const photo = route.params?.photo as Photo | undefined;

  if (!photo) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Photo not found</Text>
      </View>
    );
  }

  const imageUrl = api.getImageURL(photo.full_rel_path);

  const onGestureEvent = (event: any) => {
    const { state, translationY } = event.nativeEvent;
    
    if (state === State.END) {
      // Swipe down to close
      if (translationY > 50) {
        navigation.goBack();
      }
    }
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <PanGestureHandler onHandlerStateChange={onGestureEvent}>
        <View style={styles.content}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.errorText}>Failed to load image</Text>
          )}
          <TouchableOpacity style={styles.closeButton} onPress={handleBackPress}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.hint}>
            <Text style={styles.hintText}>↓ Close</Text>
          </View>
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  hint: {
    position: 'absolute',
    bottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hintText: {
    color: '#fff',
    fontSize: 12,
  },
});

export default PhotoViewerScreen;
