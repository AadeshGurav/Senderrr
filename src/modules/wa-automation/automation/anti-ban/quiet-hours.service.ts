import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QuietHoursService {
  private readonly startHour: number;
  private readonly endHour: number;

  constructor(configService: ConfigService) {
    this.startHour = configService.get<number>('automation.quietHourStart', 1);
    this.endHour = configService.get<number>('automation.quietHourEnd', 7);
  }

  /** Returns true if we are currently in quiet hours (should NOT send) */
  isQuietHours(now: Date = new Date()): boolean {
    const hour = now.getHours();
    if (this.startHour <= this.endHour) {
      return hour >= this.startHour && hour < this.endHour;
    }
    // Wraps around midnight (e.g. 22:00 - 06:00)
    return hour >= this.startHour || hour < this.endHour;
  }

  /** Minutes until quiet hours end */
  minutesUntilEnd(now: Date = new Date()): number {
    const hour = now.getHours();
    if (this.startHour <= this.endHour) {
      if (hour < this.startHour) return 0;
      if (hour < this.endHour) return (this.endHour - hour) * 60 - now.getMinutes();
      return 0;
    }
    // Wrap-around case
    if (hour >= this.startHour) {
      return (24 - hour + this.endHour) * 60 - now.getMinutes();
    }
    if (hour < this.endHour) return 0;
    return 0;
  }
}
