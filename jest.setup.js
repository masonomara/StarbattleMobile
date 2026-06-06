/* eslint-env jest */
/* globals jest */

// PowerSync: stub the db singleton, context, and reactive hooks so the tree
// mounts without a native SQLite backend. (powersync.test.ts keeps its own local
// mock, which takes precedence there.)
jest.mock('@powersync/react-native', () => {
  const React = require('react');
  const status = { connected: false, hasSynced: false, dataFlowStatus: {} };
  const db = {
    currentStatus: status,
    registerListener: () => () => {},
    watch: () => {},
    getAll: async () => [],
    getOptional: async () => undefined,
    execute: async () => ({ rows: { _array: [] } }),
    connect: () => {},
  };
  return {
    PowerSyncDatabase: jest.fn(() => db),
    Schema: jest.fn(),
    Table: jest.fn(),
    column: { text: 'TEXT', integer: 'INTEGER', real: 'REAL' },
    PowerSyncContext: React.createContext(db),
    usePowerSync: () => db,
    useStatus: () => status,
    useQuery: () => ({
      data: [],
      isLoading: false,
      isFetching: false,
      error: undefined,
    }),
  };
});

// Native auth SDKs that call TurboModuleRegistry.getEnforcing at import time.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getCurrentUser: jest.fn(),
  },
  statusCodes: {},
}));
jest.mock('@invertase/react-native-apple-authentication', () => ({
  appleAuth: {
    isSupported: false,
    performRequest: jest.fn(),
    onCredentialRevoked: jest.fn(() => () => {}),
  },
  AppleButton: () => null,
}));

// Native modules that ship official jest mocks.
require('react-native-gesture-handler/jestSetup');
require('@shopify/react-native-skia/jestSetup');
// Self-contained reanimated stub. The official mock (react-native-reanimated/mock)
// transitively boots react-native-worklets' native module, which throws in jest;
// the app only uses the small surface below.
jest.mock('react-native-reanimated', () => {
  const View = ({ children }) => children ?? null;
  return {
    __esModule: true,
    default: {
      View,
      Image: View,
      ScrollView: View,
      Text: View,
      createAnimatedComponent: c => c,
    },
    useSharedValue: init => ({ value: init }),
    useAnimatedStyle: () => ({}),
    withSpring: v => v,
    withTiming: v => v,
    withRepeat: v => v,
    cancelAnimation: () => {},
    runOnJS: fn => fn,
    Easing: { ease: v => v, inOut: f => f },
  };
});

// safe-area-context: lightweight passthrough so the provider/insets resolve.
// @react-navigation/elements reads SafeAreaInsetsContext/SafeAreaFrameContext via
// useContext, so those must be real contexts.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const SafeAreaInsetsContext = React.createContext(inset);
  const SafeAreaFrameContext = React.createContext(frame);
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    SafeAreaView: ({ children }) => children,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets: inset, frame },
  };
});

// MMKV: in-memory stub (also handed to the Supabase client as auth storage).
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => {
    const store = new Map();
    return {
      set: (k, v) => store.set(k, v),
      getString: k => (store.has(k) ? String(store.get(k)) : undefined),
      getNumber: k => (store.has(k) ? Number(store.get(k)) : undefined),
      getBoolean: k => (store.has(k) ? Boolean(store.get(k)) : undefined),
      delete: k => store.delete(k),
      contains: k => store.has(k),
      getAllKeys: () => [...store.keys()],
      clearAll: () => store.clear(),
    };
  },
}));

// Adapty: every method is a no-op that resolves (App calls adapty.activate().catch).
jest.mock('react-native-adapty', () => ({
  adapty: new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) }),
}));

// Haptics: any method is a no-op.
jest.mock('react-native-nitro-haptics', () => ({
  Haptics: new Proxy({}, { get: () => jest.fn() }),
}));

// BootSplash: no-op the native splash; navigation hides it in onReady.
jest.mock('react-native-bootsplash', () => ({
  __esModule: true,
  default: {
    hide: jest.fn().mockResolvedValue(undefined),
  },
}));
