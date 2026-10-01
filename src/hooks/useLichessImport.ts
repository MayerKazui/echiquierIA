import { useCallback, useState } from 'react';
import { apiUrl } from '../utils/siteUrl';

const NOTICE_DURATION_MS = 4500;

/**
 * "Partie Lichess": imports the PGN through the server proxy and opens it in a new tab,
 * falling back to Lichess' manual paste page. The PGN is also copied to the clipboard.
 */
export function useLichessImport(pgn: string, isFlipped: boolean) {
  const [isImporting, setIsImporting] = useState(false);
  const [showNotice, setShowNotice] = useState(false);

  const flashNotice = useCallback(() => {
    setShowNotice(true);
    setTimeout(() => setShowNotice(false), NOTICE_DURATION_MS);
  }, []);

  const openOnLichess = useCallback(async () => {
    if (!pgn || isImporting) return;

    // Pre-open a blank tab synchronously on click to prevent popup blockers
    let newTab: Window | null = null;
    try {
      newTab = window.open('about:blank', '_blank');
    } catch {
      newTab = null;
    }

    const navigateTo = (url: string) => {
      try {
        if (newTab) newTab.location.href = url;
        else window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        // Ignore
      }
    };

    try {
      navigator.clipboard.writeText(pgn);
    } catch {
      // Ignore
    }

    setIsImporting(true);
    try {
      const response = await fetch(apiUrl('/api/lichess/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn }),
      });
      const res = response.ok ? await response.json() : null;
      if (!res?.success || !res.id) throw new Error('Lichess import API failed');

      navigateTo(`https://lichess.org/${res.id}${isFlipped ? '/black' : '/white'}`);
      flashNotice();
    } catch (err) {
      console.warn('Direct Lichess import failed, opening manual import page:', err);
      navigateTo('https://lichess.org/paste');
      flashNotice();
    } finally {
      setIsImporting(false);
    }
  }, [pgn, isFlipped, isImporting, flashNotice]);

  return { isImporting, showNotice, dismissNotice: () => setShowNotice(false), openOnLichess };
}
