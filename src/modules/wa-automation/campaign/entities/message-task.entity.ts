import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, Index,
} from 'typeorm';
import { BroadcastEvent } from './broadcast-event.entity';
import { WhatsAppGroup } from './whatsapp-group.entity';
import { AdminAccount } from './admin-account.entity';

export enum MessageTaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity({ name: 'message_tasks' })
export class MessageTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => BroadcastEvent)
  broadcast: BroadcastEvent;

  @Index()
  @ManyToOne(() => WhatsAppGroup)
  group: WhatsAppGroup;

  @ManyToOne(() => AdminAccount, { nullable: true })
  admin: AdminAccount | null;

  @Column({ type: 'varchar', length: 20, default: MessageTaskStatus.PENDING })
  status: MessageTaskStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  workerId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  waMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  errorCategory: string | null;

  @Column({ default: 0 })
  attemptCount: number;

  @Column({ type: 'int', default: 3 })
  maxAttempts: number;

  @Column({ type: 'datetime', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  nextRetryAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
