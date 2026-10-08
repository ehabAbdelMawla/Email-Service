export class CreateGroupDto {
  name: string;
  description: string;
}

export class UpdateGroupDto {
  name: string;
  description: string;
}

export class GroupResponseDto {
  id: number;
  name: string;
  description: string;
  receiverCount: number;

  constructor(partial: Partial<GroupResponseDto>) {
    Object.assign(this, partial);
  }
}