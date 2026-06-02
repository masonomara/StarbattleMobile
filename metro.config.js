const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

// Include babel.config.js in the cache version so Metro re-transforms all
// files whenever the Babel config changes (the default getCacheKey() does not).
const babelConfigHash = crypto
  .createHash('md5')
  .update(fs.readFileSync(path.resolve(__dirname, 'babel.config.js')))
  .digest('hex');

const config = {
  cacheVersion: babelConfigHash,
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        inlineRequires: {
          blockList: {
            [require.resolve('@powersync/react-native')]: true,
            [require.resolve('@powersync/adapter-sql-js')]: true,
          },
        },
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
