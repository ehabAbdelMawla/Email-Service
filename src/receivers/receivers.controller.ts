import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ReceiversService } from './receivers.service';
import { CreateReceiverDto } from './dto/create-receiver.dto';

@Controller('groups')
export class ReceiversController {
  constructor(private readonly receiversService: ReceiversService) {}

  @Post(':groupId/receivers')
  add(@Param('groupId') groupId: number, @Body() dto: CreateReceiverDto) {
    return this.receiversService.create(dto.email, groupId);
  }

  @Get(':groupId/receivers')
  getByGroup(@Param('groupId') groupId: number) {
    return this.receiversService.findByGroup(groupId);
  }

  @Delete(':groupId/receivers/:receiverId')
  remove(@Param('groupId') groupId: number, @Param('receiverId') receiverId: number) {
    return this.receiversService.remove(receiverId);
  }
}