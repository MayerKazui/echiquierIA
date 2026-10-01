import React, { useCallback, useState } from 'react';

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

interface Announcement {
  text: string;
  /** Changes on every announcement so that repeating the same sentence is read again. */
  id: number;
}

/** State for a screen-reader announcement zone: `announce("…")` from any handler, `<LiveRegion>` to render it. */
export function useAnnouncer() {
  const [announcement, setAnnouncement] = useState<Announcement>({ text: '', id: 0 });
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ text, id: previous.id + 1 }));
  }, []);
  return { announcement, announce };
}

/**
 * Visually hidden polite live region. The same text announced twice in a row is told apart with an
 * invisible character, otherwise screen readers ignore the second one.
 */
export const LiveRegion: React.FC<{ announcement: Announcement }> = ({ announcement }) => (
  <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
    {announcement.text}
    {announcement.text && announcement.id % 2 === 0 ? ZERO_WIDTH_SPACE : ''}
  </div>
);
