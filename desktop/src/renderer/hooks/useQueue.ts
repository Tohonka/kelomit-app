import {useEffect, useState} from 'react';
import type {QueueSnapshot} from '../../main/queue.ts';

const EMPTY: QueueSnapshot = {items: [], failed: [], sending: null};

export function useQueue(): QueueSnapshot {
  const [snap, setSnap] = useState<QueueSnapshot>(EMPTY);
  useEffect(() => {
    window.kelomit.queue().then(setSnap).catch(() => {});
    return window.kelomit.onQueueChanged(setSnap);
  }, []);
  return snap;
}
