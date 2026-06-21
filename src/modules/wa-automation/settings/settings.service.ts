import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuntimeSetting } from './entities/runtime-setting.entity';

/**
 * Runtime settings overridable via DB table (and backed by env defaults).
 * Checks RuntimeSetting first, falls back to process.env, then default.
 */
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(RuntimeSetting, 'data')
    private readonly settingsRepo: Repository<RuntimeSetting>,
  ) {}

  async get(key: string, defaultValue = ''): Promise<string> {
    const row = await this.settingsRepo.findOne({ where: { key } });
    return row?.value ?? process.env[key] ?? defaultValue;
  }

  async getInt(key: string, defaultValue = 0): Promise<number> {
    const val = await this.get(key, String(defaultValue));
    return parseInt(val, 10);
  }

  async getFloat(key: string, defaultValue = 0): Promise<number> {
    const val = await this.get(key, String(defaultValue));
    return parseFloat(val);
  }

  async set(key: string, value: string): Promise<void> {
    let row = await this.settingsRepo.findOne({ where: { key } });
    if (!row) {
      row = this.settingsRepo.create({ key, value });
    } else {
      row.value = value;
    }
    await this.settingsRepo.save(row);
  }

  async delete(key: string): Promise<void> {
    await this.settingsRepo.delete({ key });
  }

  async all(): Promise<RuntimeSetting[]> {
    return this.settingsRepo.find({ order: { key: 'ASC' } });
  }

  /** Bulk update — set multiple keys at once */
  async bulkSet(entries: Array<{ key: string; value: string }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value);
    }
  }
}
