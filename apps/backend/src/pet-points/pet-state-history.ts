import { LessThanOrEqual, type EntityManager, type Repository } from 'typeorm';
import {
  PetStateHistoryEntity,
  type PetAppearance,
} from './entities/pet-state-history.entity';
import type { PetStudentEntity } from './entities/pet-student.entity';

export function petAppearance(student: PetStudentEntity): PetAppearance {
  return {
    petId: student.petId ?? null,
    petName: student.petName ?? null,
    stage: student.stage,
    level: student.level,
    petHatched: Boolean(student.petHatched),
  };
}

/** The report end is exclusive; an unfinished current day is frozen at generation time. */
export async function petAppearanceAtReportEnd(
  history: Repository<PetStateHistoryEntity>,
  teacherId: string,
  studentId: string,
  end: Date,
) {
  const asOf = new Date(Math.min(end.getTime() - 1, Date.now()));
  const observation = await history.findOne({
    where: { teacherId, studentId, recordedAt: LessThanOrEqual(asOf) },
    order: { recordedAt: 'DESC', id: 'DESC' },
  });
  return {
    pet: observation?.pet ?? null,
    petAsOf: asOf.toISOString(),
    petHistoryStatus: observation?.pet
      ? ('recorded' as const)
      : ('unavailable' as const),
  };
}

/** Caller holds the student lock so state and its observation commit together. */
export async function recordPetAppearance(
  manager: EntityManager,
  student: Pick<PetStudentEntity, 'teacherId' | 'id'>,
  pet: PetAppearance | null,
) {
  const history = manager.getRepository(PetStateHistoryEntity);
  const previous = await history.findOne({
    where: { teacherId: student.teacherId, studentId: student.id },
    order: { recordedAt: 'DESC', id: 'DESC' },
    // A roster scan may have opened an older REPEATABLE READ snapshot before the student lock.
    lock: { mode: 'pessimistic_write' },
  });
  // Compare the persisted fields, independent of JSON key order or object prototypes.
  if (
    previous &&
    ((previous.pet === null && pet === null) ||
      (previous.pet !== null &&
        pet !== null &&
        previous.pet.petId === pet.petId &&
        previous.pet.petName === pet.petName &&
        previous.pet.stage === pet.stage &&
        previous.pet.level === pet.level &&
        previous.pet.petHatched === pet.petHatched))
  )
    return;
  await history.save(
    history.create({
      teacherId: student.teacherId,
      studentId: student.id,
      recordedAt: new Date(),
      pet,
    }),
  );
}
