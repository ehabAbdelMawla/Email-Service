import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class EmailJob {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  subject: string;

  @Column('text')
  html: string;

  @Column({
    type: 'enum',
    enum: ['queued', 'processing', 'completed', 'completed_with_errors', 'failed'],
    default: 'queued',
  })
  status: string;

  @Column({ default: 0 })
  totalRecipients: number;

  @Column({ default: 0 })
  sentCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  completedAt: Date;
}