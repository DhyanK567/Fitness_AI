'use client';

import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';

const ACCESS_NOTICES = new Set([
  'Admin authorization required',
  'Trainer authorization required',
  'This workspace is not available for your role',
]);

export function WorkspaceAccessNotice() {
  const { addToast } = useToast();

  useEffect(() => {
    const url = new URL(window.location.href);
    const notice = url.searchParams.get('access');
    if (!notice || !ACCESS_NOTICES.has(notice)) return;

    addToast({
      type: 'warning',
      title: 'Access restricted',
      message: notice,
    });
    url.searchParams.delete('access');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [addToast]);

  return null;
}
