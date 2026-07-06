export type Provider = 'ondevice' | 'api';

/** Map the stored `transcription_provider` setting to a provider; default
 *  on-device for null/empty/unknown. */
export function selectProvider(setting: string | null): Provider {
  return setting === 'api' ? 'api' : 'ondevice';
}
