import { Global, Module } from '@nestjs/common';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginStorageService } from './plugin-storage.service';

@Global() // Make plugin services available everywhere
@Module({
  providers: [PluginStorageService, PluginLoaderService],
  exports: [PluginLoaderService, PluginStorageService],
})
export class PluginsModule {}
