import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import {
  QUEUE_NAME,
  FIRST_PRIORITY,
  RETRY_COUNT_HEADER,
  assertQueueCompat,
} from './rabbitmq.config';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private client: any;
  public readonly queue = QUEUE_NAME;

  async onModuleInit() {
    this.connectWithRetry();
  }

  private async connectWithRetry() {
    const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
    for (;;) {
      try {
        this.client = await amqp.connect(rabbitMQUrl);
        this.logger.log('Connected to RabbitMQ');
        return;
      } catch (e) {
        this.client = null;
        this.logger.warn(`RabbitMQ not ready (${e.message}); retrying in 5s...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  onModuleDestroy() {
    if (this.client) this.client.close();
  }

  async publish(exchange: string, message: any) {
    if (!this.client) {
      this.logger.warn('RabbitMQ not connected, message not published');
      return;
    }
    try {
      const channel = await this.client.createChannel();
      await assertQueueCompat(channel, this.queue);
      channel.sendToQueue(this.queue, Buffer.from(JSON.stringify(message)), {
        persistent: true,
        priority: FIRST_PRIORITY,
        headers: { [RETRY_COUNT_HEADER]: 0 },
      });
      await channel.close();
    } catch (e: any) {
      this.logger.error(`Publish failed: ${e.message}`);
    }
  }
}
