import { AddAccountManagement20261012010000 } from './migrations/20261012010000-add-account-management';
describe('account management migration', () => {
  it('adds missing fields idempotently and never deletes existing data on up/down', async () => {
    const columns = new Set<string>(),
      indexes = new Set<string>();
    const runner = {
      hasColumn: jest.fn(async (table, column) =>
        columns.has(`${table}.${column}`),
      ),
      query: jest.fn(async (sql: string, params?: string[]) => {
        if (sql.includes('information_schema.STATISTICS'))
          return indexes.has(params![1]) ? [{}] : [];
        const add = sql.match(/ALTER TABLE `([^`]+)` ADD COLUMN `([^`]+)`/);
        if (add) columns.add(`${add[1]}.${add[2]}`);
        const index = sql.match(/CREATE INDEX `([^`]+)`/);
        if (index) indexes.add(index[1]);
        return [];
      }),
    };
    const migration = new AddAccountManagement20261012010000();
    await migration.up(runner as never);
    await migration.up(runner as never);
    await migration.down();
    const commands = runner.query.mock.calls.map(([sql]) => sql);
    expect(
      commands.filter((sql) => sql.startsWith('ALTER TABLE')),
    ).toHaveLength(9);
    expect(
      commands.filter((sql) => sql.startsWith('CREATE INDEX')),
    ).toHaveLength(3);
    expect(
      commands.some((sql) =>
        /DROP|TRUNCATE|DELETE FROM|UPDATE semester_reports/.test(sql),
      ),
    ).toBe(false);
    expect(
      commands.some((sql) => sql.includes('account_management_audit')),
    ).toBe(true);
  });
});
