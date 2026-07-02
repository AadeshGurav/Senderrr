import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, Index,
} from 'typeorm';
import { ScrapedArticle } from '../../scraper/entities/scraped-article.entity';

export enum BroadcastStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

@Entity({ name: 'broadcast_events' })
export class BroadcastEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ScrapedArticle, { nullable: true })
  article: ScrapedArticle | null;

  @Column({ type: 'int', nullable: true })
  advertisementId: number | null;

  @Column({ type: 'text', nullable: true })
  messageText: string | null;

  @Column({ type: 'varchar', length: 20, default: BroadcastStatus.PENDING })
  status: BroadcastStatus;

  @Column({ default: 0 })
  totalMessages: number;

  @Column({ default: 0 })
  sentCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
