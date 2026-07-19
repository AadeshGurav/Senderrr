import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export enum SessionEventType {
  STARTED = 'started',
  LOGGED_IN = 'logged_in',
  QR_DETECTED = 'qr_detected',
  ERROR = 'error',
  BAN_DETECTED = 'ban_detected',
  HEARTBEAT = 'heartbeat',
  TASK_STARTED = 'task_started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SHUTDOWN = 'shutdown',
}

@Entity({ name: 'worker_session_logs' })
export class WorkerSessionLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  workerSessionId: number;

  @Column({ type: 'varchar', length: 50 })
  event: SessionEventType;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
