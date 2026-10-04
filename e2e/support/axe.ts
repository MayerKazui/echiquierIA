import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const axeSource = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** The WCAG A and AA rules of axe-core on what the page shows now. */
export async function violations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axeSource });
  const found = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            c: Document,
            o: object
          ) => Promise<{
            violations: { id: string; impact?: string | null; help: string; nodes: { target: unknown[] }[] }[];
          }>;
        };
      }
    ).axe;
    return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations;
  });
  return found.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}
