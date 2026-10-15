import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
@Entity('pet_points_operations')
export class PetOperationEntity {
  @PrimaryColumn({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @PrimaryColumn({ name: 'operation_id', length: 64 }) operationId!: string;
  @Column({ name: 'payload_hash', length: 64 }) payloadHash!: string;
  @Column({ type: 'json' }) result!: unknown;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
