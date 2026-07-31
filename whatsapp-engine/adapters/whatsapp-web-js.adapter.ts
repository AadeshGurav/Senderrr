import { EventEmitter } from 'events';
import { Client, RemoteAuth, LocalAuth, MessageMedia, MessageTypes } from 'whatsapp-web.js';
import { DataSource } from 'typeorm';
import * as qrcode from 'qrcode';
import {
  IWhatsAppEngine,
  EngineStatus,
  EngineEventCallbacks,
  MessageResult,
  MediaInput,
  IncomingMessage,
  Contact,
  Group,
  GroupInfo,
  GroupParticipant,
  LocationInput,
  ContactCard,
  MessageReaction,
  Label,
  Channel,
  ChannelMessage,
  Status,
  TextStatusOptions,
  StatusResult,
  Catalog,
  Product,
  ProductQueryOptions,
  PaginatedProducts,
} from '../interfaces/whatsapp-engine.interface';
import { createLogger } from '@common/services/logger.service';
import {
  GroupChat,
  MessageWithReactions,
  BusinessClient,
  WwjsChannelData,
  GroupCreateResult,
} from '../types/whatsapp-web-js.types';
import { PostgresRemoteAuthStore } from '../stores/postgres-remote-auth.store';

export interface WhatsAppWebJsConfig {
  sessionId: string;
  // sessionDataPath removed — RemoteAuth stores sessions in Postgres via PostgresRemoteAuthStore
  puppeteer?: {
    headless?: boolean;
    args?: string[];
  };
  // Phase 3: Proxy per session
  proxy?: {
    url: string;
    type: 'http' | 'https' | 'socks4' | 'socks5';
  };
}

export class WhatsAppWebJsAdapter extends EventEmitter implements IWhatsAppEngine {
  private client: Client | null = null;
  private status: EngineStatus = EngineStatus.DISCONNECTED;
  private qrCode: string | null = null;
  private phoneNumber: string | null = null;
  private pushName: string | null = null;
  private callbacks: EngineEventCallbacks = {};
  private consoleForwardedPages: WeakSet<object> = new WeakSet();

  constructor(
    private readonly config: WhatsAppWebJsConfig,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  private readonly logger = createLogger('WhatsAppWebJsAdapter');

  async initialize(callbacks: EngineEventCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.setStatus(EngineStatus.INITIALIZING);

    try {
      // Build puppeteer args, including proxy if configured
      const puppeteerArgs = this.config.puppeteer?.args || [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ];

      // Add proxy configuration if provided
      if (this.config.proxy) {
        puppeteerArgs.push(`--proxy-server=${this.config.proxy.url}`);
        this.logger.log(
          `Using proxy: ${this.config.proxy.type}://${this.config.proxy.url.replace(/:[^:@]*@/, ':***@')}`,
        );
      }

      // Auth strategy configuration
      // 'local' (default): sessions live on the persistent disk, immediate writes, no external DB round-trip. Requires SESSION_DATA_PATH to point at a mounted persistent disk.
      // 'remote': sessions sync to Postgres every 5 minutes via RemoteAuth. Use only when there's no persistent disk available. Has up to a 5-minute data-loss window on crash since it doesn't write instantly.
      const authType = (process.env.WA_AUTH_TYPE || 'local').toLowerCase();
      let authStrategy;
      if (authType === 'remote') {
        authStrategy = new RemoteAuth({
          clientId: this.config.sessionId,
          store: new PostgresRemoteAuthStore(this.dataSource),
          backupSyncIntervalMs: 300000, // 5-minute minimum required by whatsapp-web.js
        });
      } else {
        authStrategy = new LocalAuth({
          clientId: this.config.sessionId,
          dataPath: process.env.SESSION_DATA_PATH || '.wwebjs_auth',
        });
      }

      this.client = new Client({
        authStrategy,
        puppeteer: {
          headless: this.config.puppeteer?.headless ?? true,
          args: puppeteerArgs,
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        },
      });

      this.setupEventHandlers();
      await this.client.initialize();
    } catch (error) {
      this.setStatus(EngineStatus.FAILED);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.client.on('qr', async (qr: string) => {
      try {
        this.qrCode = await qrcode.toDataURL(qr);
        this.setStatus(EngineStatus.QR_READY);
        this.callbacks.onQRCode?.(this.qrCode!);
      } catch (error) {
        this.logger.error('Error generating QR code', String(error));
      }
    });

    this.client.on('authenticated', () => {
      this.setStatus(EngineStatus.AUTHENTICATING);
      this.qrCode = null;
    });

    this.client.on('ready', () => {
      try {
        const info = this.client?.info;
        this.phoneNumber = info?.wid?.user || null;
        this.pushName = info?.pushname || null;
        this.setStatus(EngineStatus.READY);
        this.callbacks.onReady?.(this.phoneNumber || '', this.pushName || '');
      } catch (error) {
        this.logger.error('Error getting client info', String(error));
        this.setStatus(EngineStatus.READY);
        this.callbacks.onReady?.('', '');
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.client.on('message', async msg => {
      try {
        const incomingMessage: IncomingMessage = {
          id: msg.id._serialized,
          from: msg.from,
          to: msg.to,
          chatId: msg.from,
          body: msg.body,
          type: msg.type,
          timestamp: msg.timestamp,
          fromMe: msg.fromMe,
          isGroup: msg.from.endsWith('@g.us'),
        };

        // Handle location
        if (msg.type === MessageTypes.LOCATION && msg.location) {
          incomingMessage.location = {
            latitude: Number(msg.location.latitude),
            longitude: Number(msg.location.longitude),
            description: msg.location.description || undefined,
            address: msg.location.address || undefined,
            url: msg.location.url || undefined,
          };
        }

        // Handle media
        if (msg.hasMedia) {
          try {
            const media = await msg.downloadMedia();
            if (media) {
              incomingMessage.media = {
                mimetype: media.mimetype,
                filename: media.filename || undefined,
                data: media.data,
              };
            }
          } catch (error) {
            this.logger.debug('Skipping media download due to wwebjs internal error', String(error));
          }
        }

        // Handle quoted message
        if (msg.hasQuotedMsg) {
          try {
            const quoted = await msg.getQuotedMessage();
            incomingMessage.quotedMessage = {
              id: quoted.id._serialized,
              body: quoted.body,
            };
          } catch (error) {
            this.logger.error('Error getting quoted message', String(error));
          }
        }

        this.callbacks.onMessage?.(incomingMessage);
      } catch (error) {
        this.logger.error('Error processing incoming message', String(error));
      }
    });

    this.client.on('message_ack', (msg, ack) => {
      this.callbacks.onMessageAck?.(msg.id._serialized, ack);
    });

    this.client.on('disconnected', reason => {
      this.setStatus(EngineStatus.DISCONNECTED);
      this.callbacks.onDisconnected?.(reason);
    });

    this.client.on('auth_failure', () => {
      this.setStatus(EngineStatus.FAILED);
      this.callbacks.onDisconnected?.('Authentication failed');
    });
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.callbacks.onStateChanged?.(status);
    this.emit('stateChanged', status);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        // Use destroy instead of logout to preserve session data
        // This allows reconnecting without needing to scan QR again
        await this.client.destroy();
      } catch (error) {
        this.logger.warn('Destroy client failed:', String(error));
        // Already destroyed or not initialized - ignore
      }
      this.client = null;
      this.setStatus(EngineStatus.DISCONNECTED);
    }
  }

  async logout(): Promise<void> {
    if (this.client) {
      try {
        // Logout clears session data - user will need to scan QR again
        await this.client.logout();
      } catch (error) {
        this.logger.warn('Logout failed:', String(error));
        // Fall back to destroy if logout fails
        try {
          await this.client.destroy();
        } catch (destroyError) {
          this.logger.warn('Client destroy also failed during logout fallback', String(destroyError));
        }
      }
      this.client = null;
      this.setStatus(EngineStatus.DISCONNECTED);
    }
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.setStatus(EngineStatus.DISCONNECTED);
    }
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  getQRCode(): string | null {
    return this.qrCode;
  }

  getPhoneNumber(): string | null {
    return this.phoneNumber;
  }

  getPushName(): string | null {
    return this.pushName;
  }

  async sendTextMessage(chatId: string, text: string, options?: { linkPreview?: boolean }): Promise<MessageResult> {
    this.ensureReady();

    // [NativePreviewCapture] Snapshot WAWebLinkPreviewChatAction before any sendMessage runs.
    // Reset the guard flag so the capture is installed fresh each time.
    if (this.client?.pupPage && options?.linkPreview !== false) {
      try {
        await this.client.pupPage.evaluate(() => {
          const mod = (window as any).require('WAWebLinkPreviewChatAction');
          if (!mod) return;
          // Reset so we can install a fresh capture
          (mod as any).__nativePreviewCaptured = false;
          (window as any).__lastNativePreview = undefined;
          
          const orig = mod.getLinkPreview.bind(mod);
          mod.getLinkPreview = (link: any) => {
            // Restore original immediately (one-shot capture)
            mod.getLinkPreview = orig;
            (mod as any).__nativePreviewCaptured = true;
            const result = orig(link);
            result.then((preview: any) => {
              if (preview && preview.data) {
                const href = link?.href || link?.url || (typeof link === 'string' ? link : '');
                const keys = Object.keys(preview.data);
                (window as any).__lastNativePreview = {
                  url: href,
                  keys: keys,
                  data: JSON.parse(JSON.stringify(preview, (k: string, v: any) => {
                    if (k === 'thumbnail' && typeof v === 'string') return `<base64:${v.length}chars>`;
                    return v;
                  }))
                };
              }
            }).catch(() => {});
            return result;
          };
        });
      } catch {
        // Best-effort capture, ignore failures
      }
    }

    const msg = await this.client!.sendMessage(chatId, text, {
      linkPreview: options?.linkPreview !== false,
      waitUntilMsgSent: true,
    });

    // Read back the capture result (wait a beat for the async getLinkPreview to complete)
    if (this.client?.pupPage) {
      try {
        await new Promise(r => setTimeout(r, 2000));
        const captureResult = await this.client.pupPage.evaluate(() => {
          const r = (window as any).__lastNativePreview;
          (window as any).__lastNativePreview = undefined;
          return r || null;
        });
        if (captureResult) {
          this.logger.log('[NativePreviewCapture] URL: ' + captureResult.url.slice(0, 120) + ' | keys: ' + captureResult.keys.join(','));
          this.logger.log('[NativePreviewCapture] full: ' + JSON.stringify(captureResult.data));
        } else {
          this.logger.log('[NativePreviewCapture] No capture result (link may not have triggered getLinkPreview)');
        }
      } catch {
        // Best-effort read-back
      }
    }

    return {
      id: msg?.id?._serialized || '',
      timestamp: msg?.timestamp || Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Makes WA's native link preview work for WAF-blocked URLs by intercepting
   * the page URL request at Puppeteer level and serving our pre-fetched HTML.
   *
   * How it works:
   * 1. We register a Puppeteer request interception via page.route() for the
   *    exact article URL.
   * 2. When WA's internal getLinkPreview calls fetch()/XHR for that URL,
   *    Puppeteer intercepts and returns our pre-fetched HTML.
   * 3. WA's native pipeline runs completely: it parses the OG tags from our
   *    HTML, downloads the og:image via its own mechanism (which may succeed
   *    on a different CDN endpoint), uploads the image to WA's media CDN,
   *    and returns a proper banner preview with thumbnailDirectPath etc.
   *
   * No monkey-patching needed — WA does everything natively.
   * The route is automatically removed after first match (one-shot).
   */
  async warmUpLinkPreview(
    url: string,
    previewData: {
      title: string;
      description: string;
      pageHtml?: string;
      jpegThumbnailBase64?: string;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
    },
  ): Promise<void> {
    if (!this.client || !this.client.pupPage) {
      this.logger.warn('[LinkPreview] skipped: client or pupPage not available');
      return;
    }

    if (!previewData.pageHtml) {
      this.logger.warn('[LinkPreview] No pageHtml — falling back to monkey-patch');
      await this._startLegacyPatch(url, previewData);
      return;
    }

    this.logger.log(`[LinkPreview] Request interception for: ${url}`);

    const page = this.client.pupPage;

    // Forward the page's console to our Node logs once per page. The fetch
    // override below logs every request via console.log; without this they'd
    // be invisible in the browser context.
    if (!this.consoleForwardedPages.has(page)) {
      this.consoleForwardedPages.add(page);
      page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('[LinkPreview]') || text.startsWith('[FetchTrace]')) {
          this.logger.log(`[PageConsole] ${text}`);
        }
      });
    }

    // Override window.fetch inside the page to intercept the article URL request.
    // WA's native getLinkPreview code calls fetch() to get the page HTML.
    // By serving our pre-fetched HTML, the native pipeline runs completely:
    // parses OG tags, downloads og:image, uploads to WA CDN → banner preview.
    try {
      await page.evaluate(
        async (opts: { targetUrl: string; html: string }) => {
          const originalFetch = window.fetch.bind(window);
          let intercepted = false;
          let fetchSeq = 0;

          window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const seq = ++fetchSeq;
            const reqUrl = typeof input === 'string' ? input :
              input instanceof Request ? input.url : input.toString();
            const normalizedReq = reqUrl.replace(/\/$/, '').split('#')[0].split('?')[0];
            const normalizedTarget = opts.targetUrl.replace(/\/$/, '').split('#')[0].split('?')[0];
            const matched = normalizedReq === normalizedTarget || normalizedReq.startsWith(normalizedTarget);

            // One-shot intercept: if request matches our article URL
            if (matched && !intercepted) {
              intercepted = true;
              console.log(`[FetchTrace] #${seq} INTERCEPTED match url=${reqUrl} target=${opts.targetUrl}`);
              console.log('[LinkPreview] Intercepted fetch, serving pre-fetched HTML');
              return new Response(opts.html, {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              });
            }

            console.log(`[FetchTrace] #${seq} passthrough url=${reqUrl} target=${opts.targetUrl} matched=${matched}`);
            return originalFetch(input, init);
          };

          console.log('[LinkPreview] fetch override installed for:', opts.targetUrl.slice(0, 80));
        },
        { targetUrl: url, html: previewData.pageHtml }
      );
      this.logger.log(`[LinkPreview] fetch override active for ${url}`);
    } catch (e) {
      this.logger.warn('[LinkPreview] fetch override failed, falling back to legacy patch:', String(e));
      await this._startLegacyPatch(url, previewData);
    }
  }

  /**
   * Legacy monkey-patch fallback — kept as insurance in case the Puppeteer
   * request interception approach doesn't work for some page.
   */
  private async _startLegacyPatch(
    url: string,
    previewData: {
      title: string;
      description: string;
      jpegThumbnailBase64?: string;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
    },
  ): Promise<void> {
    if (!this.client || !this.client.pupPage) return;
    try {
      const page = this.client.pupPage;
      await page.evaluate(
        async (linkUrl: string, preview: { 
          title: string; 
          description: string; 
          jpegThumbnailBase64?: string;
          thumbnailWidth?: number;
          thumbnailHeight?: number;
        }) => {
          const mod = (window as any).require('WAWebLinkPreviewChatAction');
          if (!mod) return;
          const original = mod.getLinkPreview.bind(mod);
          const targetHostname = new URL(linkUrl).hostname;

          mod.getLinkPreview = (link: any) => {
            const href: string = link?.href || link?.url || (typeof link === 'string' ? link : '');
            if (href && href.includes(targetHostname)) {
              const previewData: any = {
                matchedText: linkUrl,
                title: preview.title || '',
                description: preview.description || '',
                canonicalUrl: linkUrl,
                richPreviewType: 0,
                doNotPlayInline: false,
                isLoading: false,
                thumbnail: preview.jpegThumbnailBase64,
                psp: null,
              };
              if (preview.thumbnailWidth) previewData.thumbnailWidth = preview.thumbnailWidth;
              if (preview.thumbnailHeight) previewData.thumbnailHeight = preview.thumbnailHeight;
              return Promise.resolve({ url: linkUrl, data: previewData });
            }
            // [NativePreviewCapture]
            const nativeResult = original(link);
            nativeResult.then((native: any) => {
              if (native && native.data) {
                console.log('[NativePreviewCapture] URL:', href, '| keys:', Object.keys(native.data).join(','));
                console.log('[NativePreviewCapture] full:', JSON.stringify(native, (k, v) => {
                  if (k === 'thumbnail' && typeof v === 'string') return `<base64:${v.length}chars>`;
                  return v;
                }));
              }
            }).catch(() => {});
            return nativeResult;
          };
        },
        url,
        previewData,
      );
    } catch (e) {
      this.logger.warn('[LinkPreview] Legacy patch failed:', String(e));
    }
  }


  async sendImageMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media);
  }

  /**
   * Send multiple media files as a single album message in WhatsApp.
   * The text is applied as the caption on the album.
   */
  async sendAlbumMessage(chatId: string, mediaArray: MediaInput[], caption?: string): Promise<MessageResult> {
    this.ensureReady();

    const messageMediaArray = await Promise.all(
      mediaArray.map(async (media) => {
        if (typeof media.data === 'string') {
          if (media.data.startsWith('http://') || media.data.startsWith('https://')) {
            return MessageMedia.fromUrl(media.data);
          }
          return new MessageMedia(media.mimetype, media.data, media.filename);
        }
        return new MessageMedia(media.mimetype, media.data.toString('base64'), media.filename);
      })
    );

    const options: any = {
      waitUntilMsgSent: true,
    };
    if (caption) {
      options.caption = caption;
    }

    const msg = await (this.client as any).sendMessage(chatId, messageMediaArray, options);

    return {
      id: msg?.id?._serialized || `unknown_${Date.now()}`,
      timestamp: msg?.timestamp || Math.floor(Date.now() / 1000),
    };
  }

  async sendVideoMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media);
  }

  async sendAudioMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media);
  }

  async sendDocumentMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media);
  }

  private async sendMediaMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    this.ensureReady();

    let messageMedia: MessageMedia;

    if (typeof media.data === 'string') {
      if (media.data.startsWith('http://') || media.data.startsWith('https://')) {
        // URL
        messageMedia = await MessageMedia.fromUrl(media.data);
      } else {
        // Base64
        messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
      }
    } else {
      // Buffer
      messageMedia = new MessageMedia(media.mimetype, media.data.toString('base64'), media.filename);
    }

    const msg = await this.client!.sendMessage(chatId, messageMedia, {
      caption: media.caption,
      waitUntilMsgSent: true,
    });

    return {
      id: msg?.id?._serialized || `unknown_${Date.now()}`,
      timestamp: msg?.timestamp || Math.floor(Date.now() / 1000),
    };
  }

  async getContacts(): Promise<Contact[]> {
    this.ensureReady();
    const contacts = await this.client!.getContacts();

    return contacts.map(c => ({
      id: c.id._serialized,
      name: c.name || undefined,
      pushName: c.pushname || undefined,
      number: c.number,
      isMyContact: c.isMyContact,
      isBlocked: c.isBlocked,
    }));
  }

  async getContactById(contactId: string): Promise<Contact | null> {
    this.ensureReady();
    try {
      const contact = await this.client!.getContactById(contactId);
      return {
        id: contact.id._serialized,
        name: contact.name || undefined,
        pushName: contact.pushname || undefined,
        number: contact.number,
        isMyContact: contact.isMyContact,
        isBlocked: contact.isBlocked,
      };
    } catch (error) {
      this.logger.warn(`Failed to get contact: ${contactId}`, String(error));
      return null;
    }
  }

  async checkNumberExists(number: string): Promise<boolean> {
    this.ensureReady();
    const numberId = await this.client!.getNumberId(number);
    return numberId !== null;
  }

  async getCommunities(): Promise<Group[]> {
    // whatsapp-web.js v1.34 does not expose communities natively.
    // Communities are created manually via the dashboard and linked to groups.
    return [];
  }

  async getGroups(): Promise<Group[]> {
    this.ensureReady();
    
    let chats: any[] = [];
    let attempts = 0;
    let usedFallback = false;
    let fallbackResult: { groups: Group[]; module?: string; error?: string } | Group[] = [];

    while (attempts < 3) {
      try {
        chats = await this.client!.getChats();
        break; // Success
      } catch (err) {
        attempts++;
        
if (attempts >= 3) {
          this.logger.debug('wwebjs native getChats() failed (this is expected on newer WhatsApp versions). Proceeding to raw fallback...', String(err));
          this.logger.log('Attempting raw pupPage.evaluate fallback for groups...');
          try {
            // Direct robust fallback if whatsapp-web.js getChats() is broken (e.g. 'r: r' error)
            const page = (this.client as any).pupPage;
            if (page) {
              fallbackResult = await page.evaluate(() => {
                // @ts-ignore
                if (!window.require) return { groups: [], error: 'window.require not available' };
                
                // Try multiple possible module names for WhatsApp Web internal modules
                const moduleCandidates = ['WAWebCollections', 'WACollections', 'Store'];
                let foundModule = null;
                let ChatCollection;
                
                for (const modName of moduleCandidates) {
                  try {
                    // @ts-ignore
                    const mod = window.require(modName);
                    if (mod && mod.Chat) {
                      ChatCollection = mod.Chat;
                      foundModule = modName;
                      break;
                    }
                  } catch (e) {
                    // Continue to next candidate
                  }
                }
                
                if (!ChatCollection) {
                  console.warn(`[getGroups] No chat collection found. Tried: ${moduleCandidates.join(', ')}`);
                  return { groups: [], error: 'no_chat_collection' };
                }
                
                console.log(`[getGroups] Using chat collection from module: ${foundModule}`);
                const allChats = ChatCollection.getModelsArray();
                const groups = allChats
                  .filter((c: any) => c.isGroup || (c.id && c.id._serialized && c.id._serialized.endsWith('@g.us')))
                  .map((c: any) => {
                    let pCount = undefined;
                    let isAdmin = false;

                    try {
                      if (c.groupMetadata) {
                         pCount = c.groupMetadata.participants ? c.groupMetadata.participants.length : undefined;
                         
                         // Try to find Contact from the same module
                         // @ts-ignore
                         let Contact;
                         for (const modName of moduleCandidates) {
                           try {
                             // @ts-ignore
                             const mod = window.require(modName);
                             if (mod && mod.Contact) {
                               Contact = mod.Contact;
                               break;
                             }
                           } catch (e) {}
                         }
                         
                         if (Contact) {
                           const me = Contact.getModelsArray().find((x: any) => x.isMe);
                           if (me && me.id) {
                              const meId = me.id._serialized || me.id;
                              const myParticipant = c.groupMetadata.participants.find((p: any) => 
                                p.id === meId || (p.id && p.id._serialized === meId)
                              );
                              if (myParticipant && (myParticipant.isAdmin || myParticipant.isSuperAdmin)) {
                                isAdmin = true;
                              }
                           }
                         }
                       }
                    } catch (ignore) {}

                    return {
                      id: c.id && c.id._serialized ? c.id._serialized : c.id,
                      name: c.name || c.title || c.formattedTitle || (c.id ? c.id._serialized : 'Unknown'),
                      participantsCount: pCount,
                      isAdmin: isAdmin
                    };
                  });
                  
                  return { groups, module: foundModule };
              });
              
              // Type guard for the result object
              if (fallbackResult && typeof fallbackResult === 'object' && 'groups' in fallbackResult) {
                const result = fallbackResult as { groups: Group[]; module?: string; error?: string };
                if (result.error) {
                  this.logger.warn(`Fallback getGroups failed: ${result.error}`);
                } else if (result.groups && result.groups.length > 0) {
                  this.logger.log(`Fallback getGroups succeeded using module: ${result.module}, found ${result.groups.length} groups`);
                  usedFallback = true;
                  return result.groups;
                }
              }
              break;
            }
          } catch (fallbackErr) {
            this.logger.error('Fallback getGroups evaluation also failed', String(fallbackErr));
          }
          return [];
        }
        // Wait 2 seconds before retrying
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Filter only group chats (use fallback check for @g.us if isGroup is missing)
    const groups = chats.filter(chat => chat.isGroup || chat.id?._serialized?.endsWith('@g.us'));

    return groups.map(g => {
      const groupChat = g as unknown as any;
      return {
        id: g.id._serialized,
        name: g.name || g.id._serialized, // Fallback name to avoid DB null constraint errors
        participantsCount: groupChat.participants?.length,
        isAdmin: groupChat.participants?.some(
          (p: any) => p.isAdmin && p.id._serialized === this.client?.info?.wid?._serialized,
        ),
      };
    });
  }

  // ============= Phase 3: Extended Messaging =============

  async sendLocationMessage(chatId: string, location: LocationInput): Promise<MessageResult> {
    this.ensureReady();
    // Import Location class dynamically from whatsapp-web.js
    const module = await import('whatsapp-web.js');
    const Location = module.Location || module.default?.Location;

    const loc = new Location(location.latitude, location.longitude, {
      name: location.description || '',
      address: location.address || '',
    });
    const msg = await this.client!.sendMessage(chatId, loc);
    return {
      id: msg.id._serialized,
      timestamp: msg.timestamp,
    };
  }

  async sendContactMessage(chatId: string, contact: ContactCard): Promise<MessageResult> {
    this.ensureReady();
    // Create vCard format
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${contact.name}`,
      `TEL;type=CELL;type=VOICE;waid=${contact.number}:+${contact.number}`,
      'END:VCARD',
    ].join('\n');

    const msg = await this.client!.sendMessage(chatId, vcard, {
      parseVCards: true,
    });
    return {
      id: msg.id._serialized,
      timestamp: msg.timestamp,
    };
  }

  async sendStickerMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    this.ensureReady();
    let messageMedia: MessageMedia;

    if (typeof media.data === 'string') {
      if (media.data.startsWith('http://') || media.data.startsWith('https://')) {
        messageMedia = await MessageMedia.fromUrl(media.data);
      } else {
        messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
      }
    } else {
      messageMedia = new MessageMedia(media.mimetype, media.data.toString('base64'), media.filename);
    }

    const msg = await this.client!.sendMessage(chatId, messageMedia, {
      sendMediaAsSticker: true,
    });
    return {
      id: msg.id._serialized,
      timestamp: msg.timestamp,
    };
  }

  async replyToMessage(chatId: string, quotedMsgId: string, text: string): Promise<MessageResult> {
    this.ensureReady();
    // Find the message to quote
    const chat = await this.client!.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 });
    const quotedMsg = messages.find(m => m.id._serialized === quotedMsgId);

    if (!quotedMsg) {
      throw new Error(`Message ${quotedMsgId} not found`);
    }

    const msg = await quotedMsg.reply(text);
    return {
      id: msg.id._serialized,
      timestamp: msg.timestamp,
    };
  }

  async forwardMessage(fromChatId: string, toChatId: string, messageId: string): Promise<MessageResult> {
    this.ensureReady();
    const chat = await this.client!.getChatById(fromChatId);
    const messages = await chat.fetchMessages({ limit: 100 });
    const msgToForward = messages.find(m => m.id._serialized === messageId);

    if (!msgToForward) {
      throw new Error(`Message ${messageId} not found`);
    }

    await msgToForward.forward(toChatId);
    // forward() returns void, so we generate a result based on original message
    return {
      id: `fwd_${messageId}`,
      timestamp: Date.now(),
    };
  }

  // ============= Phase 3: Group Management =============

  async getGroupInfo(groupId: string): Promise<GroupInfo | null> {
    this.ensureReady();
    try {
      const chat = await this.client!.getChatById(groupId);
      if (!chat.isGroup) {
        return null;
      }
      const groupChat = chat as unknown as GroupChat;
      const participants: GroupParticipant[] = (groupChat.participants || []).map(p => ({
        id: String(p.id._serialized),
        number: String(p.id.user),
        name: p.name ? String(p.name) : undefined,
        isAdmin: Boolean(p.isAdmin),
        isSuperAdmin: Boolean(p.isSuperAdmin),
      }));

      return {
        id: chat.id._serialized,
        name: chat.name,
        description: groupChat.description ? String(groupChat.description) : undefined,
        owner: groupChat.owner?._serialized ? String(groupChat.owner._serialized) : undefined,
        createdAt: groupChat.createdAt,
        participants,
        isReadOnly: Boolean(groupChat.isReadOnly),
        isAnnounce: Boolean(groupChat.isAnnounce),
      };
    } catch (error) {
      this.logger.warn(`Failed to get group: ${groupId}`, String(error));
      return null;
    }
  }

  async createGroup(name: string, participants: string[]): Promise<Group> {
    this.ensureReady();
    // Ensure participant IDs are in correct format
    const participantIds = participants.map(p => (p.includes('@') ? p : `${p}@c.us`));
    const result = await this.client!.createGroup(name, participantIds);

    const groupId = String((result as unknown as GroupCreateResult).gid._serialized);
    return {
      id: groupId,
      name: name,
      participantsCount: participants.length,
    };
  }

  async addParticipants(groupId: string, participants: string[]): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error('Chat is not a group');
    }
    const participantIds = participants.map(p => (p.includes('@') ? p : `${p}@c.us`));
    await (chat as unknown as GroupChat).addParticipants(participantIds);
  }

  async removeParticipants(groupId: string, participants: string[]): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error('Chat is not a group');
    }
    const participantIds = participants.map(p => (p.includes('@') ? p : `${p}@c.us`));
    await (chat as unknown as GroupChat).removeParticipants(participantIds);
  }

  async promoteParticipants(groupId: string, participants: string[]): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error('Chat is not a group');
    }
    const participantIds = participants.map(p => (p.includes('@') ? p : `${p}@c.us`));
    await (chat as unknown as GroupChat).promoteParticipants(participantIds);
  }

  async demoteParticipants(groupId: string, participants: string[]): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error('Chat is not a group');
    }
    const participantIds = participants.map(p => (p.includes('@') ? p : `${p}@c.us`));
    await (chat as unknown as GroupChat).demoteParticipants(participantIds);
  }

  async leaveGroup(groupId: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error('Chat is not a group');
    }
    await (chat as unknown as GroupChat).leave();
  }

  async setGroupSubject(groupId: string, subject: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error('Chat is not a group');
    }
    await (chat as unknown as GroupChat).setSubject(subject);
  }

  async setGroupDescription(groupId: string, description: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error('Chat is not a group');
    }
    await (chat as unknown as GroupChat).setDescription(description);
  }

  // Reactions (Phase 3)
  async reactToMessage(chatId: string, messageId: string, emoji: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 });
    const message = messages.find(m => m.id._serialized === messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found in chat ${chatId}`);
    }
    await (message as MessageWithReactions).react(emoji);
    this.logger.log(`Reacted to message ${messageId} with ${emoji || '(removed)'}`);
  }

  async getMessageReactions(chatId: string, messageId: string): Promise<MessageReaction[]> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 });
    const message = messages.find(m => m.id._serialized === messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found in chat ${chatId}`);
    }
    const msgWithReactions = message as MessageWithReactions;
    if (!msgWithReactions.hasReaction) {
      return [];
    }
    const reactions = await msgWithReactions.getReactions();
    if (!reactions) {
      return [];
    }
    // Map reactions to our interface format
    const result: MessageReaction[] = [];

    for (const r of reactions) {
      result.push({
        emoji: String(r.id),
        senders: (r.senders || []).map(s => ({
          senderId: String(s.senderId),
          emoji: String(s.reaction),
          timestamp: Number(s.timestamp),
        })),
      });
    }
    return result;
  }

  // Labels (Phase 3) - WhatsApp Business only
  async getLabels(): Promise<Label[]> {
    this.ensureReady();
    const labels = await (this.client as unknown as BusinessClient).getLabels();
    if (!labels) {
      return [];
    }

    return labels.map(label => ({
      id: String(label.id),
      name: String(label.name),
      hexColor: String(label.hexColor),
    }));
  }

  async getLabelById(labelId: string): Promise<Label | null> {
    this.ensureReady();
    const label = await (this.client as unknown as BusinessClient).getLabelById(labelId);
    if (!label) {
      return null;
    }
    return {
      id: String(label.id),
      name: String(label.name),
      hexColor: String(label.hexColor),
    };
  }

  async getChatLabels(chatId: string): Promise<Label[]> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    const labels = await (chat as unknown as GroupChat).getLabels();
    if (!labels) {
      return [];
    }

    return labels.map(label => ({
      id: String(label.id),
      name: String(label.name),
      hexColor: String(label.hexColor),
    }));
  }

  async addLabelToChat(chatId: string, labelId: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    await (chat as unknown as GroupChat).addLabel(labelId);
    this.logger.log(`Added label ${labelId} to chat ${chatId}`);
  }

  async removeLabelFromChat(chatId: string, labelId: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    await (chat as unknown as GroupChat).removeLabel(labelId);
    this.logger.log(`Removed label ${labelId} from chat ${chatId}`);
  }

  // Channels/Newsletter (Phase 3)
  async getSubscribedChannels(): Promise<Channel[]> {
    this.ensureReady();
    const channels = await (this.client as unknown as BusinessClient).getChannels();
    if (!channels) {
      return [];
    }
    return channels.map((ch: WwjsChannelData) => ({
      id: String(typeof ch.id === 'object' ? ch.id._serialized : ch.id),
      name: String(ch.name || ''),
      description: ch.description ? String(ch.description) : undefined,
      inviteCode: ch.inviteCode ? String(ch.inviteCode) : undefined,
      subscriberCount: ch.subscriberCount ? Number(ch.subscriberCount) : undefined,
      verified: ch.verified ? Boolean(ch.verified) : undefined,
    }));
  }

  async getChannelById(channelId: string): Promise<Channel | null> {
    this.ensureReady();
    try {
      const ch = await (this.client as unknown as BusinessClient).getChannelById(channelId);
      if (!ch) {
        return null;
      }
      return {
        id: String(typeof ch.id === 'object' ? ch.id._serialized : ch.id),
        name: String(ch.name || ''),
        description: ch.description ? String(ch.description) : undefined,
        inviteCode: ch.inviteCode ? String(ch.inviteCode) : undefined,
        subscriberCount: ch.subscriberCount ? Number(ch.subscriberCount) : undefined,
        verified: ch.verified ? Boolean(ch.verified) : undefined,
      };
    } catch (error) {
      this.logger.warn(`Failed to get channel: ${channelId}`, String(error));
      return null;
    }
  }

  async subscribeToChannel(inviteCode: string): Promise<Channel> {
    this.ensureReady();
    const ch = await (this.client as unknown as BusinessClient).subscribeToChannel(inviteCode);
    this.logger.log(`Subscribed to channel with invite code: ${inviteCode}`);
    return {
      id: String(typeof ch.id === 'object' ? ch.id._serialized : ch.id),
      name: String(ch.name || ''),
      description: ch.description ? String(ch.description) : undefined,
    };
  }

  async unsubscribeFromChannel(channelId: string): Promise<void> {
    this.ensureReady();
    await (this.client as unknown as BusinessClient).unsubscribeFromChannel(channelId);
    this.logger.log(`Unsubscribed from channel: ${channelId}`);
  }

  async getChannelMessages(channelId: string, limit: number = 50): Promise<ChannelMessage[]> {
    this.ensureReady();
    try {
      const ch = await (this.client as unknown as BusinessClient).getChannelById(channelId);
      if (!ch) {
        throw new Error(`Channel ${channelId} not found`);
      }
      const messages = await ch.fetchMessages({ limit });
      if (!messages) {
        return [];
      }
      return messages.map(msg => ({
        id: String(typeof msg.id === 'object' ? msg.id._serialized : msg.id),
        body: String(msg.body || ''),
        timestamp: Number(msg.timestamp),
        hasMedia: Boolean(msg.hasMedia),
        mediaUrl: msg.mediaUrl ? String(msg.mediaUrl) : undefined,
      }));
    } catch (error) {
      this.logger.error(`Failed to get channel messages: ${String(error)}`);
      return [];
    }
  }

  // ========== Gap Quick Wins Implementation ==========

  // Delete Message
  async deleteMessage(chatId: string, messageId: string, forEveryone: boolean = true): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 });
    const message = messages.find(m => m.id._serialized === messageId || m.id.id === messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found in chat ${chatId}`);
    }
    await message.delete(forEveryone);
    this.logger.log(`Deleted message ${messageId} from chat ${chatId} (forEveryone: ${forEveryone})`);
  }

  async editMessage(chatId: string, messageId: string, text: string): Promise<MessageResult> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 });
    const message = messages.find(m => m.id._serialized === messageId || m.id.id === messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found in chat ${chatId}`);
    }
    const edited = await message.edit(text);
    this.logger.log(`Edited message ${messageId} in chat ${chatId}`);
    return {
      id: edited?.id?._serialized || messageId,
      timestamp: edited?.timestamp || Date.now(),
    };
  }

  // Get Profile Picture
  async getProfilePicture(contactId: string): Promise<string | null> {
    this.ensureReady();
    try {
      const url = await this.client!.getProfilePicUrl(contactId);
      return url || null;
    } catch (error) {
      this.logger.warn(`Failed to get profile picture for ${contactId}: ${String(error)}`);
      return null;
    }
  }

  // Block Contact
  async blockContact(contactId: string): Promise<void> {
    this.ensureReady();
    const contact = await this.client!.getContactById(contactId);
    await contact.block();
    this.logger.log(`Blocked contact ${contactId}`);
  }

  // Unblock Contact
  async unblockContact(contactId: string): Promise<void> {
    this.ensureReady();
    const contact = await this.client!.getContactById(contactId);
    await contact.unblock();
    this.logger.log(`Unblocked contact ${contactId}`);
  }

  // Get Group Invite Code
  async getGroupInviteCode(groupId: string): Promise<string> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error(`${groupId} is not a group`);
    }
    const inviteCode = await (chat as unknown as GroupChat).getInviteCode();
    this.logger.log(`Got invite code for group ${groupId}`);
    return String(inviteCode);
  }

  // Revoke Group Invite Code
  async revokeGroupInviteCode(groupId: string): Promise<string> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) {
      throw new Error(`${groupId} is not a group`);
    }
    const newCode = await (chat as unknown as GroupChat).revokeInvite();
    this.logger.log(`Revoked invite code for group ${groupId}, new code generated`);
    return String(newCode);
  }

  // ========== Status/Stories (Phase 3) ==========
  // Note: These are stub implementations - whatsapp-web.js has limited Status API support
  /* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */

  async getContactStatuses(): Promise<Status[]> {
    this.ensureReady();
    // whatsapp-web.js has limited Status API support
    // This is a stub that can be enhanced when the library adds support
    this.logger.warn('getContactStatuses not fully implemented in whatsapp-web.js');
    return [];
  }

  async getContactStatus(_contactId: string): Promise<Status[]> {
    this.ensureReady();
    this.logger.warn('getContactStatus not fully implemented in whatsapp-web.js');
    return [];
  }

  async postTextStatus(_text: string, _options?: TextStatusOptions): Promise<StatusResult> {
    this.ensureReady();
    // whatsapp-web.js doesn't have native status posting
    // This would require using the underlying WhatsApp Web API directly
    throw new Error('postTextStatus not yet implemented in whatsapp-web.js adapter');
  }

  async postImageStatus(_media: MediaInput, _caption?: string): Promise<StatusResult> {
    this.ensureReady();
    throw new Error('postImageStatus not yet implemented in whatsapp-web.js adapter');
  }

  async postVideoStatus(_media: MediaInput, _caption?: string): Promise<StatusResult> {
    this.ensureReady();
    throw new Error('postVideoStatus not yet implemented in whatsapp-web.js adapter');
  }

  async deleteStatus(_statusId: string): Promise<void> {
    this.ensureReady();
    throw new Error('deleteStatus not yet implemented in whatsapp-web.js adapter');
  }

  // ========== Catalog (Phase 3) ==========

  async getCatalog(): Promise<Catalog | null> {
    this.ensureReady();
    // whatsapp-web.js doesn't have native Catalog API support
    this.logger.warn('getCatalog not implemented in whatsapp-web.js adapter');
    return null;
  }

  async getProducts(_options?: ProductQueryOptions): Promise<PaginatedProducts> {
    this.ensureReady();
    this.logger.warn('getProducts not implemented in whatsapp-web.js adapter');
    return {
      products: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  }

  async getProduct(_productId: string): Promise<Product | null> {
    this.ensureReady();
    this.logger.warn('getProduct not implemented in whatsapp-web.js adapter');
    return null;
  }

  async sendProduct(_chatId: string, _productId: string, _body?: string): Promise<MessageResult> {
    this.ensureReady();
    throw new Error('sendProduct not yet implemented in whatsapp-web.js adapter');
  }

  async sendCatalog(_chatId: string, _body?: string): Promise<MessageResult> {
    this.ensureReady();
    throw new Error('sendCatalog not yet implemented in whatsapp-web.js adapter');
  }

  /* eslint-enable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */

  private ensureReady(): void {
    if (this.status !== EngineStatus.READY || !this.client) {
      throw new Error('WhatsApp client is not ready');
    }
  }
}
