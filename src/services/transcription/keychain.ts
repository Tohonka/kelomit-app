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
