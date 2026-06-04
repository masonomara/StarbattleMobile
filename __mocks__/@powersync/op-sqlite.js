// Jest stub for the native op-sqlite open factory. The real package
// (@op-engineering/op-sqlite) loads a native base module that doesn't exist in
// the Node test environment ("Base module not found"). Tests that import
// AppSchema only need OPSqliteOpenFactory to be constructable, not functional.
class OPSqliteOpenFactory {
  constructor(options) {
    this.options = options;
  }
}

module.exports = { OPSqliteOpenFactory };
