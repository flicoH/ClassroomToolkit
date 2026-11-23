import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPetRubricDeletedAt20261123000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('pet_points_rubrics', 'deleted_at'))) {
      await queryRunner.query(
        "ALTER TABLE pet_points_rubrics ADD COLUMN deleted_at DATETIME(6) NULL COMMENT '删除时间'",
      );
    }
  }

  async down(): Promise<void> {
    // 回滚应用时保留删除标记，重新部署后仍能识别已删除的指标。
  }
}
