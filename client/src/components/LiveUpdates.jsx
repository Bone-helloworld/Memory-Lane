import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useI18n } from '../i18n/index.jsx';
import { useData } from '../state.jsx';
import { useToast } from './Toast.jsx';

const TYPES = ['comment', 'comment-removed', 'shared', 'circle'];

/**
 * Live updates (Server-Sent Events, see server/lib/live.js). One EventSource for the whole
 * signed-in app: each event is passed on as a window event "ml-live" (Comments.jsx adds the new
 * note to the list in place) and, when it happens elsewhere, announced with a small toast.
 * EventSource reconnects by itself after a network drop.
 *
 * The connection is only kept while the page is on screen. Over HTTP/1.1 (local development, some
 * proxies) a browser opens at most 6 connections per site, and every tab in the background or page
 * kept in the back/forward cache would otherwise hold one — enough to stall all photo requests.
 * Coming back reconnects and reloads the data, so nothing that happened meanwhile is missed.
 */
export default function LiveUpdates() {
  const { t } = useI18n();
  const toast = useToast();
  const { refresh } = useData();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(() => {
    if (typeof EventSource !== 'function') return undefined;
    let source = null;

    const onEvent = (event) => {
      const data = JSON.parse(event.data);
      window.dispatchEvent(new CustomEvent('ml-live', { detail: data }));
      const watching = path.current === `/album/${data.memoryId}`;
      if (data.type === 'comment' && !watching) {
        toast(t('live.comment', { name: data.comment.author.name, title: data.title }));
      }
      if (data.type === 'shared') {
        toast(t('live.shared', { name: data.by.name, title: data.title }));
        refresh(); // "Shared with you" and the badge in the top bar
      }
      if (data.type === 'circle') {
        toast(t('live.circle', { name: data.by.name }));
        refresh();
      }
    };
    const open = () => {
      if (source) return;
      source = new EventSource('/api/events');
      for (const type of TYPES) source.addEventListener(type, onEvent);
    };
    const close = () => {
      source?.close();
      source = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        close();
      } else if (!source) {
        open();
        refresh(); // catch up on anything that happened while the page was away
      }
    };
    // Back from the back/forward cache (the connection was closed on the way out).
    const onPageShow = (event) => {
      if (event.persisted) onVisibility();
    };

    if (document.visibilityState !== 'hidden') open();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', close);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      close();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', close);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [t, toast, refresh]);

  return null;
}
