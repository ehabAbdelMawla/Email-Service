import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Group } from '../../groups/entities/group.entity';

@Entity()
export class GroupReceiver {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @ManyToOne(() => Group, (group) => group.receivers)
  group: Group;

  @CreateDateColumn()
  createdAt: Date;
}