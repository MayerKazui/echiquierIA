export const DEFAULT_PORT = 3000;

/**
 * Port to listen on: the PORT environment variable (set by Cloud Run and most hosts), or 3000.
 * Anything that is not an integer between 1 and 65535 is ignored.
 */
export function resolvePort(env: Record<string, string | undefined> = process.env): number {
  const raw = env.PORT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PORT;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}
