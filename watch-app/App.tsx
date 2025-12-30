/**
 * Film Gallery Watch App
 * Android Wear OS Application
 *
 * @format
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar, StyleSheet } from 'react-native';
import { api } from './src/services/api';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import MainMenuScreen from './src/screens/MainMenuScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ShotLogSelectRollScreen from './src/screens/ShotLogSelectRollScreen';
import ShotLogParamsScreen from './src/screens/ShotLogParamsScreen';
import ShotLogLocationScreen from './src/screens/ShotLogLocationScreen';
import MyRollsScreen from './src/screens/MyRollsScreen';
import RollDetailScreen from './src/screens/RollDetailScreen';
import PhotoViewerScreen from './src/screens/PhotoViewerScreen';

const Stack = createNativeStackNavigator();

function App() {
  useEffect(() => {
    // Load server URL on app start
    api.loadServerURL();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#000',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            contentStyle: {
              backgroundColor: '#000',
            },
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            fullScreenGestureEnabled: true,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="MainMenu"
            component={MainMenuScreen}
            options={{ title: 'Menu' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
          <Stack.Screen
            name="ShotLogSelectRoll"
            component={ShotLogSelectRollScreen}
            options={{ title: 'Shot Log' }}
          />
          <Stack.Screen
            name="ShotLogParams"
            component={ShotLogParamsScreen}
            options={{ title: 'Shot Parameters' }}
          />
          <Stack.Screen
            name="ShotLogLocation"
            component={ShotLogLocationScreen}
            options={{ title: 'Location' }}
          />
          <Stack.Screen
            name="MyRolls"
            component={MyRollsScreen}
            options={{ title: 'My Rolls' }}
          />
          <Stack.Screen
            name="RollDetail"
            component={RollDetailScreen}
            options={{ title: 'Roll Detail' }}
          />
          <Stack.Screen
            name="PhotoViewer"
            component={PhotoViewerScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
