import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { EmailsService } from './emails.service';
import { SendEmailDto } from './dto/send-email.dto';

@Controller('emails')
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post('send')
  send(@Body() dto: SendEmailDto) {
    return this.emailsService.send(dto);
  }

  @Get(':jobId')
  findOne(@Param('jobId') jobId: string) {
    return this.emailsService.findOne(jobId);
  }
}