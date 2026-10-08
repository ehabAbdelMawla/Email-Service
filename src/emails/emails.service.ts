import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Group } from '../groups/entities/group.entity';
import { GroupReceiver } from '../receivers/entities/receiver.entity';
import { EmailJob } from './entities/email-job.entity';
import { EmailJobRecipient } from './entities/email-job-recipient.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class EmailsService {
  constructor(
    @InjectRepository(EmailJob) private jobRepo: Repository<EmailJob>,
    @InjectRepository(EmailJobRecipient) public recipientRepo: Repository<EmailJobRecipient>,
    @InjectRepository(Group) private groupRepo: Repository<Group>,
    @InjectRepository(GroupReceiver) private receiverRepo: Repository<GroupReceiver>,
    private rabbitMQService: RabbitMQService,
  ) {}

  async send(dto: { subject: string; html: string; groupIds: number[] }) {
    // Validate groups exist
    const groups = await this.groupRepo.findByIds(dto.groupIds);
    if (groups.length !== dto.groupIds.length) {
      throw new NotFoundException('One or more groups not found');
    }

    // Collect all receivers and remove duplicates
    const receiverPromises = dto.groupIds.map(id => this.receiverRepo.find({ where: { group: { id } } }));
    const allReceivers = (await Promise.all(receiverPromises)).flat();
    const uniqueEmails = [...new Set(allReceivers.map(r => r.email))];

    // Create email job
    const job = this.jobRepo.create({
      subject: dto.subject,
      html: dto.html,
      status: 'queued',
      totalRecipients: uniqueEmails.length,
    });
    const savedJob = await this.jobRepo.save(job);

    // Create recipient records
    const recipients = uniqueEmails.map(email =>
      this.recipientRepo.create({ jobId: savedJob.id, email }),
    );
    await this.recipientRepo.save(recipients);

    // Publish to RabbitMQ
    for (const email of uniqueEmails) {
      const message = {
        jobId: savedJob.id,
        email,
        subject: dto.subject,
        html: dto.html,
      };
      this.rabbitMQService.publish('email.send', message);
    }

    // Return job ID immediately
    return {
      jobId: savedJob.id,
      status: 'queued',
      receiverCount: uniqueEmails.length,
    };
  }

  async updateJob(jobId: string, data: Partial<EmailJob>) {
    await this.jobRepo.update(jobId, data);
    return this.findOne(jobId);
  }

  async findOne(jobId: string) {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Email job #${jobId} not found`);
    }

    const recipients = await this.recipientRepo.find({ where: { jobId: job.id } });

    return {
      ...job,
      recipients: recipients.map(r => ({ id: r.id, email: r.email, status: r.status, error: r.error, sentAt: r.sentAt })),
      sentCount: recipients.filter(r => r.status === 'sent').length,
      failedCount: recipients.filter(r => r.status === 'failed').length,
    };
  }
}