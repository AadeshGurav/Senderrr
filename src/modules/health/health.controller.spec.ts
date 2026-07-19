import { HealthController } from './health.controller';

// Mock DataSource that simulates TypeORM's DataSource interface
function createMockDataSource(shouldFail = false) {
  return {
    query: jest.fn().mockImplementation(async () => {
      if (shouldFail) throw new Error('Connection refused');
      return [{ '?column?': 1 }];
    }),
  };
}

describe('HealthController', () => {
  let controller: HealthController;
  let mainDs: ReturnType<typeof createMockDataSource>;
  let dataDs: ReturnType<typeof createMockDataSource>;

  beforeEach(() => {
    mainDs = createMockDataSource();
    dataDs = createMockDataSource();
    // Instantiate controller directly with mocked dependencies
    controller = new HealthController(mainDs as any, dataDs as any);
  });

  describe('liveness', () => {
    it('should return ok status for Render health check', () => {
      const result = controller.liveness();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('ping', () => {
    it('should return ok status with uptime', () => {
      const result = controller.ping();
      expect(result.status).toBe('ok');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('readiness', () => {
    it('should return ok when both databases are reachable', async () => {
      const result = await controller.readiness();
      expect(result.status).toBe('ok');
      expect(result.services?.mainDb?.status).toBe('up');
      expect(result.services?.dataDb?.status).toBe('up');
      expect(mainDs.query).toHaveBeenCalledWith('SELECT 1');
      expect(dataDs.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return error when main database is unreachable', async () => {
      const failingDs = createMockDataSource(true);
      const okDs = createMockDataSource(false);
      const controllerWithFailingDs = new HealthController(
        failingDs as any,
        okDs as any,
      );

      const result = await controllerWithFailingDs.readiness();

      expect(result.status).toBe('error');
      expect(result.services?.mainDb?.status).toBe('down');
      expect(result.services?.mainDb?.error).toBe('Connection refused');
      expect(result.services?.dataDb?.status).toBe('up');
    });

    it('should return error when data database is unreachable', async () => {
      const okDs = createMockDataSource(false);
      const failingDs = createMockDataSource(true);
      const controllerWithFailingDs = new HealthController(
        okDs as any,
        failingDs as any,
      );

      const result = await controllerWithFailingDs.readiness();

      expect(result.status).toBe('error');
      expect(result.services?.mainDb?.status).toBe('up');
      expect(result.services?.dataDb?.status).toBe('down');
    });
  });

  describe('check', () => {
    it('should delegate to readiness and return ok when databases are up', async () => {
      const result = await controller.check();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeDefined();
    });
  });
});