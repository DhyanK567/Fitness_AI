'use client';

import { useEffect } from 'react';

let activeLocks = 0;
let documentLocks = 0;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';

/** Keep page scroll locked while any modal or drawer is open, restoring the original styles on close. */
export function useBodyScrollLock(isLocked: boolean, lockDocument = false) {
  useEffect(() => {
    if (!isLocked) return;

    if (activeLocks === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousDocumentOverflow = document.documentElement.style.overflow;
    }

    activeLocks += 1;
    if (lockDocument) documentLocks += 1;
    document.body.style.overflow = 'hidden';
    if (documentLocks > 0) document.documentElement.style.overflow = 'hidden';

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (lockDocument) documentLocks = Math.max(0, documentLocks - 1);

      if (activeLocks === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousDocumentOverflow;
      } else {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = documentLocks > 0 ? 'hidden' : previousDocumentOverflow;
      }
    };
  }, [isLocked, lockDocument]);
}
