const mockGetSetting = jest.fn();
const mockGetApiKey = jest.fn();

jest.mock('../src/db/settings', () => ({
  getSetting: (...a: unknown[]) => mockGetSetting(...a),
}));
jest.mock('../src/services/transcription/keychain', () => ({
  getApiKey: () => mockGetApiKey(),
}));

import {
  parseCleanupResponse,
  cleanUpIfEnabled,
} from '../src/services/transcription/cleanup';
import {TranscriptionError} from '../src/services/transcription/whisperApi';

const reply = (content: string) => ({choices: [{message: {content}}]});

describe('parseCleanupResponse', () => {
  it('returns the cleaned text and title', () => {
    const r = parseCleanupResponse(
      200,
      reply('{"text":"Katto pitää korjata.","title":"Katon korjaus"}'),
    );
    expect(r).toEqual({text: 'Katto pitää korjata.', title: 'Katon korjaus'});
  });

  it('tolerates a missing title', () => {
    expect(parseCleanupResponse(200, reply('{"text":"Hello there"}'))).toEqual({
      text: 'Hello there',
      title: null,
    });
  });

  it('caps an over-long title', () => {
    const r = parseCleanupResponse(
      200,
      reply(`{"text":"x","title":"${'a'.repeat(80)}"}`),
    );
    expect(r.title).toHaveLength(50);
  });

  it('rejects an empty rewrite rather than blanking the note', () => {
    expect(() => parseCleanupResponse(200, reply('{"text":"   "}'))).toThrow(TranscriptionError);
  });

  it('throws on non-JSON content', () => {
    expect(() => parseCleanupResponse(200, reply('sorry, I cannot'))).toThrow(TranscriptionError);
  });

  it('maps auth and rate-limit statuses', () => {
    expect(() => parseCleanupResponse(401, {})).toThrow(
      expect.objectContaining({kind: 'auth'}) as Error,
    );
    expect(() => parseCleanupResponse(429, {})).toThrow(
      expect.objectContaining({kind: 'rate'}) as Error,
    );
  });
});

describe('cleanUpIfEnabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSetting.mockResolvedValue('true');
    mockGetApiKey.mockResolvedValue('sk-test');
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve(reply('{"text":"Cleaned.","title":"Head"}')),
      }),
    ) as unknown as typeof fetch;
  });

  it('cleans up when the setting is on', async () => {
    expect(await cleanUpIfEnabled('raw')).toEqual({text: 'Cleaned.', title: 'Head'});
  });

  it('skips entirely when the setting is off', async () => {
    mockGetSetting.mockResolvedValue(null);
    expect(await cleanUpIfEnabled('raw')).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns null instead of throwing when there is no key', async () => {
    mockGetApiKey.mockResolvedValue(null);
    expect(await cleanUpIfEnabled('raw')).toBeNull();
  });

  it('returns null when the request fails', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await cleanUpIfEnabled('raw')).toBeNull();
  });
});
