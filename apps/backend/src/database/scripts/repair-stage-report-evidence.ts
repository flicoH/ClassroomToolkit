import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import {
  createConnection,
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { positiveScoreItems } from '../../semester-reports/report-generation';

type Scope = { teacherId: string; reportId: string; studentId: string };
type Manifest = Scope & {
  sourceStudentIds: string[];
  scoreRecordIds?: string[];
  petHistoryId?: string;
};
type Report = RowDataPacket & {
  status: string;
  studentId: string;
  periodStart: Date;
  periodEnd: Date;
  snapshot: Record<string, unknown>;
  snapshotHash: string;
};
type Evaluation = RowDataPacket & {
  id: string;
  studentId: string;
  label: string;
  delta: number;
  createdAt: Date;
};
type Observation = RowDataPacket & {
  id: string;
  studentId: string;
  recordedAt: Date;
  pet: Record<string, unknown> | null;
};

function requiredId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,64}$/.test(value);
}

function idList(value: unknown, max: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every(requiredId) &&
    new Set(value).size === value.length
  );
}

function readManifest(path: string): Manifest {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  if (
    !manifest ||
    !requiredId(manifest.teacherId) ||
    !requiredId(manifest.reportId) ||
    !requiredId(manifest.studentId) ||
    !idList(manifest.sourceStudentIds, 20) ||
    !manifest.sourceStudentIds.length ||
    (manifest.scoreRecordIds !== undefined &&
      !idList(manifest.scoreRecordIds, 5000)) ||
    (manifest.petHistoryId !== undefined &&
      (typeof manifest.petHistoryId !== 'string' ||
        !/^[1-9][0-9]{0,19}$/.test(manifest.petHistoryId) ||
        BigInt(manifest.petHistoryId) > 18446744073709551615n))
  ) {
    throw new Error('清单中的报告、学生、来源或记录 ID 无效');
  }
  return manifest;
}

function placeholders(ids: string[]) {
  return ids.map(() => '?').join(', ');
}

function scoreSummary(records: Evaluation[]) {
  const positive = records.reduce(
    (sum, record) => sum + Math.max(record.delta, 0),
    0,
  );
  const negative = records.reduce(
    (sum, record) => sum + Math.min(record.delta, 0),
    0,
  );
  return {
    positiveItems: positiveScoreItems(records),
    positive,
    negative,
    net: positive + negative,
    count: records.length,
    records: records.slice(0, 80).map(({ id, label, delta, createdAt }) => ({
      id,
      label,
      delta,
      createdAt,
    })),
  };
}

function petCutoff(report: Report) {
  const saved = report.snapshot.petAsOf ?? report.snapshot.generatedAt;
  const time = typeof saved === 'string' ? Date.parse(saved) : NaN;
  const end = report.periodEnd.getTime() - 1;
  if (!Number.isFinite(time) && end >= Date.now())
    throw new Error('报告尚未到截止日期，且缺少原始宠物快照时间');
  return new Date(Number.isFinite(time) ? Math.min(time, end) : end);
}

async function readReport(connection: Connection, scope: Scope, lock: boolean) {
  const [[report]] = await connection.execute<Report[]>(
    `SELECT id, teacher_id AS teacherId, status, student_id AS studentId, period_start AS periodStart,
            period_end AS periodEnd, snapshot, SHA2(CAST(snapshot AS CHAR), 256) AS snapshotHash
       FROM semester_reports WHERE teacher_id = ? AND id = ?
       AND content IS NOT NULL ${lock ? 'FOR UPDATE' : ''}`,
    [scope.teacherId, scope.reportId],
  );
  if (
    !report ||
    report.id !== scope.reportId ||
    report.teacherId !== scope.teacherId ||
    report.studentId !== scope.studentId ||
    !['draft', 'published'].includes(report.status) ||
    report.snapshot?.reportVersion !== 'v2' ||
    report.snapshot.reportKind !== 'stage'
  ) {
    throw new Error(
      '报告不存在、归属不一致，或不是已有正文的 v2 阶段草稿/已发布报告',
    );
  }
  return report;
}

async function readEvidence(
  connection: Connection,
  manifest: Manifest,
  report: Report,
  lock: boolean,
) {
  const { teacherId, sourceStudentIds, scoreRecordIds, petHistoryId } =
    manifest;
  const inspect = scoreRecordIds === undefined && petHistoryId === undefined;
  const students = placeholders(sourceStudentIds);
  const [scores] =
    inspect || scoreRecordIds?.length
      ? await connection.execute<Evaluation[]>(
          `SELECT id, student_id AS studentId, label, delta_score AS delta, created_at AS createdAt
           FROM pet_points_evaluation_records
          WHERE teacher_id = ? AND student_id IN (${students})
            AND BINARY teacher_id = ? AND BINARY student_id IN (${students})
            AND created_at >= ? AND created_at < ?
            ${inspect ? '' : `AND id IN (${placeholders(scoreRecordIds!)})`}
          ORDER BY created_at, id ${inspect ? 'LIMIT 501' : ''} ${lock ? 'FOR SHARE' : ''}`,
          [
            teacherId,
            ...sourceStudentIds,
            teacherId,
            ...sourceStudentIds,
            report.periodStart,
            report.periodEnd,
            ...(scoreRecordIds ?? []),
          ],
        )
      : [[] as Evaluation[]];
  const [pets] =
    inspect || petHistoryId
      ? await connection.execute<Observation[]>(
          `SELECT CAST(id AS CHAR) AS id, student_id AS studentId, recorded_at AS recordedAt, pet
           FROM pet_points_state_history
          WHERE teacher_id = ? AND student_id IN (${students})
            AND BINARY teacher_id = ? AND BINARY student_id IN (${students}) AND recorded_at <= ?
          ${inspect ? '' : 'AND id = CAST(? AS UNSIGNED)'}
          ORDER BY recorded_at DESC, pet_points_state_history.id DESC
          ${inspect ? 'LIMIT 101' : ''} ${lock ? 'FOR SHARE' : ''}`,
          [
            teacherId,
            ...sourceStudentIds,
            teacherId,
            ...sourceStudentIds,
            petCutoff(report),
            ...(petHistoryId ? [petHistoryId] : []),
          ],
        )
      : [[] as Observation[]];
  const selectedScores = new Set(scoreRecordIds);
  if (
    scoreRecordIds &&
    (scores.length !== selectedScores.size ||
      scores.some(({ id }) => !selectedScores.has(id)))
  )
    throw new Error('部分评价记录不存在，或超出指定教师、来源学生或报告周期');
  const pet = pets[0]?.pet;
  if (
    petHistoryId &&
    (!pet ||
      typeof pet.stage !== 'string' ||
      !Number.isInteger(pet.level) ||
      typeof pet.petHatched !== 'boolean' ||
      (pet.petId !== null && typeof pet.petId !== 'string') ||
      (pet.petName !== null && typeof pet.petName !== 'string'))
  ) {
    throw new Error(
      '宠物历史不存在、形态无效，或超出指定教师、来源学生或截止时间',
    );
  }
  return { inspect, scores, pets, pet };
}

async function updateSnapshot(
  connection: Connection,
  scope: Scope,
  snapshot: Record<string, unknown>,
) {
  const [result] = await connection.execute<ResultSetHeader>(
    'UPDATE semester_reports SET snapshot = ? WHERE teacher_id = ? AND id = ?',
    [JSON.stringify(snapshot), scope.teacherId, scope.reportId],
  );
  if (result.affectedRows !== 1) throw new Error('更新范围与预期不符');
}

async function main() {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      manifest: { type: 'string' },
      apply: { type: 'string' },
      backup: { type: 'string' },
      restore: { type: 'string' },
    },
  });
  const { target, manifest: path, apply, backup, restore } = values;
  const {
    MYSQL_HOST: host,
    MYSQL_PORT: port = '3306',
    MYSQL_DATABASE: database,
    MYSQL_USER: user,
    MYSQL_PASSWORD: password,
  } = process.env;
  if (
    !host ||
    !database ||
    !user ||
    !target ||
    target !== `${host}:${port}/${database}` ||
    !path ||
    Boolean(apply) !== Boolean(backup) ||
    (restore && apply)
  ) {
    throw new Error(
      '须显式匹配 --target host:port/database 并提供 --manifest；执行使用 --apply 指纹 --backup 新文件，回滚使用 --restore 备份文件',
    );
  }
  const manifest = readManifest(path);
  const scope = {
    teacherId: manifest.teacherId,
    reportId: manifest.reportId,
    studentId: manifest.studentId,
  };
  const connection = await createConnection({
    host,
    port: Number(port),
    database,
    user,
    password,
    charset: 'utf8mb4',
  });
  try {
    const write = Boolean(apply || restore);
    await connection.query(
      write ? 'START TRANSACTION' : 'START TRANSACTION READ ONLY',
    );
    const [[server]] = await connection.query<
      (RowDataPacket & { serverId: string })[]
    >('SELECT @@server_uuid AS serverId');
    const report = await readReport(connection, scope, write);
    const identity = {
      target,
      serverId: server!.serverId,
      ...scope,
      status: report.status,
    };
    if (restore) {
      const saved = JSON.parse(readFileSync(restore, 'utf8')) as {
        identity: typeof identity;
        beforeHash: string;
        afterHash: string;
        snapshot: Record<string, unknown>;
      };
      const [[previous]] = await connection.execute<
        (RowDataPacket & { hash: string })[]
      >('SELECT SHA2(CAST(CAST(? AS JSON) AS CHAR), 256) AS hash', [
        JSON.stringify(saved.snapshot),
      ]);
      if (
        !isDeepStrictEqual(saved.identity, identity) ||
        previous?.hash !== saved.beforeHash
      )
        throw new Error('备份环境、报告状态或内容校验失败');
      if (report.snapshotHash === saved.beforeHash) {
        console.log('备份快照已恢复，影响 0 条');
        return;
      }
      if (report.snapshotHash !== saved.afterHash)
        throw new Error('当前快照已发生变化，停止回滚');
      await updateSnapshot(connection, scope, saved.snapshot);
      await connection.commit();
      console.log('已恢复 1 条报告快照');
      return;
    }

    const { inspect, scores, pets, pet } = await readEvidence(
      connection,
      manifest,
      report,
      write,
    );
    if (inspect) {
      if (write) throw new Error('请在清单中填写已经核对的证据 ID，再执行修复');
      console.log(
        JSON.stringify(
          {
            ...identity,
            periodStart: report.periodStart,
            periodEnd: report.periodEnd,
            scores: scores.slice(0, 500),
            pets: pets.slice(0, 100),
            scoresTruncated: scores.length > 500,
            petsTruncated: pets.length > 100,
          },
          null,
          2,
        ),
      );
      return;
    }
    const summary = manifest.scoreRecordIds ? scoreSummary(scores) : undefined;
    const snapshot = {
      ...report.snapshot,
      ...(summary
        ? { reportScoreSummary: summary, reportScoreSummaryRepaired: true }
        : {}),
      ...(pet
        ? {
            pet,
            petHistoryStatus: 'recorded',
            petAsOf: petCutoff(report).toISOString(),
          }
        : {}),
    };
    // Normalize with MySQL's JSON representation for idempotence and guarded rollback.
    const [[next]] = await connection.execute<
      (RowDataPacket & { hash: string })[]
    >('SELECT SHA2(CAST(CAST(? AS JSON) AS CHAR), 256) AS hash', [
      JSON.stringify(snapshot),
    ]);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          identity,
          before: report.snapshotHash,
          after: next!.hash,
          manifest,
        }),
      )
      .digest('hex');
    const affected = Number(report.snapshotHash !== next!.hash);
    if (!apply || !affected) {
      console.log(
        JSON.stringify(
          {
            ...identity,
            affected,
            fingerprint,
            scores: summary?.positiveItems,
            scoreCount: summary?.count,
            pet,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (apply !== fingerprint) throw new Error('预览指纹已变化，请重新预览');
    writeFileSync(
      backup!,
      JSON.stringify({
        identity,
        beforeHash: report.snapshotHash,
        afterHash: next!.hash,
        snapshot: report.snapshot,
      }),
      { flag: 'wx', mode: 0o600, flush: true },
    );
    await updateSnapshot(connection, scope, snapshot);
    await connection.commit();
    console.log('已修复 1 条报告快照，备份已写入指定文件');
  } finally {
    try {
      await connection.rollback();
    } finally {
      await connection.end();
    }
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : '执行失败');
    process.exitCode = 1;
  });
}
