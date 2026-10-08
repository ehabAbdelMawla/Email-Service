import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import * as nodemailer from 'nodemailer';
import { EmailsService } from '../emails/emails.service';
import {
  QUEUE_NAME,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  FIRST_PRIORITY,
  RETRY_PRIORITY,
  RETRY_COUNT_HEADER,
  attemptsOf,
  assertQueueCompat,
} from './rabbitmq.config';

type Outcome = 'sent' | 'retry' | 'failed' | 'skip';

@Injectable()
export class RabbitMQConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQConsumer.name);
  private client: any;
  private channel: any;
  private readonly queue = QUEUE_NAME;
  private transporter: nodemailer.Transporter;

  constructor(private readonly emailsService: EmailsService) {}

  async onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mailhog',
      port: parseInt(process.env.SMTP_PORT || '1025', 10),
      secure: false,
      ignoreTLS: true,
    });

    try {
      await this.transporter.verify();
      this.logger.log(
        `SMTP ready on ${process.env.SMTP_HOST || 'mailhog'}:${process.env.SMTP_PORT || '1025'}`,
      );
    } catch (e) {
      this.logger.error(`SMTP verify failed: ${e.message}`);
    }

    this.logger.log(
      `Retry policy: maxRetries=${MAX_RETRIES}, delay=${RETRY_DELAY_MS}ms, ` +
        `firstPriority=${FIRST_PRIORITY}, retryPriority=${RETRY_PRIORITY}`,
    );
    this.connectWithRetry();
  }

  private async connectWithRetry() {
    const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
    for (;;) {
      try {
        this.client = await amqp.connect(rabbitMQUrl);
        this.channel = await this.client.createChannel();
        await assertQueueCompat(this.channel, this.queue);
        this.consume();
        this.logger.log(`Consuming queue "${this.queue}"`);
        return;
      } catch (e: any) {
        this.logger.warn(`RabbitMQ not ready (${e.message}); retrying in 5s...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  onModuleDestroy() {
    if (this.channel) this.channel.close();
    if (this.client) this.client.close();
    if (this.transporter) this.transporter.close();
  }

  private consume() {
    if (!this.channel) return;
    this.channel.consume(this.queue, (msg) => {
      if (msg === null) return;

      let message;
      try {
        message = JSON.parse(msg.content.toString());
      } catch (e) {
        this.logger.error('Unparseable message, discarding');
        this.channel.ack(msg);
        return;
      }

      const attempts = attemptsOf(msg);

      this.processMessage(message, attempts)
        .then((outcome) => {
          if (outcome === 'sent' || outcome === 'failed' || outcome === 'skip') {
            // terminal: ack removes it from the queue
            this.channel.ack(msg);
          } else {
            // retry: keep original in the queue until the retry copy is published
            this.scheduleRetry(msg, attempts);
          }
        })
        .catch((err) => {
          this.logger.error(`Processing error: ${err.message}`);
          if (attempts < MAX_RETRIES) {
            this.scheduleRetry(msg, attempts);
          } else {
            this.logger.error(`Giving up on message after ${attempts + 1} attempts`);
            this.channel.ack(msg);
          }
        });
    });
  }

  /**
   * Publishes a retry copy (delayed, lower priority) and only acks the
   * original once the copy is safely in the queue. If publishing fails the
   * original stays in the queue (nack with requeue).
   */
  private scheduleRetry(msg: any, attempts: number) {
    const publishRetry = () => {
      try {
        this.channel.sendToQueue(this.queue, msg.content, {
          persistent: true,
          priority: RETRY_PRIORITY,
          headers: {
            ...(msg.properties?.headers || {}),
            [RETRY_COUNT_HEADER]: attempts + 1,
          },
        });
        this.channel.ack(msg);
        this.logger.log(
          `Requeued message (attempt ${attempts + 1}/${MAX_RETRIES + 1}) ` +
            `with priority ${RETRY_PRIORITY} after ${RETRY_DELAY_MS}ms`,
        );
      } catch (e: any) {
        this.logger.error(`Requeue failed (${e.message}), keeping original in queue`);
        this.channel.nack(msg, false, true);
      }
    };

    if (RETRY_DELAY_MS > 0) {
      setTimeout(publishRetry, RETRY_DELAY_MS);
    } else {
      publishRetry();
    }
  }

  private async processMessage(
    message: { jobId: string; email: string; subject: string; html: string },
    attempts: number,
  ): Promise<Outcome> {
    const { jobId, email, subject, html } = message;

    const job = await this.emailsService.findOne(jobId);
    if (job.status === 'queued') {
      await this.emailsService.updateJob(jobId, { status: 'processing' });
    }

    const recipient = await this.emailsService.recipientRepo.findOne({ where: { jobId, email } });
    if (!recipient) return 'skip';

    try {
      await this.transporter.sendMail({
        from: '"Email Service" <noreply@example.com>',
        to: email,
        subject,
        html,
      });
      recipient.status = 'sent';
      recipient.sentAt = new Date();
      recipient.error = null;
      await this.emailsService.recipientRepo.save(recipient);
      this.logger.log(`Sent "${subject}" to ${email}`);
      await this.finalizeJobIfDone(jobId);
      return 'sent';
    } catch (e: any) {
      if (attempts < MAX_RETRIES) {
        // stays "pending" so the job is not finalized while retries remain
        recipient.status = 'pending';
        recipient.error = `attempt ${attempts + 1} failed: ${e.message}`;
        await this.emailsService.recipientRepo.save(recipient);
        this.logger.warn(
          `Send to ${email} failed (attempt ${attempts + 1}/${MAX_RETRIES + 1}), ` +
            `will retry in ${RETRY_DELAY_MS}ms: ${e.message}`,
        );
        return 'retry';
      }

      recipient.status = 'failed';
      recipient.error = e.message;
      await this.emailsService.recipientRepo.save(recipient);
      this.logger.error(`Send to ${email} failed permanently after ${attempts + 1} attempts: ${e.message}`);
      await this.finalizeJobIfDone(jobId);
      return 'failed';
    }
  }

  private async finalizeJobIfDone(jobId: string) {
    const recipients = await this.emailsService.recipientRepo.find({ where: { jobId } });
    const pending = recipients.filter((r) => r.status === 'pending' || r.status === 'processing');
    if (pending.length > 0) return;

    const sentCount = recipients.filter((r) => r.status === 'sent').length;
    const failedCount = recipients.filter((r) => r.status === 'failed').length;
    const status = failedCount === 0 ? 'completed' : sentCount === 0 ? 'failed' : 'completed_with_errors';

    await this.emailsService.updateJob(jobId, {
      status,
      sentCount,
      failedCount,
      completedAt: new Date(),
    });
    this.logger.log(`Job #${jobId} finished: ${status} (${sentCount} sent, ${failedCount} failed)`);
  }
}
