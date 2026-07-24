/**
 * WhatsApp-web.js Engine Plugin
 * Built-in engine plugin that wraps the whatsapp-web.js library.
 *
 * Engine creation is handled by EngineFactory directly (bypassing this plugin)
 * because RemoteAuth requires a Postgres DataSource which the plugin interface
 * cannot carry. This plugin is still used for healthCheck() and getFeatures().
 */

import { PluginContext, PluginType, IEnginePlugin } from '@core/plugins';
import { IWhatsAppEngine } from '@whatsapp-engine/interfaces/whatsapp-engine.interface';

export class WhatsAppWebJsPlugin implements IEnginePlugin {
  type = PluginType.ENGINE as const;
  private context?: PluginContext;

  onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.log('WhatsApp-web.js engine plugin loaded');
    return Promise.resolve();
  }

  onEnable(context: PluginContext): Promise<void> {
    context.logger.log('WhatsApp-web.js engine plugin enabled');
    return Promise.resolve();
  }

  onDisable(context: PluginContext): Promise<void> {
    context.logger.log('WhatsApp-web.js engine plugin disabled');
    return Promise.resolve();
  }

  createEngine(_config: Record<string, unknown>): IWhatsAppEngine {
    // Engine creation is delegated to EngineFactory which injects the DataSource
    // required by RemoteAuth. This method exists only to satisfy IEnginePlugin.
    throw new Error(
      'Engine creation is handled by EngineFactory — do not call createEngine directly',
    );
  }

  getFeatures(): string[] {
    return [
      'text-messages',
      'media-messages',
      'location-messages',
      'contact-messages',
      'group-management',
      'message-reactions',
      'message-replies',
      'message-forwarding',
      'message-deletion',
      'read-receipts',
      'typing-indicator',
      'labels',
      'channels',
      'status-updates',
      'catalog',
    ];
  }

  healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return Promise.resolve({ healthy: true, message: 'WhatsApp-web.js engine is available' });
  }
}

export default WhatsAppWebJsPlugin;