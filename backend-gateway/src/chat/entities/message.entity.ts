import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  sessionId: string;

  @Column()
  role: string;

  @Column({ type: 'longtext' })
  content: string;

  @Column({ type: 'longtext', nullable: true })
  uiPayload?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}