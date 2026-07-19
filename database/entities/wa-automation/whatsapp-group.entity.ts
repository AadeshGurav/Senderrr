import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, Index,
} from 'typeorm';
import { WhatsAppCommunity } from '@database/entities/wa-automation/whatsapp-community.entity';

@Entity({ name: 'whatsapp_groups' })
export class WhatsAppGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  groupJid: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  openwaGroupId: string | null;

  @ManyToOne(() => WhatsAppCommunity, { nullable: true })
  community: WhatsAppCommunity | null;

  @Column({ default: false })
  isAnnouncementChannel: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isTargeted: boolean;

  @Column({ default: 0 })
  totalSent: number;

  @Column({ default: 0 })
  totalFailed: number;

  @Column({ default: 0 })
  consecutiveFailures: number;

  @Column({ default: true })
  isHealthy: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastSentAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastFailureAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
