import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPetFinalEnergy20260919000001 implements MigrationInterface {
  name = 'AddPetFinalEnergy20260919000001';

  async up(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasColumn('pet_points_settings', 'final_energy'))) {
      await queryRunner.query(
        'ALTER TABLE `pet_points_settings` ADD COLUMN `final_energy` INT NOT NULL DEFAULT 200',
      );
    }
  }

  async down(queryRunner: QueryRunner) {
    if (await queryRunner.hasColumn('pet_points_settings', 'final_energy')) {
      await queryRunner.query(
        'ALTER TABLE `pet_points_settings` DROP COLUMN `final_energy`',
      );
    }
  }
}
