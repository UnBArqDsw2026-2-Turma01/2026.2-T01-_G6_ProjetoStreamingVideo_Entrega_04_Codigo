// transmissao/canal — dono definido na #7.
export { StreamChannel, type StreamConfigCanal } from './observer/StreamChannel.js';
export type {
  IObserver,
  ISubject,
  SubjectState,
  StreamEvent,
  StreamEventType,
  StreamMetadata,
  StreamStatus,
  StreamingPlatform,
  ModerationPayload,
  ModerationSeverity,
  NotificationReport,
  NotificationResult,
} from './observer/interfaces.js';
export type { DispatchTelemetry, INotificationDispatchStrategy } from './strategy/interfaces.js';
export { AsynchronousConcurrentDispatchStrategy } from './strategy/AsynchronousConcurrentDispatchStrategy.js';
export { SynchronousBlockingDispatchStrategy } from './strategy/SynchronousBlockingDispatchStrategy.js';
export { AutoModObserver } from './observer/observers/AutoModObserver.js';
export { ChatRaidShieldObserver } from './observer/observers/ChatRaidShieldObserver.js';
export { CopyrightDMCAAudioObserver } from './observer/observers/CopyrightDMCAAudioObserver.js';
export { DiscordCrossPlatformWebhookObserver } from './observer/observers/DiscordCrossPlatformWebhookObserver.js';
export { DiscordWebhookObserver } from './observer/observers/DiscordWebhookObserver.js';
export { EmailNotificationObserver } from './observer/observers/EmailNotificationObserver.js';
export { HumanModeratorDashboardObserver } from './observer/observers/HumanModeratorDashboardObserver.js';
export { InAppLiveBadgeObserver } from './observer/observers/InAppLiveBadgeObserver.js';
export { KickPusherChannelObserver } from './observer/observers/KickPusherChannelObserver.js';
export { PiracyVideoRestreamObserver } from './observer/observers/PiracyVideoRestreamObserver.js';
export { PushNotificationObserver } from './observer/observers/PushNotificationObserver.js';
export { SafetyVisionModerationObserver } from './observer/observers/SafetyVisionModerationObserver.js';
export { SimulatedFollowerObserver } from './observer/observers/SimulatedFollowerObserver.js';
export { TwitchEventSubObserver } from './observer/observers/TwitchEventSubObserver.js';
export { YouTubeWebSubFCMObserver } from './observer/observers/YouTubeWebSubFCMObserver.js';
