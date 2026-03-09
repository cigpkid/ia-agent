import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sessionId: string;

  @Column()
  userId: string;

  @Column()
  role: string; // 'user', 'assistant', 'system'

  @Column('text')
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}
