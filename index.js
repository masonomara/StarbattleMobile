/**
 * @format
 */

import { startupTimer } from './src/shared/lib/startupTimer';
import 'react-native-url-polyfill/auto';
import 'fast-text-encoding'; // TextDecoder/TextEncoder required by sql.js
import './src/shared/lib/i18n'; // initialize translations before the App tree renders
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

startupTimer.log('entry point loaded — polyfills + App module resolved');
AppRegistry.registerComponent(appName, () => App);
