import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { WorkerSession, WorkerStatus } from '@database/entities/wa-automation/worker-session.entity';
import { WorkerSessionLog, SessionEventType } from '@database/entities/wa-automation/worker-session-log.entity';

/**
 * Worker slot — a conceptual "worker" that maps to an admin + session index.
 * Replaces the Celery worker concept with an in-process tracking model.
 */
export interface WorkerSlot {
  workerId: string;
  adminId: number;
  sessionIndex: number;
}

@Injectable()
export class WorkerTrackerService {
  private readonly logger = new Logger('WorkerTrackerService');

  constructor(
    @InjectRepository(WorkerSession, 'data')
    private readonly sessionRepo: Repository<WorkerSession>,
    @InjectRepository(WorkerSessionLog, 'data')
    private readonly logRepo: Repository<WorkerSessionLog>,
  ) {}

  async registerWorker(workerId: string, adminId: number): Promise<WorkerSession> {
    let session = await this.sessionRepo.findOne({ where: { workerId } });
    if (!session) {
      session = this.sessionRepo.create({ workerId, adminId, status: WorkerStatus.STARTING });
      session = await this.sessionRepo.save(session);
    }
    return session;
  }

  async recordHeartbeat(workerId: string, data?: Partial<WorkerSession>): Promise<WorkerSession> {
    let session = await this.sessionRepo.findOne({ where: { workerId } });
    if (!session) {
      // Auto-create if not exists (idempotent heartbeat)
      session = await this.registerWorker(workerId, 0);
    }

    session.lastHeartbeatAt = new Date();
    session.status = WorkerStatus.ACTIVE;
    if (data) {
      if (data.browserStatus) session.browserStatus = data.browserStatus;
      if (data.openwaSessionId) session.openwaSessionId = data.openwaSessionId;
      if (data.openwaSessionStatus) session.openwaSessionStatus = data.openwaSessionStatus;
      if (data.lastError) session.lastError = data.lastError;
    }
    session = await this.sessionRepo.save(session);

    await this.logRepo.save(
      this.logRepo.create({
        workerSessionId: session.id,
        event: SessionEventType.HEARTBEAT,
        detail: JSON.stringify(data || {}),
      }),
    );

    return session;
  }

  async recordTaskStart(workerId: string, groupId: string): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { workerId } });
    if (session) {
      session.currentGroupId = groupId;
      session.status = WorkerStatus.ACTIVE;
      await this.sessionRepo.save(session);
      await this.logRepo.save(
        this.logRepo.create({
          workerSessionId: session.id,
          event: SessionEventType.TASK_STARTED,
          detail: `Group: ${groupId}`,
        }),
      );
    }
  }

  async recordTaskEnd(workerId: string, success: boolean): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { workerId } });
    if (session) {
      if (success) {
        session.totalSent++;
      } else {
        session.totalFailed++;
      }
      session.currentGroupId = null;
      session.status = WorkerStatus.IDLE;
      await this.sessionRepo.save(session);
      await this.logRepo.save(
        this.logRepo.create({
          workerSessionId: session.id,
          event: success ? SessionEventType.COMPLETED : SessionEventType.FAILED,
        }),
      );
    }
  }

  async markOffline(workerId: string, error?: string): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { workerId } });
    if (session) {
      session.status = WorkerStatus.OFFLINE;
      if (error) session.lastError = error;
      await this.sessionRepo.save(session);
      await this.logRepo.save(
        this.logRepo.create({
          workerSessionId: session.id,
          event: SessionEventType.SHUTDOWN,
          detail: error || null,
        }),
      );
    }
  }

  async markStaleSessionsOffline(maxAgeMinutes = 5): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
    const stale = await this.sessionRepo.find({
      where: {
        status: WorkerStatus.ACTIVE,
        lastHeartbeatAt: LessThan(cutoff),
      },
    });
    for (const s of stale) {
      s.status = WorkerStatus.OFFLINE;
      s.lastError = 'No heartbeat detected';
      await this.sessionRepo.save(s);
    }
    return stale.length;
  }

  async getAllSessions(): Promise<WorkerSession[]> {
    return this.sessionRepo.find({ order: { workerId: 'ASC' } });
  }

  async getAdminSessions(adminId: number): Promise<WorkerSession[]> {
    return this.sessionRepo.find({ where: { adminId }, order: { workerId: 'ASC' } });
  }

  async getLogs(workerSessionId: number, limit = 50): Promise<WorkerSessionLog[]> {
    return this.logRepo.find({
      where: { workerSessionId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
