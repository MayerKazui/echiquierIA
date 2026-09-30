import { Chess } from 'chess.js';

export interface ParsedClockInfo {
  clock?: string; // e.g. "0:09:58" or "8:42"
  thinkTimeSeconds?: number;
  thinkTimeFormatted?: string; // e.g. "12s" or "1m 35s"
  isLongThink?: boolean;
  thinkRatioToAverage?: number; // e.g. 2.8 (2.8x average)
}

/**
 * Converts time strings like "1:29:45", "0:09:58", "9:58.4", "45" into total seconds.
 */
export function parseDurationToSeconds(str: string): number | null {
  if (!str) return null;
  const clean = str
    .trim()
    .replace(/^\[%clk\s*|^\[%emt\s*|^\[|\]$/gi, '')
    .trim();
  const parts = clean.split(':');

  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
      return h * 3600 + m * 60 + s;
    }
  } else if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (!isNaN(m) && !isNaN(s)) {
      return m * 60 + s;
    }
  } else if (parts.length === 1) {
    const s = parseFloat(parts[0]);
    if (!isNaN(s)) return s;
  }

  return null;
}

/**
 * Formats duration in seconds to a concise, user-friendly French label.
 * E.g. 8 -> "8s", 75 -> "1m 15s", 185 -> "3m 05s"
 */
export function formatThinkTime(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

/**
 * Formats clock remaining into clean format (e.g. "9:45" or "1:15:30")
 */
export function formatClockRemaining(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parses PGN TimeControl header (e.g. "600+2", "300", "900+10", "40/7200:3600")
 */
export function parseTimeControl(tc?: string): { baseTime: number; increment: number } | null {
  if (!tc) return null;
  const trimmed = tc.trim();

  // e.g. "600+2" or "300"
  if (trimmed.includes('+')) {
    const [base, inc] = trimmed.split('+');
    const baseSec = parseFloat(base);
    const incSec = parseFloat(inc);
    if (!isNaN(baseSec) && !isNaN(incSec)) {
      return { baseTime: baseSec, increment: incSec };
    }
  }

  // Pure seconds e.g. "600"
  const sec = parseFloat(trimmed);
  if (!isNaN(sec) && sec > 0) {
    return { baseTime: sec, increment: 0 };
  }

  return null;
}

/**
 * Attempts to infer base time if no TimeControl header exists, using first move's clock.
 */
function inferBaseTime(firstClockSeconds: number): number {
  const standardLimits = [60, 120, 180, 300, 600, 900, 1200, 1800, 3600, 5400, 7200];
  for (const limit of standardLimits) {
    // If first move clock is within 60s of standard time
    if (firstClockSeconds <= limit && firstClockSeconds >= limit - 60) {
      return limit;
    }
  }
  return firstClockSeconds;
}

/**
 * Extracts clock remaining and calculated thinking times for every ply in the game.
 */
export function extractGameClocks(
  pgn: string,
  history: Array<{ color: 'w' | 'b'; after: string; san?: string }>
): {
  moveClocks: ParsedClockInfo[];
  avgWhiteThink: number;
  avgBlackThink: number;
  hasClockData: boolean;
} {
  const totalMoves = history.length;
  if (totalMoves === 0) {
    return { moveClocks: [], avgWhiteThink: 0, avgBlackThink: 0, hasClockData: false };
  }

  // 1. Extract comments directly from chess.js
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    // ignore
  }

  const commentMap = new Map<string, string>();
  try {
    const rawComments = chess.getComments();
    for (const c of rawComments) {
      if (c && c.fen && c.comment) {
        commentMap.set(c.fen, c.comment);
      }
    }
  } catch {
    // fallback
  }

  // 2. Extract TimeControl header if available
  const tcMatch = pgn.match(/\[TimeControl\s+"([^"]+)"\]/i);
  const timeControl = tcMatch ? parseTimeControl(tcMatch[1]) : null;
  const increment = timeControl ? timeControl.increment : 0;

  // Extract raw clock info for each move
  const rawClocks: Array<{
    clockString?: string;
    clockSeconds?: number;
    emtSeconds?: number;
  }> = [];

  let clockCount = 0;

  for (let i = 0; i < totalMoves; i++) {
    const comment = commentMap.get(history[i].after) || '';

    // Extract %clk or %emt or direct time format
    const clkMatch = comment.match(/(?:%clk|\bclk)\s*([0-9]+:[0-9]+(?::[0-9]+)?(?:\.[0-9]+)?)/i);
    const emtMatch = comment.match(/(?:%emt|\bemt)\s*([0-9]+:[0-9]+(?::[0-9]+)?(?:\.[0-9]+)?)/i);
    const fallbackClock = !clkMatch ? comment.match(/(?:^|\s)([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)(?:\s|$)/) : null;

    const clockStr = clkMatch ? clkMatch[1] : fallbackClock ? fallbackClock[1] : undefined;
    const emtStr = emtMatch ? emtMatch[1] : undefined;

    const clockSec = clockStr ? parseDurationToSeconds(clockStr) : null;
    const emtSec = emtStr ? parseDurationToSeconds(emtStr) : null;

    if (clockSec !== null || emtSec !== null) {
      clockCount++;
    }

    rawClocks.push({
      clockString: clockStr,
      clockSeconds: clockSec !== null ? clockSec : undefined,
      emtSeconds: emtSec !== null ? emtSec : undefined,
    });
  }

  // If no clocks were found at all, return empty
  if (clockCount === 0) {
    return {
      moveClocks: history.map(() => ({})),
      avgWhiteThink: 0,
      avgBlackThink: 0,
      hasClockData: false,
    };
  }

  // 3. Calculate thinking time (elapsed duration) for each move
  // Determine starting base times
  const firstWhiteClock = rawClocks.find((_, idx) => history[idx].color === 'w')?.clockSeconds;
  const firstBlackClock = rawClocks.find((_, idx) => history[idx].color === 'b')?.clockSeconds;

  const baseWhite = timeControl ? timeControl.baseTime : firstWhiteClock ? inferBaseTime(firstWhiteClock) : 600;
  const baseBlack = timeControl ? timeControl.baseTime : firstBlackClock ? inferBaseTime(firstBlackClock) : 600;

  let prevClockWhite: number | null = baseWhite;
  let prevClockBlack: number | null = baseBlack;

  const moveThinks: Array<{
    clock?: string;
    thinkSec?: number;
    color: 'w' | 'b';
  }> = [];

  for (let i = 0; i < totalMoves; i++) {
    const isWhite = history[i].color === 'w';
    const raw = rawClocks[i];
    let think: number | undefined = undefined;

    if (raw.emtSeconds !== undefined) {
      think = Math.max(0, Math.round(raw.emtSeconds));
    } else if (raw.clockSeconds !== undefined) {
      const prevClock = isWhite ? prevClockWhite : prevClockBlack;
      if (prevClock !== null) {
        const diff = prevClock - raw.clockSeconds + increment;
        think = Math.max(0, Math.round(diff));
      }
      if (isWhite) {
        prevClockWhite = raw.clockSeconds;
      } else {
        prevClockBlack = raw.clockSeconds;
      }
    }

    moveThinks.push({
      clock: raw.clockString,
      thinkSec: think,
      color: history[i].color,
    });
  }

  // 4. Compute statistics (averages for White and Black)
  const whiteThinks = moveThinks.filter((m) => m.color === 'w' && m.thinkSec !== undefined).map((m) => m.thinkSec!);
  const blackThinks = moveThinks.filter((m) => m.color === 'b' && m.thinkSec !== undefined).map((m) => m.thinkSec!);

  const avgWhite = whiteThinks.length > 0 ? whiteThinks.reduce((a, b) => a + b, 0) / whiteThinks.length : 10;
  const avgBlack = blackThinks.length > 0 ? blackThinks.reduce((a, b) => a + b, 0) / blackThinks.length : 10;

  // 5. Build final ParsedClockInfo with `isLongThink` determination
  const moveClocks: ParsedClockInfo[] = moveThinks.map((m) => {
    if (m.thinkSec === undefined) {
      return {
        clock: m.clock,
      };
    }

    const avg = m.color === 'w' ? avgWhite : avgBlack;
    const ratio = avg > 0 ? Number((m.thinkSec / avg).toFixed(1)) : 1;

    // Abnormal long think criteria:
    // - >= 2.2x the player's average think time AND >= 15 seconds
    // - OR absolute duration >= 60 seconds
    // - OR >= 30 seconds if average is fast (<= 10s)
    const isLong = m.thinkSec >= Math.max(15, avg * 2.2) || m.thinkSec >= 60 || (avg <= 10 && m.thinkSec >= 30);

    return {
      clock: m.clock,
      thinkTimeSeconds: m.thinkSec,
      thinkTimeFormatted: formatThinkTime(m.thinkSec),
      isLongThink: isLong,
      thinkRatioToAverage: ratio,
    };
  });

  return {
    moveClocks,
    avgWhiteThink: Math.round(avgWhite),
    avgBlackThink: Math.round(avgBlack),
    hasClockData: true,
  };
}
