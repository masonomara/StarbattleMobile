import { PowerSyncDatabase } from '@powersync/react-native';
import { SQLJSOpenFactory } from '@powersync/adapter-sql-js';
import { AppSchema } from './AppSchema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: new SQLJSOpenFactory({ dbFilename: 'starbattle.db' }),
});
