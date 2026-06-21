import { Injectable } from '@nestjs/common';
import { WorkerSlot } from './worker-tracker.service';

/**
 * Builds a flat list of worker slots from active admin accounts.
 * Each admin with N sessions produces N worker slots.
 * Worker IDs are sequential: admin 0 (2 sessions) → workers 0,1; admin 1 (3) → workers 2,3,4
 */
@Injectable()
export class WorkerMappingService {
  buildWorkerMap(admins: Array<{ id: number; sessionsPerAdmin: number }>): WorkerSlot[] {
    const slots: WorkerSlot[] = [];
    let workerIndex = 0;

    for (const admin of admins) {
      const sessionCount = Math.max(1, Math.min(admin.sessionsPerAdmin || 1, 4));
      for (let idx = 0; idx < sessionCount; idx++) {
        slots.push({
          workerId: `wa-worker-${workerIndex}`,
          adminId: admin.id,
          sessionIndex: idx,
        });
        workerIndex++;
      }
    }

    return slots;
  }

  getWorkerIdForAdmin(adminId: number, sessionIndex: number): string {
    return `admin-${adminId}-sess-${sessionIndex}`;
  }

  getAdminIdForWorker(workerId: string): number | null {
    const match = workerId.match(/admin-(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }
}
