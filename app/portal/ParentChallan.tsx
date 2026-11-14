'use client';

import { useEffect, useRef } from 'react';
import ChallanDocument, { type IssuedChallan } from '@/app/components/ChallanDocument';
import type { ChallanProfile } from '@/lib/challanProfile';
import type { FeeSettings } from '@/lib/fees';
export type ParentVoucher = IssuedChallan;

interface ChallanDetails {
  profile: ChallanProfile;
  voucher: ParentVoucher;
  settings: FeeSettings;
}

/** The on-screen modal and printed document are separate so the browser prints ordinary page content. */
export default function ParentChallan({ onClose, ...details }: ChallanDetails & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <>
      <dialog className="parent-challan-dialog no-print" ref={dialog} aria-labelledby="parent-challan-title" onClose={onClose}>
        <div className="parent-challan-toolbar">
          <div><h2 id="parent-challan-title">Challan preview</h2><p>Choose Save as PDF in the print window to keep a copy.</p></div>
          <div className="parent-actions">
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>Close</button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
          </div>
        </div>
        <ChallanDocument {...details} />
      </dialog>
      <div className="parent-challan-print print-container print-only"><ChallanDocument {...details} /></div>
    </>
  );
}
