import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { RateLimiterService } from './rate-limiter.service';
import { WorkerTrackerService } from './worker-tracker.service';
import { SessionHealthService } from './session-health.service';
import { AdminSessionService } from './admin-session.service';
import { WaAuthGuard } from '../wa-auth/wa-auth.guard';

@ApiTags('wa-automation / automation')
@Controller('wa/automation')
@UseGuards(WaAuthGuard)
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly rateLimiter: RateLimiterService,
    private readonly workerTracker: WorkerTrackerService,
    private readonly sessionHealth: SessionHealthService,
    private readonly adminSessionService: AdminSessionService,
  ) {}

  // ─── Workers (now returns admin session data) ───────────────

  @Get('workers')
  @ApiOperation({ summary: 'List all admin sessions (workers replaced by sessions)' })
  async getWorkers() {
    const sessions = await this.adminSessionService.listAllSessions();
    // Return sessions in a worker-like shape for backward compat with the UI
    return sessions.map(s => ({
      id: s.id,
      adminId: s.adminId,
      workerId: `admin-${s.adminId}-sess-${s.sessionIndex}`,
      status: s.openwaSessionStatus === 'ready' ? 'ACTIVE' : s.openwaSessionStatus === 'created' ? 'STARTING' : 'IDLE',
      browserStatus: s.openwaSessionStatus === 'ready' ? 'LOGGED_IN' : s.openwaSessionStatus === 'disconnected' ? 'UNKNOWN' : 'CREATED',
      openwaSessionId: s.openwaSessionId,
      openwaSessionStatus: s.openwaSessionStatus,
      totalSent: 0,
      totalFailed: 0,
      lastHeartbeatAt: null,
      currentGroupId: null,
      lastError: null,
    }));
  }

  @Get('workers/:workerId/logs')
  @ApiOperation({ summary: 'Get logs for a worker (returns empty for session-based system)' })
  async getWorkerLogs(@Param('workerId') _workerId: string) {
    return []; // No worker logs in session-based system
  }

  // ─── Admin Sessions (Lifecycle) ────────────────────────────

  @Post('admin/:adminId/session/create')
  @ApiOperation({ summary: 'Create OpenWA sessions for all admin slots' })
  async createAdminSessions(@Param('adminId', ParseIntPipe) adminId: number) {
    const sessions = await this.adminSessionService.createSessionsForAdmin(adminId);
    return { adminId, sessions: sessions.map(s => ({ id: s.id, slot: s.sessionIndex, openwaSessionId: s.openwaSessionId, status: s.openwaSessionStatus })) };
  }

  @Post('admin/:adminId/session/:slot/start')
  @ApiOperation({ summary: 'Start a session for an admin slot' })
  async startAdminSession(
    @Param('adminId', ParseIntPipe) adminId: number,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    const as = await this.adminSessionService.getAdminSessionBySlot(adminId, slot);
    return this.adminSessionService.startSession(as.id);
  }

  @Post('admin/:adminId/session/:slot/stop')
  @ApiOperation({ summary: 'Stop a session for an admin slot' })
  async stopAdminSession(
    @Param('adminId', ParseIntPipe) adminId: number,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    const as = await this.adminSessionService.getAdminSessionBySlot(adminId, slot);
    await this.adminSessionService.stopSession(as.id);
    return { success: true };
  }

  @Delete('admin/:adminId/session/:slot')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a session for an admin slot' })
  async deleteAdminSession(
    @Param('adminId', ParseIntPipe) adminId: number,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    const as = await this.adminSessionService.getAdminSessionBySlot(adminId, slot);
    await this.adminSessionService.deleteSession(as.id);
  }

  @Get('admin/:adminId/session/:slot/qr')
  @ApiOperation({ summary: 'Get QR code for an admin session' })
  async getAdminSessionQR(
    @Param('adminId', ParseIntPipe) adminId: number,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    const as = await this.adminSessionService.getAdminSessionBySlot(adminId, slot);
    return this.adminSessionService.getQRCode(as.id);
  }

  @Get('admin/sessions')
  @ApiOperation({ summary: 'List all admin session mappings' })
  async listAllAdminSessions() {
    return this.adminSessionService.listAllSessions();
  }

  @Get('admin/:adminId/sessions')
  @ApiOperation({ summary: 'List sessions for a specific admin' })
  async listAdminSessions(@Param('adminId', ParseIntPipe) adminId: number) {
    return this.adminSessionService.getAdminSessions(adminId);
  }

  // ─── Groups & Communities ──────────────────────────────────

  @Get('admin/:adminId/session/:slot/groups')
  @ApiOperation({ summary: 'Fetch groups from an admin session' })
  async fetchAdminGroups(
    @Param('adminId', ParseIntPipe) adminId: number,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    const as = await this.adminSessionService.getAdminSessionBySlot(adminId, slot);
    return this.adminSessionService.fetchGroups(as.id);
  }

  @Post('admin/:adminId/session/:slot/import-groups')
  @ApiOperation({ summary: 'Import groups from session into DB' })
  async importAdminGroups(
    @Param('adminId', ParseIntPipe) adminId: number,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    const as = await this.adminSessionService.getAdminSessionBySlot(adminId, slot);
    return this.adminSessionService.importGroups(as.id);
  }

  @Get('admin/:adminId/session/:slot/communities')
  @ApiOperation({ summary: 'List all communities (manual management)' })
  async fetchAdminCommunities() {
    return this.adminSessionService.fetchCommunities();
  }

  @Post('admin/:adminId/session/:slot/import-communities')
  @ApiOperation({ summary: 'Import communities (not supported — use manual creation)' })
  async importAdminCommunities() {
    return this.adminSessionService.importCommunities();
  }

  // ─── Legacy session endpoints ──────────────────────────────

  @Post('session/:sessionId/check')
  @ApiOperation({ summary: 'Check session health' })
  async checkSession(@Param('sessionId') sessionId: string) {
    const status = await this.sessionHealth.checkSession(sessionId);
    return { sessionId, status };
  }

  @Get('session/:sessionId/qr')
  @ApiOperation({ summary: 'Get QR code for a session' })
  async getQR(@Param('sessionId') sessionId: string) {
    const qr = await this.sessionHealth.getSessionQR(sessionId);
    return { sessionId, qr };
  }

  @Get('rate-limits/:adminId')
  @ApiOperation({ summary: 'Get rate limit status for an admin' })
  async getRateLimits(@Param('adminId', ParseIntPipe) adminId: number) {
    return [];
  }
}
