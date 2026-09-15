import type { ClaimedNotificationDelivery } from './notificationDeliveryService';

export type NotificationProviderChannel = 'IN_APP' | 'EMAIL' | 'PUSH';

export interface NotificationProviderResult {
  providerMessageId?: string;
}

export interface NotificationProvider {
  readonly channel: NotificationProviderChannel;
  readonly name: string;
  send(delivery: ClaimedNotificationDelivery): Promise<NotificationProviderResult>;
}

/**
 * In-app delivery is represented by the durable notification delivery row.
 * The existing in-app notification UI can consume these records through the
 * notification API; no external provider is required.
 */
export class InAppNotificationProvider implements NotificationProvider {
  readonly channel = 'IN_APP' as const;
  readonly name = 'database';

  async send(delivery: ClaimedNotificationDelivery): Promise<NotificationProviderResult> {
    if (delivery.channel !== this.channel) {
      throw new Error(`Provider channel mismatch: expected ${this.channel}, received ${delivery.channel}`);
    }

    return { providerMessageId: delivery.id };
  }
}

/**
 * Explicit adapter placeholders prevent accidental production sends before a
 * real provider is configured. They fail closed and are safe to retry.
 */
export class UnconfiguredNotificationProvider implements NotificationProvider {
  constructor(
    readonly channel: NotificationProviderChannel,
    readonly name = 'unconfigured',
  ) {}

  async send(_delivery: ClaimedNotificationDelivery): Promise<NotificationProviderResult> {
    throw new Error(`Notification provider is not configured for channel ${this.channel}`);
  }
}

export interface NotificationProviderRegistry {
  get(channel: NotificationProviderChannel, provider?: string | null): NotificationProvider;
}

export class DefaultNotificationProviderRegistry implements NotificationProviderRegistry {
  private readonly providers = new Map<string, NotificationProvider>([
    ['IN_APP:database', new InAppNotificationProvider()],
  ]);

  get(channel: NotificationProviderChannel, provider?: string | null): NotificationProvider {
    return this.providers.get(`${channel}:${provider ?? (channel === 'IN_APP' ? 'database' : 'unconfigured')}`)
      ?? new UnconfiguredNotificationProvider(channel, provider ?? 'unconfigured');
  }
}
