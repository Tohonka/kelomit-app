import {useEffect, useState} from 'react';
import QRCode from 'qrcode';
import type {PairInfo} from '../../main/config.ts';

/** QR = `kelomit://pair?url=…&token=…`; the phone's Companion card scans it. */
export function PairSheet({onClose}: {onClose: () => void}) {
  const [info, setInfo] = useState<PairInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.kelomit.pairInfo().then(async i => {
      if (cancelled) return;
      setInfo(i);
      if (i.payload) {
        setQr(await QRCode.toDataURL(i.payload, {margin: 1, width: 480}));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h2>Pair phone</h2>
        {info?.url ? (
          <>
            <p>On the phone: Settings → Data → Companion → Scan QR.</p>
            {qr && <img className="qr" src={qr} alt="pairing QR" />}
            <p>
              Or type it in: <code>{info.url}</code>
              <br />
              Token: <code>{info.token}</code>
            </p>
          </>
        ) : info ? (
          <p>No LAN address found. Connect the Mac to the same Wi-Fi as the phone.</p>
        ) : (
          <p>…</p>
        )}
        <div className="actions">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
