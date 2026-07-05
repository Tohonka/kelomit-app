# Voice-note Transcription (Whisper API — Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a saved voice note be transcribed to editable text via the OpenAI Whisper API, stored per-clip, from the entry-detail screen.

**Architecture:** A provider-agnostic `transcribe(audioUri) → Promise<string>` seam under `src/services/transcription/`. Phase 1 wires it to a Whisper-API provider that uploads the existing `.m4a` (no audio conversion). The transcript is stored on the `entry_media` row (new nullable column), shown + edited under the `AudioPlayer` in `EntryDetailScreen`, with an opt-in "use as note text". API key lives in `react-native-keychain`, entered on a new Transcription settings screen.

**Tech Stack:** React Native 0.86 (New Arch), TypeScript, `@op-engineering/op-sqlite`, `react-native-keychain` (new), `react-i18next`, `@react-navigation/native-stack`, Jest (pure-logic tests only).

## Global Constraints

- Tests are pure-logic Jest files in root `__tests__/*.test.ts`. There is NO DB/component test harness — DB, screens, and native code are verified by `npm run check` (tsc) + on-device. Do not invent test infra.
- `npm run check` = `eslint . --max-warnings=0 && tsc --noEmit && jest --runInBand`. It must stay green.
- Every new user-facing string gets a key in BOTH `src/i18n/locales/en.ts` and `src/i18n/locales/fi.ts`.
- The API key must only ever exist in keychain + the request `Authorization` header. Never log it, never write it to SQLite, never hold it in component state longer than a submit.
- Schema bumps add a new versioned block in `src/db/migrations.ts`. Current schema is **v13**; this plan adds **v14**.
- Recording stays `.m4a` — `VoiceRecorder.tsx` is NOT modified.
- Follow existing patterns: settings sub-screens use `makeSettingsStyles`, register in `navigationTypes.ts` + `RootNavigator.tsx` + `SettingsScreen` `SECTIONS`.
- Native deps (`react-native-keychain`) require rebuild + uninstall→reinstall on device (sideload gotcha) — the implementer cannot device-verify; leave that to Tommi.

---

### Task 1: Add react-native-keychain + key store wrapper

**Files:**
- Modify: `package.json` (dependency)
- Create: `src/services/transcription/keychain.ts`

**Interfaces:**
- Produces: `getApiKey(): Promise<string | null>`, `setApiKey(key: string): Promise<void>`, `clearApiKey(): Promise<void>`.

- [ ] **Step 1: Install the dependency**

Run: `npm install react-native-keychain`
Expected: added to `package.json` dependencies, no peer-dep errors.

- [ ] **Step 2: Create the wrapper**

Create `src/services/transcription/keychain.ts`:

```ts
import * as Keychain from 'react-native-keychain';

// One dedicated keychain service for the OpenAI transcription key.
const SERVICE = 'kelomit.transcription.openai';

export async function setApiKey(key: string): Promise<void> {
  await Keychain.setGenericPassword('openai', key, {service: SERVICE});
}

export async function getApiKey(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({service: SERVICE});
  return creds ? creds.password : null;
}

export async function clearApiKey(): Promise<void> {
  await Keychain.resetGenericPassword({service: SERVICE});
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `react-native-keychain` ships no types, add `@types/react-native-keychain` — but v9+ bundles its own.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/services/transcription/keychain.ts
git commit -m "feat(transcription): add react-native-keychain + API key store"
```

---

### Task 2: Schema v14 — transcript column on entry_media

**Files:**
- Modify: `src/db/migrations.ts` (append v14 block)
- Modify: `src/types.ts` (`EntryMedia.transcript`)
- Modify: `src/db/entries.ts` (`rowToMedia`, new `updateEntryMedia`)

**Interfaces:**
- Produces: `EntryMedia.transcript: string | null`; `updateEntryMedia(mediaId: number, patch: {transcript?: string | null}): Promise<void>`.

- [ ] **Step 1: Add the migration**

In `src/db/migrations.ts`, append to the `migrations` array (after the `version: 13` block):

```ts
  {
    version: 14,
    up: [
      // Phase 1 voice transcription — store the speech-to-text result on the
      // voice attachment itself. Nullable, editable. No backfill: zero voice
      // clips exist yet.
      'ALTER TABLE entry_media ADD COLUMN transcript TEXT',
    ],
  },
```

- [ ] **Step 2: Extend the type**

In `src/types.ts`, add to the `EntryMedia` interface (near `duration_sec`):

```ts
  transcript: string | null;
```

- [ ] **Step 3: Map the column in rowToMedia**

In `src/db/entries.ts`, inside `rowToMedia`, add after the `duration_sec` line:

```ts
    transcript: (row.transcript as string | null) ?? null,
```

- [ ] **Step 4: Add updateEntryMedia**

In `src/db/entries.ts`, after `deleteEntryMedia`:

```ts
/** Patch a media attachment. Phase 1: transcript only. */
export async function updateEntryMedia(
  mediaId: number,
  patch: {transcript?: string | null},
): Promise<void> {
  if (patch.transcript === undefined) { return; }
  const db = getDB();
  await db.execute(
    "UPDATE entry_media SET transcript = ?, updated_at = datetime('now') WHERE id = ?;",
    [patch.transcript, mediaId],
  );
}
```

- [ ] **Step 5: Verify build + existing tests still pass**

Run: `npm run check`
Expected: lint clean, tsc clean, all existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations.ts src/types.ts src/db/entries.ts
git commit -m "feat(transcription): schema v14 transcript column + updateEntryMedia"
```

---

### Task 3: mergeTranscriptIntoBody util (TDD)

**Files:**
- Create: `src/utils/transcript.ts`
- Test: `__tests__/transcript.test.ts`

**Interfaces:**
- Produces: `mergeTranscriptIntoBody(body: string | null, transcript: string): string`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/transcript.test.ts`:

```ts
import {mergeTranscriptIntoBody} from '../src/utils/transcript';

describe('mergeTranscriptIntoBody', () => {
  it('fills an empty body with the transcript', () => {
    expect(mergeTranscriptIntoBody(null, 'hello')).toBe('hello');
    expect(mergeTranscriptIntoBody('', 'hello')).toBe('hello');
    expect(mergeTranscriptIntoBody('   ', 'hello')).toBe('hello');
  });

  it('appends on a new line when body has text', () => {
    expect(mergeTranscriptIntoBody('note', 'hello')).toBe('note\nhello');
  });

  it('trims surrounding whitespace on both sides', () => {
    expect(mergeTranscriptIntoBody('  note  ', '  hello  ')).toBe('note\nhello');
  });

  it('leaves body unchanged when transcript is blank', () => {
    expect(mergeTranscriptIntoBody('note', '   ')).toBe('note');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/transcript.test.ts`
Expected: FAIL — cannot find module `../src/utils/transcript`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/transcript.ts`:

```ts
/** Merge a transcript into an existing note body: fill if the body is empty,
 *  otherwise append on a new line. Both sides trimmed. */
export function mergeTranscriptIntoBody(
  body: string | null,
  transcript: string,
): string {
  const existing = (body ?? '').trim();
  const add = transcript.trim();
  if (!existing) { return add; }
  if (!add) { return existing; }
  return `${existing}\n${add}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/transcript.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/transcript.ts __tests__/transcript.test.ts
git commit -m "feat(transcription): mergeTranscriptIntoBody util"
```

---

### Task 4: Whisper API provider + transcribe seam (TDD on the parser)

**Files:**
- Create: `src/services/transcription/whisperApi.ts`
- Create: `src/services/transcription/index.ts`
- Test: `__tests__/whisperApi.test.ts`

**Interfaces:**
- Consumes: `getApiKey` (Task 1).
- Produces: `transcribe(audioUri: string): Promise<string>` (from `index.ts`); `TranscriptionError` (has `.kind`); `TranscriptionErrorKind`; and the pure `parseTranscriptionResponse(status, body)`.

- [ ] **Step 1: Write the failing test (pure parser only)**

Create `__tests__/whisperApi.test.ts`:

```ts
import {
  parseTranscriptionResponse,
  TranscriptionError,
} from '../src/services/transcription/whisperApi';

describe('parseTranscriptionResponse', () => {
  it('returns trimmed text on 200', () => {
    expect(parseTranscriptionResponse(200, {text: '  hi there  '})).toBe('hi there');
  });

  it('throws "other" on a 200 with no text field', () => {
    expect(() => parseTranscriptionResponse(200, {})).toThrow(TranscriptionError);
    try { parseTranscriptionResponse(200, {}); } catch (e) {
      expect((e as TranscriptionError).kind).toBe('other');
    }
  });

  it('maps 401 → auth', () => {
    try { parseTranscriptionResponse(401, {}); } catch (e) {
      expect((e as TranscriptionError).kind).toBe('auth');
    }
  });

  it('maps 429 → rate', () => {
    try { parseTranscriptionResponse(429, {}); } catch (e) {
      expect((e as TranscriptionError).kind).toBe('rate');
    }
  });

  it('maps other statuses → other', () => {
    try { parseTranscriptionResponse(500, {}); } catch (e) {
      expect((e as TranscriptionError).kind).toBe('other');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/whisperApi.test.ts`
Expected: FAIL — cannot find module `whisperApi`.

- [ ] **Step 3: Write whisperApi.ts**

Create `src/services/transcription/whisperApi.ts`:

```ts
import {getApiKey} from './keychain';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
// ponytail: whisper-1 is cheapest and auto-detects language (Finnish/English).
// Swap to gpt-4o-mini-transcribe or a self-hosted endpoint here if needed.
const MODEL = 'whisper-1';

export type TranscriptionErrorKind =
  | 'no-key'
  | 'auth'
  | 'rate'
  | 'network'
  | 'other';

export class TranscriptionError extends Error {
  kind: TranscriptionErrorKind;
  constructor(kind: TranscriptionErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'TranscriptionError';
  }
}

/** Pure: HTTP status + parsed JSON → transcript text, or a typed throw.
 *  Extracted so it is unit-testable without a network. */
export function parseTranscriptionResponse(status: number, body: unknown): string {
  if (status === 200) {
    const text = (body as {text?: unknown} | null)?.text;
    if (typeof text === 'string') { return text.trim(); }
    throw new TranscriptionError('other', 'Malformed transcription response');
  }
  if (status === 401) { throw new TranscriptionError('auth', 'Invalid API key'); }
  if (status === 429) { throw new TranscriptionError('rate', 'Rate limit or quota exceeded'); }
  throw new TranscriptionError('other', `Transcription failed (HTTP ${status})`);
}

/** Upload the .m4a to OpenAI Whisper and return the transcript text. */
export async function transcribe(audioUri: string): Promise<string> {
  const key = await getApiKey();
  if (!key) { throw new TranscriptionError('no-key', 'No API key set'); }

  const uri = audioUri.startsWith('file://') ? audioUri : `file://${audioUri}`;
  const form = new FormData();
  // RN FormData accepts this {uri,name,type} shape for file parts.
  form.append('file', {uri, name: 'clip.m4a', type: 'audio/m4a'} as unknown as Blob);
  form.append('model', MODEL);
  form.append('response_format', 'json');

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {Authorization: `Bearer ${key}`},
      body: form,
    });
  } catch (e) {
    throw new TranscriptionError('network', String(e));
  }
  const json: unknown = await res.json().catch(() => ({}));
  return parseTranscriptionResponse(res.status, json);
}
```

- [ ] **Step 4: Write the seam index.ts**

Create `src/services/transcription/index.ts`:

```ts
// Transcription seam. Phase 1: one provider (Whisper API). Later phases
// (on-device whisper.rn, custom endpoint) switch here behind this signature.
import {transcribe as whisperApiTranscribe} from './whisperApi';

export {TranscriptionError} from './whisperApi';
export type {TranscriptionErrorKind} from './whisperApi';

export function transcribe(audioUri: string): Promise<string> {
  return whisperApiTranscribe(audioUri);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/whisperApi.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Full check**

Run: `npm run check`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/services/transcription/whisperApi.ts src/services/transcription/index.ts __tests__/whisperApi.test.ts
git commit -m "feat(transcription): Whisper API provider + transcribe seam"
```

---

### Task 5: Transcription settings screen (key entry)

**Files:**
- Create: `src/screens/settings/TranscriptionSettings.tsx`
- Modify: `src/navigation/navigationTypes.ts` (add route)
- Modify: `src/navigation/RootNavigator.tsx` (register screen)
- Modify: `src/screens/SettingsScreen.tsx` (add SECTIONS entry + union type)
- Modify: `src/i18n/locales/en.ts` and `src/i18n/locales/fi.ts` (new `transcription` block)

**Interfaces:**
- Consumes: `getApiKey`, `setApiKey`, `clearApiKey` (Task 1).
- Produces: navigable route `TranscriptionSettings`.

- [ ] **Step 1: Add i18n keys (both locales)**

In `src/i18n/locales/en.ts`, add a top-level block (alongside `media:` etc.):

```ts
  transcription: {
    title: 'Transcription',
    subtitle: 'Speech-to-text for voice notes',
    provider: 'Provider: OpenAI Whisper API',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-...',
    keySet: 'Key saved',
    keyNotSet: 'No key set',
    save: 'Save key',
    clear: 'Clear key',
    saved: 'API key saved',
    cleared: 'API key cleared',
    transcribe: 'Transcribe',
    transcribing: 'Transcribing…',
    retranscribe: 'Re-transcribe',
    transcriptLabel: 'Transcript',
    useAsNote: 'Use as note text',
    errNoKey: 'Set an OpenAI API key first.',
    errAuth: 'API key was rejected. Check it in settings.',
    errRate: 'Rate limit or spend cap reached. Try later.',
    errNetwork: 'No connection. Check your network.',
    errOther: 'Transcription failed. Try again.',
    goToSettings: 'Open settings',
  },
```

In `src/i18n/locales/fi.ts`, add the same block translated:

```ts
  transcription: {
    title: 'Litterointi',
    subtitle: 'Puheesta tekstiksi äänimuistiinpanoille',
    provider: 'Palvelu: OpenAI Whisper API',
    keyLabel: 'OpenAI API-avain',
    keyPlaceholder: 'sk-...',
    keySet: 'Avain tallennettu',
    keyNotSet: 'Ei avainta',
    save: 'Tallenna avain',
    clear: 'Poista avain',
    saved: 'API-avain tallennettu',
    cleared: 'API-avain poistettu',
    transcribe: 'Litteroi',
    transcribing: 'Litteroidaan…',
    retranscribe: 'Litteroi uudelleen',
    transcriptLabel: 'Litterointi',
    useAsNote: 'Käytä muistiinpanon tekstinä',
    errNoKey: 'Aseta ensin OpenAI API-avain.',
    errAuth: 'API-avain hylättiin. Tarkista se asetuksista.',
    errRate: 'Käyttöraja tai kuluraja saavutettu. Yritä myöhemmin.',
    errNetwork: 'Ei yhteyttä. Tarkista verkko.',
    errOther: 'Litterointi epäonnistui. Yritä uudelleen.',
    goToSettings: 'Avaa asetukset',
  },
```

- [ ] **Step 2: Add the route type**

In `src/navigation/navigationTypes.ts`, add to `RootStackParamList` (next to the other settings routes):

```ts
  TranscriptionSettings: undefined;
```

- [ ] **Step 3: Create the screen**

Create `src/screens/settings/TranscriptionSettings.tsx`:

```tsx
import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';
import {getApiKey, setApiKey, clearApiKey} from '../../services/transcription/keychain';

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
    block: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: c.bgCard, borderBottomWidth: 1, borderBottomColor: c.border},
    label: {fontSize: typography.sizes.base, color: c.textPrimary, marginBottom: spacing.sm},
    status: {fontSize: typography.sizes.xs, color: c.textMuted, marginBottom: spacing.md},
    input: {
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 48,
    },
    actions: {flexDirection: 'row', gap: spacing.md, marginTop: spacing.md},
    btn: {flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: c.primary},
    btnText: {color: '#fff', fontWeight: typography.weights.semibold, fontSize: typography.sizes.base},
    btnClear: {backgroundColor: c.bgMuted, borderWidth: 1, borderColor: c.border},
    btnClearText: {color: c.error},
  });

export default function TranscriptionSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);

  const [hasKey, setHasKey] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    getApiKey().then(k => setHasKey(!!k));
  }, []);

  const save = async () => {
    const key = draft.trim();
    if (!key) { return; }
    await setApiKey(key);
    setDraft('');
    setHasKey(true);
    Alert.alert(t('transcription.saved'));
  };

  const clear = async () => {
    await clearApiKey();
    setHasKey(false);
    Alert.alert(t('transcription.cleared'));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('transcription.provider')}</Text>
        <View style={local.block}>
          <Text style={local.label}>{t('transcription.keyLabel')}</Text>
          <Text style={local.status}>{hasKey ? t('transcription.keySet') : t('transcription.keyNotSet')}</Text>
          <TextInput
            style={local.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('transcription.keyPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <View style={local.actions}>
            <TouchableOpacity style={local.btn} onPress={save}>
              <Text style={local.btnText}>{t('transcription.save')}</Text>
            </TouchableOpacity>
            {hasKey && (
              <TouchableOpacity style={[local.btn, local.btnClear]} onPress={clear}>
                <Text style={[local.btnText, local.btnClearText]}>{t('transcription.clear')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Register in the navigator**

In `src/navigation/RootNavigator.tsx`: add the import (with the other settings imports):

```tsx
import TranscriptionSettings from '../screens/settings/TranscriptionSettings';
```

and add a `Stack.Screen` (next to the other settings screens):

```tsx
      <Stack.Screen
        name="TranscriptionSettings"
        component={TranscriptionSettings}
        options={{title: t('transcription.title')}}
      />
```

- [ ] **Step 5: Add to the Settings list**

In `src/screens/SettingsScreen.tsx`, add `'TranscriptionSettings'` to the `Section['key']` union, and add to `SECTIONS` (after `QuickAddSettings`):

```ts
  {key: 'TranscriptionSettings', titleKey: 'transcription.title', subtitleKey: 'transcription.subtitle'},
```

- [ ] **Step 6: Verify build**

Run: `npm run check`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/screens/settings/TranscriptionSettings.tsx src/navigation/navigationTypes.ts src/navigation/RootNavigator.tsx src/screens/SettingsScreen.tsx src/i18n/locales/en.ts src/i18n/locales/fi.ts
git commit -m "feat(transcription): API key settings screen"
```

---

### Task 6: VoiceTranscript UI on the entry-detail screen

**Files:**
- Create: `src/components/media/VoiceTranscript.tsx`
- Modify: `src/screens/EntryDetailScreen.tsx` (render it in the voice branch; add refresh + use-as-note wiring)

**Interfaces:**
- Consumes: `transcribe`, `TranscriptionError` (Task 4); `updateEntryMedia` (Task 2); `mergeTranscriptIntoBody` (Task 3); `updateEntry` (existing); i18n `transcription.*` (Task 5).
- Produces: the in-screen transcribe/edit/use-as-note affordance.

- [ ] **Step 1: Create the component**

Create `src/components/media/VoiceTranscript.tsx`:

```tsx
import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {EntryMedia} from '../../types';
import {transcribe, TranscriptionError} from '../../services/transcription';
import {updateEntryMedia} from '../../db/entries';

interface Props {
  media: EntryMedia;
  onChanged: () => void;            // refresh the entry after a DB write
  onNeedKey: () => void;            // navigate to Transcription settings
  onUseAsNote: (text: string) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {marginTop: spacing.sm, gap: spacing.sm},
    transcribeBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    transcribeBtnText: {color: '#fff', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm},
    label: {fontSize: typography.sizes.xs, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5},
    input: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    actions: {flexDirection: 'row', gap: spacing.lg, alignItems: 'center'},
    action: {fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: c.primary},
  });

export default function VoiceTranscript({media, onChanged, onNeedKey, onUseAsNote}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(media.transcript ?? '');

  const messageForError = (kind: TranscriptionError['kind']): string => {
    switch (kind) {
      case 'auth': return t('transcription.errAuth');
      case 'rate': return t('transcription.errRate');
      case 'network': return t('transcription.errNetwork');
      default: return t('transcription.errOther');
    }
  };

  const runTranscribe = async () => {
    setBusy(true);
    try {
      const result = await transcribe(media.file_path);
      await updateEntryMedia(media.id!, {transcript: result});
      setText(result);
      onChanged();
    } catch (e) {
      if (e instanceof TranscriptionError && e.kind === 'no-key') {
        Alert.alert(t('transcription.errNoKey'), undefined, [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('transcription.goToSettings'), onPress: onNeedKey},
        ]);
      } else {
        const kind = e instanceof TranscriptionError ? e.kind : 'other';
        Alert.alert(messageForError(kind));
      }
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (text === (media.transcript ?? '')) { return; }
    await updateEntryMedia(media.id!, {transcript: text});
    onChanged();
  };

  if (!media.transcript && !busy) {
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.transcribeBtn} onPress={runTranscribe}>
          <Text style={styles.transcribeBtnText}>{t('transcription.transcribe')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('transcription.transcriptLabel')}</Text>
      {busy ? (
        <View style={styles.transcribeBtn}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.transcribeBtnText}>{t('transcription.transcribing')}</Text>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            onBlur={saveEdit}
            multiline
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => onUseAsNote(text)}>
              <Text style={styles.action}>{t('transcription.useAsNote')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={runTranscribe}>
              <Text style={styles.action}>{t('transcription.retranscribe')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Wire it into EntryDetailScreen**

In `src/screens/EntryDetailScreen.tsx`:

Add imports:

```tsx
import VoiceTranscript from '../components/media/VoiceTranscript';
import {getEntry, deleteEntryMedia, updateEntry, updateEntryMedia} from '../db/entries';
import {mergeTranscriptIntoBody} from '../utils/transcript';
```
(Extend the existing `../db/entries` import rather than duplicating it — keep `getEntry, deleteEntryMedia` and add `updateEntry, updateEntryMedia`.)

Add a refresh helper inside the component (near the other handlers, where `entry`/`setEntry`/`entryId` are in scope):

```tsx
  const refreshEntry = () => {
    getEntry(entryId).then(e => { if (e) { setEntry(e); } });
  };
```

Replace the voice branch of `renderMedia`:

```tsx
    if (m.media_type === 'voice') {
      return (
        <View key={m.id} style={styles.attachWrap}>
          <AudioPlayer filePath={m.file_path} durationSec={m.duration_sec} />
          <VoiceTranscript
            media={m}
            onChanged={refreshEntry}
            onNeedKey={() => navigation.navigate('TranscriptionSettings')}
            onUseAsNote={async text => {
              if (!entry) { return; }
              await updateEntry(entry.id, {body: mergeTranscriptIntoBody(entry.body, text)});
              refreshEntry();
            }}
          />
          {removeBtn}
        </View>
      );
    }
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run check`
Expected: all green (lint, tsc, tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/media/VoiceTranscript.tsx src/screens/EntryDetailScreen.tsx
git commit -m "feat(transcription): transcribe/edit/use-as-note UI on entry detail"
```

---

## Device verification (owed — only Tommi, after the branch builds)

Native dep added (`react-native-keychain`) → **rebuild + uninstall→reinstall** (sideload gotcha).

1. Settings → Transcription → paste the `.kuiskaus.env` key → "Key saved".
2. Record a **Finnish** voice note, open it, tap **Transcribe** → text appears; confirm Finnish quality is usable.
3. Record an **English** clip → Transcribe → confirm quality.
4. Edit the transcript text, leave the field → reopen the entry → edit persisted.
5. **Use as note text** → transcript appended to the note body.
6. Error paths: clear the key → Transcribe routes to settings (`no-key`); set a wrong key → friendly `auth` message; airplane mode → `network` message.
7. Confirm the audio still plays and is never lost on any failure.

Mark the feature DONE only after this passes.

---

## Self-Review (against the spec)

**Spec coverage:**
- Whisper API provider, `.m4a` upload, keychain key → Tasks 1, 4, 5. ✓
- `transcribe()` seam, provider-agnostic → Task 4 (`index.ts`). ✓
- Schema v14 `entry_media.transcript` + `updateEntryMedia` → Task 2. ✓
- EntryDetailScreen transcribe/edit/re-transcribe/use-as-note → Task 6. ✓
- "Use as note text" body-merge (fill if empty, else append) → Task 3 + Task 6 wiring. ✓
- Typed errors (`no-key`/`auth`/`rate`/`network`/`other`) + friendly messages, audio never lost → Task 4 + Task 6. ✓
- Transcription settings screen (key set/clear, no echo) → Task 5. ✓
- Both locales → Task 5. ✓
- Deferred (on-device, custom endpoint, extractByPath, provider picker) → not in any task, correct. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `transcribe(audioUri: string): Promise<string>`, `TranscriptionError.kind`, `updateEntryMedia(id, {transcript})`, `mergeTranscriptIntoBody(body, transcript)`, `EntryMedia.transcript` — names match across Tasks 2/3/4/6. `media.id!` is non-null in EntryDetailScreen because those rows come from the DB (always have an id).
