// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const defaultConfig = getDefaultConfig(__dirname);

// Configure react-native-svg-transformer
defaultConfig.transformer = {
  ...defaultConfig.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
defaultConfig.resolver = defaultConfig.resolver || {};
defaultConfig.resolver.assetExts = defaultConfig.resolver.assetExts.filter((ext) => ext !== 'svg');
defaultConfig.resolver.sourceExts = [...defaultConfig.resolver.sourceExts, 'svg'];

defaultConfig.resolver = defaultConfig.resolver || {};
defaultConfig.resolver.extraNodeModules = {
  'net': require.resolve('react-native-tcp-socket'),
  'tls': require.resolve('tls-browserify'),
  // ...defaultConfig.resolver.extraNodeModules, // This spread is not needed if extraNodeModules is assigned directly to defaultConfig.resolver.extraNodeModules
  'stream': require.resolve('readable-stream'),
  'http': require.resolve('stream-http'),
  'https': require.resolve('https-browserify'),
  'crypto': require.resolve('react-native-crypto'),
  'zlib': require.resolve('browserify-zlib'),
  'vm': require.resolve('vm-browserify'),
  'assert': require.resolve('assert/'),      // Using 'assert/' to ensure browser version
  'events': require.resolve('events/'),      // Using 'events/' to ensure browser version
  'url': require.resolve('url/')             // Using 'url/' to ensure browser version
};

module.exports = defaultConfig;
