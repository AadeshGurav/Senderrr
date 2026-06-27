import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SessionService } from '../../session/session.service';
import { AdminSession } from './entities/admin-session.entity';
import { AdminAccount } from '../campaign/entities/admin-account.entity';
import { WhatsAppGroup } from '../campaign/entities/whatsapp-group.entity';
import { WhatsAppCommunity } from '../campaign/entities/whatsapp-community.entity';

@Injectable()
export class AdminSessionService {
  private readonly logger = new Logger('AdminSessionService');

  private get adminRepo(): Repository<AdminAccount> {
    return this.dataSource.getRepository(AdminAccount);
  }
  private get groupRepo(): Repository<WhatsAppGroup> {
    return this.dataSource.getRepository(WhatsAppGroup);
  }
  private get communityRepo(): Repository<WhatsAppCommunity> {
    return this.dataSource.getRepository(WhatsAppCommunity);
  }

  constructor(
    @InjectRepository(AdminSession, 'data')
    private readonly adminSessionRepo: Repository<AdminSession>,
    @InjectDataSource('data')
    private readonly dataSource: DataSource,
    private readonly sessionService: SessionService,
  ) {}

  // ─── Session Lifecycle ────────────────────────────────────────

  async createSessionsForAdmin(adminId: number): Promise<AdminSession[]> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } as any });
    if (!admin) throw new NotFoundException(`Admin #${adminId} not found`);

    const existing = await this.adminSessionRepo.find({ where: { adminId } });
    const count = Math.max(1, Math.min(admin.sessionsPerAdmin || 1, 4));
    const results: AdminSession[] = [];

    for (let slot = 0; slot < count; slot++) {
      const existingSlot = existing.find(e => e.sessionIndex === slot);
      if (existingSlot) {
        results.push(existingSlot);
        continue;
      }

      const sessionName = `wa-admin-${adminId}-${slot}`;

      let coreSession;
      try {
        coreSession = await this.sessionService.create({ name: sessionName });
      } catch (err) {
        if (err instanceof ConflictException) {
          // Orphaned core session with same name — delete and retry
          this.logger.warn(`Orphaned session '${sessionName}' exists, cleaning up`);
          try {
            const orphaned = await this.sessionService.findByName(sessionName);
            try { await this.sessionService.stop(orphaned.id); } catch { /* ok */ }
            await this.sessionService.delete(orphaned.id);
          } catch { /* already gone */ }
          coreSession = await this.sessionService.create({ name: sessionName });
        } else {
          throw err;
        }
      }
      const adminSession = this.adminSessionRepo.create({
        adminId,
        sessionIndex: slot,
        openwaSessionId: coreSession.id,
        openwaSessionStatus: coreSession.status,
      });
      results.push(await this.adminSessionRepo.save(adminSession));
    }

    // Always update admin's openwaSessionId to the latest session
    admin.openwaSessionId = results[0]?.openwaSessionId || admin.openwaSessionId;
    await this.adminRepo.save(admin);

    return results;
  }

  async getAdminSessions(adminId: number): Promise<AdminSession[]> {
    const sessions = await this.adminSessionRepo.find({ where: { adminId }, order: { sessionIndex: 'ASC' } });
    // Refresh each session's status from the real OpenWA session to avoid stale data
    for (const s of sessions) {
      try {
        const core = await this.sessionService.findOne(s.openwaSessionId);
        if (core && core.status !== s.openwaSessionStatus) {
          s.openwaSessionStatus = core.status;
          await this.adminSessionRepo.save(s);
        }
      } catch {
        // OpenWA session not found — leave DB status as-is
      }
    }
    return this.adminSessionRepo.find({ where: { adminId }, order: { sessionIndex: 'ASC' } });
  }

  async listAllSessions(): Promise<AdminSession[]> {
    const sessions = await this.adminSessionRepo.find({ order: { adminId: 'ASC', sessionIndex: 'ASC' } });
    // Refresh each session's status from the real OpenWA session
    for (const s of sessions) {
      try {
        const core = await this.sessionService.findOne(s.openwaSessionId);
        if (core && core.status !== s.openwaSessionStatus) {
          s.openwaSessionStatus = core.status;
          await this.adminSessionRepo.save(s);
        }
      } catch {
        // OpenWA session not found — leave DB status as-is
      }
    }
    return this.adminSessionRepo.find({ order: { adminId: 'ASC', sessionIndex: 'ASC' } });
  }

  async getAdminSessionBySlot(adminId: number, slot: number): Promise<AdminSession> {
    const session = await this.adminSessionRepo.findOne({ where: { adminId, sessionIndex: slot } });
    if (!session) throw new NotFoundException(`No session for admin #${adminId}, slot ${slot}`);
    return session;
  }

  async startSession(adminSessionId: number): Promise<{ status: string; qrCode?: string }> {
    const adminSession = await this.adminSessionRepo.findOne({ where: { id: adminSessionId } });
    if (!adminSession) throw new NotFoundException(`Admin session #${adminSessionId} not found`);

    const result = await this.sessionService.start(adminSession.openwaSessionId);
    adminSession.openwaSessionStatus = result.status;
    await this.adminSessionRepo.save(adminSession);

    // Retry QR code fetch with exponential backoff (up to 3 retries)
    for (let i = 0; i < 3; i++) {
      try {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        const qr = await this.sessionService.getQRCode(adminSession.openwaSessionId);
        if (qr.qrCode) {
          return { status: result.status, qrCode: qr.qrCode };
        }
      } catch {
        // Wait and retry
      }
    }
    return { status: result.status };
  }

  async stopSession(adminSessionId: number): Promise<void> {
    const adminSession = await this.adminSessionRepo.findOne({ where: { id: adminSessionId } });
    if (!adminSession) throw new NotFoundException(`Admin session #${adminSessionId} not found`);

    const result = await this.sessionService.stop(adminSession.openwaSessionId);
    adminSession.openwaSessionStatus = result.status;
    await this.adminSessionRepo.save(adminSession);
  }

  async deleteSession(adminSessionId: number): Promise<void> {
    const adminSession = await this.adminSessionRepo.findOne({ where: { id: adminSessionId } });
    if (!adminSession) throw new NotFoundException(`Admin session #${adminSessionId} not found`);

    try { await this.sessionService.stop(adminSession.openwaSessionId); } catch { /* ok */ }
    await this.sessionService.delete(adminSession.openwaSessionId);
    await this.adminSessionRepo.remove(adminSession);

    // Clear the admin's stale openwaSessionId if it pointed to the deleted session
    const admin = await this.adminRepo.findOne({ where: { id: adminSession.adminId } as any });
    if (admin && admin.openwaSessionId === adminSession.openwaSessionId) {
      const remaining = await this.adminSessionRepo.find({ where: { adminId: admin.id } });
      admin.openwaSessionId = remaining.length > 0 ? remaining[0].openwaSessionId : null;
      await this.adminRepo.save(admin);
    }
  }

  async getQRCode(adminSessionId: number): Promise<{ qrCode: string | null; status: string }> {
    const adminSession = await this.adminSessionRepo.findOne({ where: { id: adminSessionId } });
    if (!adminSession) throw new NotFoundException(`Admin session #${adminSessionId} not found`);

    try {
      const qr = await this.sessionService.getQRCode(adminSession.openwaSessionId);
      adminSession.openwaSessionStatus = qr.status;
      await this.adminSessionRepo.save(adminSession);
      return { qrCode: qr.qrCode, status: qr.status };
    } catch (err) {
      // Session might already be ready — check its real status
      const coreSession = await this.sessionService.findOne(adminSession.openwaSessionId);
      adminSession.openwaSessionStatus = coreSession.status;
      await this.adminSessionRepo.save(adminSession);
      if (coreSession.status === 'ready') {
        return { qrCode: null, status: 'ready' };
      }
      throw err;
    }
  }

  async getSessionStatus(adminSessionId: number): Promise<string> {
    const adminSession = await this.adminSessionRepo.findOne({ where: { id: adminSessionId } });
    if (!adminSession) throw new NotFoundException(`Admin session #${adminSessionId} not found`);
    return adminSession.openwaSessionStatus;
  }

  // ─── Groups & Communities ─────────────────────────────────────

  async fetchGroups(adminSessionId: number): Promise<{ id: string; name: string }[]> {
    const adminSession = await this.adminSessionRepo.findOne({ where: { id: adminSessionId } });
    if (!adminSession) throw new NotFoundException(`Admin session #${adminSessionId} not found`);
    return this.sessionService.getGroups(adminSession.openwaSessionId);
  }

  async importGroups(adminSessionId: number): Promise<{ imported: number; skipped: number }> {
    const groups = await this.fetchGroups(adminSessionId);
    let imported = 0;
    let skipped = 0;

    for (const g of groups) {
      const exists = await this.groupRepo.findOne({ where: { groupJid: g.id } as any });
      if (exists) { skipped++; continue; }
      await this.groupRepo.save({ name: g.name, groupJid: g.id, openwaGroupId: g.id } as any);
      imported++;
    }

    return { imported, skipped };
  }

  async fetchCommunities(adminSessionId: number): Promise<{ id: string; name: string }[]> {
    return this.fetchGroups(adminSessionId);
  }

  async importCommunities(adminSessionId: number): Promise<{ imported: number; skipped: number }> {
    const groups = await this.fetchGroups(adminSessionId);
    let imported = 0;
    let skipped = 0;

    for (const g of groups) {
      const exists = await this.communityRepo.findOne({ where: { communityJid: g.id } as any });
      if (exists) { skipped++; continue; }
      await this.communityRepo.save({ name: g.name, communityJid: g.id } as any);
      imported++;
    }

    return { imported, skipped };
  }

  // ─── Super Admin ──────────────────────────────────────────────

  async setSuperAdmin(adminId: number, isSuperAdmin: boolean): Promise<AdminAccount> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } as any });
    if (!admin) throw new NotFoundException(`Admin #${adminId} not found`);
    admin.isSuperAdmin = isSuperAdmin;
    return this.adminRepo.save(admin);
  }
}
