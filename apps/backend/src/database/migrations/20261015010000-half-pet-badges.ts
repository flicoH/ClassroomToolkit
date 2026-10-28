import type { MigrationInterface, QueryRunner } from 'typeorm';

export class HalfPetBadges20261015010000 implements MigrationInterface {
  name = 'HalfPetBadges20261015010000';
  async up(runner: QueryRunner) {
    // Integer and half-unit values are exact in DOUBLE; existing balances are preserved.
    await runner.query(
      'ALTER TABLE pet_points_students MODIFY COLUMN trophies DOUBLE NOT NULL DEFAULT 0',
    );
    await runner.query(
      'ALTER TABLE pet_points_settings MODIFY COLUMN completion_badges DOUBLE NOT NULL DEFAULT 1',
    );
  }
  async down() {
    throw new Error('Cannot narrow badge columns without losing half badges');
  }
}
