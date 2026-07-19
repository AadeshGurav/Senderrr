import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('should return ok status', () => {
      const result = controller.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('liveness', () => {
    it('should return ok status for liveness probe', () => {
      const result = controller.liveness();

      expect(result.status).toBe('ok');
    });
  });

  describe('readiness', () => {
    it('should return ok status for readiness probe', () => {
      const result = controller.readiness();

      expect(result.status).toBe('ok');
    });
  });
});
