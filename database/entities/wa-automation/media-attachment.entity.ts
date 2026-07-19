import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne,
} from 'typeorm';
import { Advertisement } from '@database/entities/wa-automation/advertisement.entity';

@Entity({ name: 'media_attachments' })
export class MediaAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Advertisement, { nullable: true })
  advertisement: Advertisement | null;

  @Column({ type: 'varchar', length: 255 })
  filePath: string;

  @Column({ type: 'varchar', length: 50 })
  mediaType: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  originalFilename: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
