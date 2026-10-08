import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GroupsController } from './groups/groups.controller';
import { ReceiversController } from './receivers/receivers.controller';
import { EmailsController } from './emails/emails.controller';
import { EmailsService } from './emails/emails.service';
import { RabbitMQService } from './rabbitmq/rabbitmq.service';
import { RabbitMQConsumer } from './rabbitmq/rabbitmq.consumer';
import { GroupsService } from './groups/groups.service';
import { ReceiversService } from './receivers/receivers.service';
import { Group } from './groups/entities/group.entity';
import { GroupReceiver } from './receivers/entities/receiver.entity';
import { EmailJob } from './emails/entities/email-job.entity';
import { EmailJobRecipient } from './emails/entities/email-job-recipient.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres' as const,
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT ?? '5432'),
      username: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: process.env.DATABASE_NAME || 'email_service',
      entities: [Group, GroupReceiver, EmailJob, EmailJobRecipient],
      synchronize: true,
      logging: false,
    }),
    TypeOrmModule.forFeature([Group, GroupReceiver, EmailJob, EmailJobRecipient]),
  ],
  controllers: [AppController, GroupsController, ReceiversController, EmailsController],
  providers: [AppService, GroupsService, ReceiversService, EmailsService, RabbitMQService, RabbitMQConsumer],
})
export class AppModule {}