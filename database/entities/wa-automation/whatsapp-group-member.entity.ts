import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn,
  ManyToOne, Unique, Index,
} from 'typeorm';
import { WhatsAppGroup } from '@database/entities/wa-automation/whatsapp-group.entity';
import { AdminAccount } from '@database/entities/wa-automation/admin-account.entity';

@Entity({ name: 'whatsapp_group_members' })
@Unique(['groupId', 'adminId'])
export class WhatsAppGroupMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  groupId: number;

  @Column({ type: 'int' })
  adminId: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sessionId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
