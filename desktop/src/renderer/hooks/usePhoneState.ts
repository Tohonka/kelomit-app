import {useEffect, useState} from 'react';
import type {PhoneState} from '../../main/ws.ts';

const OFFLINE: PhoneState = {connected: false, lastSeenAt: null, appVersion: null, activeSession: null};

export function usePhoneState(): PhoneState {
  const [state, setState] = useState<PhoneState>(OFFLINE);
  useEffect(() => {
    window.kelomit.phoneState().then(setState).catch(() => {});
    return window.kelomit.onPhoneState(setState);
  }, []);
  return state;
}
