import { SQLJSOpenFactory } from '@powersync/adapter-sql-js';

jest.mock('@powersync/react-native', () => ({
  PowerSyncDatabase: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    watch: jest.fn(),
    currentStatus: { connected: false },
  })),
  column: { text: 'TEXT', integer: 'INTEGER', real: 'REAL' },
  Table: jest.fn(),
  Schema: jest.fn(),
}));

describe('PowerSync sql-js adapter', () => {
  it('SQLJSOpenFactory instantiates without error', () => {
    const factory = new SQLJSOpenFactory({ dbFilename: 'test.db' });
    expect(factory).toBeDefined();
  });

  it('SQLJSOpenFactory has openDB method', () => {
    const factory = new SQLJSOpenFactory({ dbFilename: 'test.db' });
    expect(typeof factory.openDB).toBe('function');
  });

  it('db singleton constructs with sql-js factory', () => {
    const { PowerSyncDatabase } = require('@powersync/react-native');
    const { AppSchema } = require('../src/powersync/AppSchema');
    const factory = new SQLJSOpenFactory({ dbFilename: 'starbattle.db' });
    const db = new PowerSyncDatabase({ schema: AppSchema, database: factory });
    expect(db).toBeDefined();
  });
});
