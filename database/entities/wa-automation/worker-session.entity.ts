import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum WorkerStatus {
  STARTING = 'starting',
  ACTIVE = 'active',
  IDLE = 'idle',
  ERROR = 'error',
  OFFLINE = 'offline',
}

export enum BrowserStatus {
  CREATED = 'created',
  LAUNCHING = 'launching',
  LOGGED_IN = 'logged_in',
  QR_REQUIRED = 'qr_required',
  BANNED = 'banned',
  UNKNOWN = 'unknown',
}

@Entity({ name: 'worker_sessions' })
export class WorkerSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  adminId: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  workerId: string;

  @Column({ type: 'varchar', length: 20, default: WorkerStatus.OFFLINE })
  status: WorkerStatus;

  @Column({ type: 'varchar', length: 20, default: BrowserStatus.UNKNOWN })
  browserStatus: BrowserStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ type: 'int', default: 0 })
  totalSent: number;

  @Column({ type: 'int', default: 0 })
  totalFailed: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  currentGroupId: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  openwaSessionId: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  openwaSessionStatus: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
