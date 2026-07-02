import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class QuietHoursService {
  private readonly logger = new Logger('QuietHoursService');

  constructor(private readonly settingsService: SettingsService) {}

  /** Returns true if we are currently in quiet hours (should NOT send).
   *  Reads quiet hour config and timezone from DB settings (with env fallback). */
  async isQuietHours(now: Date = new Date()): Promise<boolean> {
    const [startStr, endStr, tz] = await Promise.all([
      this.settingsService.get('AUTOMATION_QUIET_HOUR_START', '1'),
      this.settingsService.get('AUTOMATION_QUIET_HOUR_END', '7'),
      this.settingsService.get('TIMEZONE', 'UTC'),
    ]);

    const startHour = parseInt(startStr, 10);
    const endHour = parseInt(endStr, 10);
    const hour = this.getHourInTimezone(now, tz);

    if (startHour <= endHour) {
      return hour >= startHour && hour < endHour;
    }
    return hour >= startHour || hour < endHour;
  }

  /** Minutes until quiet hours end. */
  async minutesUntilEnd(now: Date = new Date()): Promise<number> {
    const [startStr, endStr, tz] = await Promise.all([
      this.settingsService.get('AUTOMATION_QUIET_HOUR_START', '1'),
      this.settingsService.get('AUTOMATION_QUIET_HOUR_END', '7'),
      this.settingsService.get('TIMEZONE', 'UTC'),
    ]);

    const startHour = parseInt(startStr, 10);
    const endHour = parseInt(endStr, 10);
    const hour = this.getHourInTimezone(now, tz);
    const minute = this.getMinuteInTimezone(now, tz);

    if (startHour <= endHour) {
      if (hour < startHour) return 0;
      if (hour < endHour) return (endHour - hour) * 60 - minute;
      return 0;
    }
    if (hour >= startHour) {
      return (24 - hour + endHour) * 60 - minute;
    }
    if (hour < endHour) return 0;
    return 0;
  }

  private getHourInTimezone(date: Date, timezone: string): number {
    try {
      return parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(date),
        10,
      );
    } catch {
      return date.getHours();
    }
  }

  private getMinuteInTimezone(date: Date, timezone: string): number {
    try {
      return parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: timezone, minute: 'numeric' }).format(date),
        10,
      );
    } catch {
      return date.getMinutes();
    }
  }
}
