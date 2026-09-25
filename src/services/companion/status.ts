import {useSessionStore} from '../../store/sessionStore';
import {onCompanionState, sendCompanionStatus} from './client';

let started = false;

/** Mirror the running timer to the desktop header: on every session change
 *  and once on each (re)connect. Ephemeral — never stored anywhere. */
export function startCompanionStatus(): void {
  if (started) {
    return;
  }
  started = true;
  useSessionStore.subscribe((state, prev) => {
    if (state.active !== prev.active) {
      sendCompanionStatus(state.active);
    }
  });
  onCompanionState(s => {
    if (s === 'open') {
      sendCompanionStatus(useSessionStore.getState().active);
    }
  });
}
