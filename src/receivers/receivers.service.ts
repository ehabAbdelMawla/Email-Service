import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupReceiver } from './entities/receiver.entity';
import { Group } from '../groups/entities/group.entity';

@Injectable()
export class ReceiversService {
  constructor(
    @InjectRepository(GroupReceiver) private receiverRepo: Repository<GroupReceiver>,
    @InjectRepository(Group) private groupRepo: Repository<Group>,
  ) {}

  async findByGroup(groupId: number) {
    const receivers = await this.receiverRepo.find({
      where: { group: { id: groupId } },
    });
    return receivers;
  }

  async create(email: string, groupId: number) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException(`Group #${groupId} not found`);
    }

    const exists = await this.receiverRepo.findOne({
      where: { group: { id: groupId }, email },
    });
    if (exists) {
      throw new Error('Duplicate email in the same group');
    }

    const receiver = this.receiverRepo.create({ email, group });
    return this.receiverRepo.save(receiver);
  }

  async remove(id: number) {
    const receiver = await this.receiverRepo.findOne({ where: { id } });
    if (!receiver) {
      throw new NotFoundException(`Receiver #${id} not found`);
    }
    return this.receiverRepo.delete(id);
  }
}