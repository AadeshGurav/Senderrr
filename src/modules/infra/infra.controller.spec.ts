/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method, @typescript-eslint/no-unused-vars, no-useless-assignment */

import { Reflector } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';

// StorageService (imported transitively by InfraController) pulls in `archiver`
// v8, which is ESM-only and cannot be parsed by ts-jest. The controller logic
// under test never touches archiver, so a lightweight stub is sufficient.
jest.mock('archiver', () => ({ default: jest.fn() }));

import { InfraController } from './infra.controller';
import { REQUIRED_ROLE_KEY } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '@database/entities/auth/api-key.entity';

describe('InfraController access control (Vuln 2)', () => {
  const reflector = new Reflector();

  // Every mutating or data-exfiltration endpoint must require the ADMIN role so
  // that a low-privilege (VIEWER/OPERATOR) API key cannot wipe data, read
  // secrets, change config, restart, or trigger storage import.
  const adminOnly = [
    'saveConfig', // PUT  /infra/config
    'requestRestart', // POST /infra/restart
    'exportData', // GET  /infra/export-data  (exposes webhook secrets)
    'importData', // POST /infra/import-data  (DELETEs all rows)
    'exportStorage', // GET  /infra/storage/export
    'importStorage', // POST /infra/storage/import
  ] as const;

  it.each(adminOnly)('%s requires the ADMIN role', method => {
    const handler = InfraController.prototype[method as keyof InfraController] as any;
    const role = reflector.get<ApiKeyRole | undefined>(REQUIRED_ROLE_KEY, handler);
    expect(role).toBe(ApiKeyRole.ADMIN);
  });

  it('leaves read-only status open to any authenticated key', () => {
    const handler = InfraController.prototype.getStatus as any;
    const role = reflector.get<ApiKeyRole | undefined>(REQUIRED_ROLE_KEY, handler);
    expect(role).toBeUndefined();
  });
});

describe('InfraController.importStorage filePath validation (Vuln 3)', () => {
  function buildController(storage: Partial<{ importFromStream: jest.Mock; getCurrentStorageType: jest.Mock }>) {
    return new InfraController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
    );
  }

  it('rejects a filePath that escapes the data directory before touching the filesystem', async () => {
    const storage = { importFromStream: jest.fn(), getCurrentStorageType: jest.fn(() => 'local') };
    const controller = buildController(storage);

    await expect(controller.importStorage({ filePath: '../../../../etc/passwd' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.importFromStream).not.toHaveBeenCalled();
  });
});
