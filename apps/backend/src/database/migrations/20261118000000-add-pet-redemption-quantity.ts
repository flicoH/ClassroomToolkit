import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPetRedemptionQuantity20261118000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('pet_points_redemptions', 'quantity'))) {
      await queryRunner.query(
        'ALTER TABLE pet_points_redemptions ADD COLUMN quantity INT NULL',
      );
    }
  }

  async down(): Promise<void> {
    // Keep quantities recorded by the newer release during rollback.
  }
}
