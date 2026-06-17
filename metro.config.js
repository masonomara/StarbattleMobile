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
  resolver: {
    // lucide-react-native ships one module per icon under dist/{cjs,esm}/icons/*,
    // but its package.json `exports` only maps "." and "./icons" — both the full
    // ~1500-icon barrel. We import single icons by deep path to keep the bundle
    // small (Metro doesn't tree-shake the barrel away), which trips Metro's
    // package-exports check and logs a noisy fallback warning for every icon on
    // every bundle. Resolve just those specifiers with package-exports turned off
    // so they go straight to the file — small bundle, no warning — while exports
    // stays on for every other package.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.startsWith('lucide-react-native/dist/')) {
        return context.resolveRequest(
          { ...context, unstable_enablePackageExports: false },
          moduleName,
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
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
