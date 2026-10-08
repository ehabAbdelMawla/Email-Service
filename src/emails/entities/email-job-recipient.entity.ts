import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class EmailJobRecipient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  jobId: string;

  @Column()
  email: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
  })
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ nullable: true })
  sentAt: Date;
}