import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'admin_accounts' })
export class AdminAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  phoneNumber: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 1 })
  sessionsPerAdmin: number;

  @Column({ type: Date, nullable: true })
  warmUpStartedAt: Date | null;

  @Column({ default: false })
  skipWarmup: boolean;

  @Column({ default: 0 })
  warmUpDay: number;

  @Column({ default: 0 })
  totalSent: number;

  @Column({ default: 0 })
  totalFailed: number;

  @Column({ type: Date, nullable: true })
  lastSentAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  openwaSessionId: string | null;

  @Column({ default: false })
  isSuperAdmin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
