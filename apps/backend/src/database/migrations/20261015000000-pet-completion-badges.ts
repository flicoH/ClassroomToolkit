import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PetCompletionBadges20261015000000 implements MigrationInterface {
  name = 'PetCompletionBadges20261015000000';
  async up(runner: QueryRunner) {
    if (!(await runner.hasColumn('pet_points_settings', 'completion_badges'))) {
      await runner.query(
        'ALTER TABLE pet_points_settings ADD COLUMN completion_badges INT NOT NULL DEFAULT 1',
      );
    }
  }
  async down(runner: QueryRunner) {
    await runner.query(
      'ALTER TABLE pet_points_settings DROP COLUMN completion_badges',
    );
  }
}
