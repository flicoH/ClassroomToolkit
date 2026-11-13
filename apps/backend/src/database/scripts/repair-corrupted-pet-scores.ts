import dataSource from '../data-source';
import { FixPetCorruptedScores20261104010000 } from '../migrations/20261104010000-fix-pet-corrupted-scores';

async function main() {
  console.log('[repair-pet-scores] 正在连接本地数据库...');
  await dataSource.initialize();
  console.log('[repair-pet-scores] 本地数据库已连接，开始执行受损数据修复...');

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    const migration = new FixPetCorruptedScores20261104010000();
    await migration.up(queryRunner);
    console.log(
      '[repair-pet-scores] 修复逻辑执行完毕！正在查询验证最新数据状态...',
    );

    const restoredRows: Array<{
      id: string;
      name: string;
      class_id: string;
      score: number;
      pet_experience: number;
      completed_pets: number;
      trophies: number;
      stage: string;
      pet_name: string | null;
    }> = await queryRunner.query(
      `SELECT id, name, class_id, score, pet_experience, completed_pets, trophies, stage, pet_name
       FROM pet_points_students
       WHERE name IN ('林郅宸', '庄坤翔', '王峻宇') OR completed_pets > 0 OR trophies > 0
       ORDER BY score DESC, completed_pets DESC
       LIMIT 20`,
    );

    console.log(
      `[repair-pet-scores] 核心受影响学生及满级学生当前状态（前 ${restoredRows.length} 条）：`,
    );
    console.table(restoredRows);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
  console.log('[repair-pet-scores] 修复脚本执行完成并安全退出。');
}

main().catch((err: unknown) => {
  console.error('[repair-pet-scores] 执行失败:', err);
  process.exit(1);
});
