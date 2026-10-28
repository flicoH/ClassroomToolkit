import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { DataSource } from 'typeorm';
import type { DynamicModule, ValueProvider } from '@nestjs/common';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppModule } from '../app.module';
import { ConnectionMetadataBuilder } from 'typeorm/connection/ConnectionMetadataBuilder';
import { migrationFiles } from './migration-files';

describe('migration discovery', () => {
  it('boots the AppModule migration metadata without executing migration tests', async () => {
    const [module] = Reflect.getMetadata(
      'imports',
      AppModule,
    ) as DynamicModule[];
    const core = module.imports![0] as DynamicModule;
    const provider = core.providers!.find(
      (item) =>
        typeof item === 'object' &&
        'provide' in item &&
        item.provide === 'TypeOrmModuleOptions',
    ) as ValueProvider<TypeOrmModuleOptions>;
    const options = provider.useValue;
    const migrations = options.migrations as string[];
    const loaded = await new ConnectionMetadataBuilder(
      new DataSource({ type: 'mysql' }),
    ).buildMigrations(migrations);
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.map((item) => item.constructor.name)).toContain(
      'AddPetStateHistory20261010000000',
    );
    expect(migrations.every((path) => /\d{14}-[^.]+\.ts$/.test(path))).toBe(
      true,
    );
  });
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'classroom-migrations-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('loads actual migrations without importing test suites or declarations', async () => {
    writeFileSync(
      join(directory, '20261010000000-example.js'),
      'module.exports = class Example20261010000000 { async up() {} async down() {} };',
    );
    for (const name of [
      'pet-state-history.spec.js',
      '20261010000000-example.spec.js',
      '20261010000000-example.test.js',
      'helper.js',
    ]) {
      writeFileSync(
        join(directory, name),
        'throw new Error("Test/helper module was imported as a migration");',
      );
    }
    writeFileSync(
      join(directory, '20261010000000-example.d.ts'),
      'declare const value: string;',
    );
    const paths = migrationFiles(directory, ['js']);
    const dataSource = new DataSource({ type: 'mysql', migrations: paths });
    // Exercise TypeORM's real class loader without opening a DB connection.
    const loaded = await new ConnectionMetadataBuilder(
      dataSource,
    ).buildMigrations(paths);
    expect(loaded.map((item) => item.constructor.name)).toEqual([
      'Example20261010000000',
    ]);
  });

  it('selects supported source/production extensions, orders files and refuses missing directories', () => {
    for (const name of [
      '20261010000000-later.ts',
      '20260927000000-earlier.ts',
      '20261010000000-later.js',
      '20261010000000-later.d.ts',
      'pet-state-history.spec.ts',
    ]) {
      writeFileSync(join(directory, name), '');
    }
    expect(
      migrationFiles(directory, ['ts']).map((path) => basename(path)),
    ).toEqual(['20260927000000-earlier.ts', '20261010000000-later.ts']);
    expect(
      migrationFiles(directory, ['js']).map((path) => basename(path)),
    ).toEqual(['20261010000000-later.js']);
    expect(() => migrationFiles(join(directory, 'missing'))).toThrow();
  });
});
