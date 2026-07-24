import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageTask, MessageTaskStatus } from '@database/entities/wa-automation/message-task.entity';
import { MessageAttempt } from '@database/entities/wa-automation/message-attempt.entity';
import { ErrorCategory } from '@database/entities/wa-automation/error-category.enum';

@Injectable()
export class AttemptTrackerService {
  private readonly logger = new Logger('AttemptTrackerService');

  constructor(
    @InjectRepository(MessageTask, 'data')
    private readonly taskRepo: Repository<MessageTask>,
    @InjectRepository(MessageAttempt, 'data')
    private readonly attemptRepo: Repository<MessageAttempt>,
  ) {}

  async recordStart(taskId: number): Promise<MessageAttempt> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = MessageTaskStatus.IN_PROGRESS;
    task.attemptCount++;
    task.lastAttemptAt = new Date();
    await this.taskRepo.save(task);

    const attempt = this.attemptRepo.create({
      messageTask: { id: taskId },
      attemptNumber: task.attemptCount,
      status: 'in_progress',
    });
    return this.attemptRepo.save(attempt);
  }

  async recordSuccess(attemptId: number, _messageId?: string, responseTimeMs: number = 0): Promise<void> {
    const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
    if (!attempt) return;

    attempt.status = 'sent';
    attempt.responseTimeMs = responseTimeMs || null;
    await this.attemptRepo.save(attempt);

    // Update task
    const task = await this.taskRepo.findOne({ where: { id: attempt.messageTask?.id } });
    if (task) {
      task.status = MessageTaskStatus.SENT;
      await this.taskRepo.save(task);
    }
  }

  async recordFailure(
    attemptId: number,
    errorCategory: ErrorCategory,
    errorMessage: string,
    taskId: number,
    shouldRetry: boolean,
    responseTimeMs: number = 0,
  ): Promise<void> {
    const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
    if (attempt) {
      attempt.status = 'failed';
      attempt.errorCategory = errorCategory;
      attempt.errorMessage = errorMessage;
      attempt.responseTimeMs = responseTimeMs || null;
      await this.attemptRepo.save(attempt);
    }

    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (task) {
      task.errorCategory = errorCategory;
      task.errorMessage = errorMessage;
      task.lastAttemptAt = new Date();

      if (shouldRetry && task.attemptCount < task.maxAttempts) {
        // Schedule retry with backoff
        task.status = MessageTaskStatus.PENDING;
        const backoffDelay = Math.pow(2, task.attemptCount) * 60_000; // 2^N minutes
        task.nextRetryAt = new Date(Date.now() + backoffDelay);
      } else {
        task.status = MessageTaskStatus.FAILED;
      }
      await this.taskRepo.save(task);
    }
  }
}
