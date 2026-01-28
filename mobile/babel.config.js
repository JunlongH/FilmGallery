module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo',
      // NativeWind preset for Tailwind CSS support
      'nativewind/babel',
    ],
    // IMPORTANT: Reanimated plugin must be last
    plugins: [
      'react-native-paper/babel',
      'react-native-worklets-core/plugin',
      'react-native-reanimated/plugin',
    ],
  };
};
