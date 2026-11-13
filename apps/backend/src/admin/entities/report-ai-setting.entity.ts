import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('admin_report_ai_settings')
export class ReportAiSettingEntity {
  @PrimaryColumn({ length: 32 }) id!: string;
  @Column({ name: 'base_url', length: 500 }) baseUrl!: string;
  @Column({ length: 100 }) model!: string;
  @Column({ name: 'api_key_ciphertext', type: 'text' })
  apiKeyCiphertext!: string;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
