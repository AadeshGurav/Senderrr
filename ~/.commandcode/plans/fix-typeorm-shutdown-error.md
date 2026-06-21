# Fix: TypeORM Shutdown Error with Multiple DataSources

## Problem

When the NestJS application shuts down (Ctrl+C, app.close()), the following error occurs:

```
Error: Nest could not find DataSource element (this provider does not exist in the current context)
    at TypeOrmCoreModule.onApplicationShutdown (typeorm-core.module.js:108)
```

The app uses **two named TypeORM connections** (`'main'` and `'data'`) via `TypeOrmModule.forRootAsync`. Both create separate `TypeOrmCoreModule` dynamic module instances. During shutdown, both fire `onApplicationShutdown()`, which calls `this.moduleRef.get(getDataSourceToken(this.options))`. This `moduleRef.get()` can fail when the module hierarchy is partially torn down or the DataSource provider isn't reachable from the module's context.

The error is thrown **before** the try-catch in `onApplicationShutdown` — `moduleRef.get()` itself throws — so it's not silenced.

## Root Cause

`@nestjs/typeorm` v11's `TypeOrmCoreModule.onApplicationShutdown` calls `this.moduleRef.get(token)` without checking if the provider exists first. With multiple named connections and dynamic modules, the ModuleRef lookup can fail depending on the order of module teardown.

## Fix

**Modify `src/main.ts`** to manually destroy both DataSources **before** calling `app.close()`. This way:
1. DataSources are already destroyed gracefully
2. When `TypeOrmCoreModule.onApplicationShutdown` fires, `moduleRef.get()` still succeeds (the provider still exists in the container)
3. `isInitialized` is `false`, so `destroy()` won't be called again

### Changes to `src/main.ts`

Replace the shutdown callback:

```typescript
// Current (broken):
shutdownService.setShutdownCallback(async () => {
    await app.close();
});

// Fixed:
shutdownService.setShutdownCallback(async () => {
    try {
        const mainDataSource = app.get('mainDataSource');
        if (mainDataSource?.isInitialized) {
            await mainDataSource.destroy();
        }
    } catch {
        // DataSource may have been recycled; safe to ignore
    }
    try {
        const dataDataSource = app.get('dataDataSource');
        if (dataDataSource?.isInitialized) {
            await dataDataSource.destroy();
        }
    } catch {
        // DataSource may have been recycled; safe to ignore
    }
    await app.close();
});
```

### Why this works

- `app.get('mainDataSource')` and `app.get('dataDataSource')` resolve from the application context (not the module context), so they always find the providers
- We destroy DataSources manually before `app.close()` triggers NestJS shutdown hooks
- The `TypeOrmCoreModule.onApplicationShutdown` still runs but `isInitialized` is `false`, so `destroy()` is skipped
- The try-catch ensures no crash if a DataSource was never initialized

## Verification

1. Start the app: `npm run start:dev`
2. Press Ctrl+C to stop it
3. Confirm no `"Nest could not find DataSource element"` error in the logs
4. Confirm databases are clean (no corruption from abrupt shutdown)
