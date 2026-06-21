import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne,
} from 'typeorm';
import { MessageTask } from './message-task.entity';
import { ErrorCategory } from './error-category.enum';

@Entity({ name: 'message_attempts' })
export class MessageAttempt {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MessageTask)
  messageTask: MessageTask;

  @Column({ type: 'int' })
  attemptNumber: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  errorCategory: ErrorCategory | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', nullable: true })
  responseTimeMs: number | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  screenshotPath: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
