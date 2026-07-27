import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Advertisement } from '@database/entities/wa-automation/advertisement.entity';
import { MediaAttachment } from '@database/entities/wa-automation/media-attachment.entity';

@Entity({ name: 'ad_templates' })
export class AdTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Advertisement, (ad) => ad.templates, { onDelete: 'CASCADE' })
  advertisement: Advertisement;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ default: false })
  isActive: boolean;

  @Column({ type: 'int', nullable: true })
  mediaId: number | null;

  @ManyToOne(() => MediaAttachment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'mediaId' })
  media: MediaAttachment | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
