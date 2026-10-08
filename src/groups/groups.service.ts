import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsRelations } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupReceiver } from '../receivers/entities/receiver.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group) private groupRepo: Repository<Group>,
    @InjectRepository(GroupReceiver) private receiverRepo: Repository<GroupReceiver>,
  ) {}

  async create(name: string, description: string) {
    const group = this.groupRepo.create({ name, description });
    return this.groupRepo.save(group);
  }

  async findAll() {
    const groups = await this.groupRepo.find({
      relations: ['receivers'] as FindOptionsRelations<Group>,
    });
    return groups.map((g) => ({
      ...g,
      receiverCount: g.receivers.length,
    }));
  }

  async findOne(id: number) {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['receivers'] as FindOptionsRelations<Group>,
    });
    if (!group) {
      throw new NotFoundException(`Group #${id} not found`);
    }
    return {
      ...group,
      receiverCount: group.receivers.length,
    };
  }

  async update(id: number, name: string, description: string) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Group #${id} not found`);
    }
    group.name = name;
    group.description = description;
    return this.groupRepo.save(group);
  }

  async remove(id: number) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Group #${id} not found`);
    }
    await this.receiverRepo.delete({ group: { id: group.id } });
    return this.groupRepo.delete(id);
  }
}