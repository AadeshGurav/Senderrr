import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
  ManyToMany, JoinTable, OneToMany,
} from 'typeorm';
import { WhatsAppGroup } from '@database/entities/wa-automation/whatsapp-group.entity';
import { WhatsAppCommunity } from '@database/entities/wa-automation/whatsapp-community.entity';
import { MediaAttachment } from '@database/entities/wa-automation/media-attachment.entity';

export enum AdvertisementTargetType {
  ALL_GROUPS = 'all_groups',
  ALL_COMMUNITIES = 'all_communities',
  SPECIFIC = 'specific',
}

export enum AdvertisementStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity({ name: 'advertisements' })
export class Advertisement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 30, default: AdvertisementTargetType.ALL_GROUPS })
  targetType: AdvertisementTargetType;

  @ManyToMany(() => WhatsAppGroup)
  @JoinTable({ name: 'advertisement_groups' })
  targetGroups: WhatsAppGroup[];

  @ManyToMany(() => WhatsAppCommunity)
  @JoinTable({ name: 'advertisement_communities' })
  targetCommunities: WhatsAppCommunity[];

  @OneToMany(() => MediaAttachment, (media) => media.advertisement, { cascade: true })
  mediaAttachments: MediaAttachment[];

  @Column({ type: 'varchar', length: 20, default: AdvertisementStatus.DRAFT })
  status: AdvertisementStatus;

  @Column({ type: 'int', default: 1 })
  packageDays: number;

  @Column({ type: 'int', default: 0 })
  daysUsed: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  preferredTime: string | null;

  @Column({ type: 'datetime', nullable: true })
  nextScheduledAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastDispatchedAt: Date | null;

  @Column({ default: 0 })
  totalSent: number;

  @Column({ default: 0 })
  totalFailed: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get isSendable(): boolean {
    return this.status === AdvertisementStatus.DRAFT ||
      (this.status === AdvertisementStatus.ACTIVE && this.daysUsed < this.packageDays);
  }
}
