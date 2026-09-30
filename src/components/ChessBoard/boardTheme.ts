import { BoardTheme } from '../../types/ui';

interface SquareStyle {
  /** Background class of the square. */
  squareBg: string;
  /** Text color class for the rank / file coordinates drawn on the square. */
  coordTextColor: string;
}

// Class names are written out in full (not built from a color) so Tailwind can detect them.
const PALETTES: Record<
  BoardTheme,
  { light: string; dark: string; lightLast: string; darkLast: string; lightCoord: string; darkCoord: string }
> = {
  wood: {
    light: 'bg-[#f0d9b5]',
    dark: 'bg-[#b58863]',
    lightLast: 'bg-[#e8d197]',
    darkLast: 'bg-[#c9975b]',
    lightCoord: 'text-[#b58863]',
    darkCoord: 'text-[#f0d9b5]',
  },
  blue: {
    light: 'bg-[#dee3e6]',
    dark: 'bg-[#8ca2ad]',
    lightLast: 'bg-[#b8d6e5]',
    darkLast: 'bg-[#64889c]',
    lightCoord: 'text-[#8ca2ad]',
    darkCoord: 'text-[#dee3e6]',
  },
  green: {
    light: 'bg-[#edeed1]',
    dark: 'bg-[#779952]',
    lightLast: 'bg-[#f5f682]',
    darkLast: 'bg-[#b9ca43]',
    lightCoord: 'text-[#779952]',
    darkCoord: 'text-[#edeed1]',
  },
};

export function getSquareStyle(theme: BoardTheme, isLight: boolean, isLastMove: boolean): SquareStyle {
  const p = PALETTES[theme] ?? PALETTES.green;
  return {
    squareBg: isLastMove ? (isLight ? p.lightLast : p.darkLast) : isLight ? p.light : p.dark,
    coordTextColor: isLight ? p.lightCoord : p.darkCoord,
  };
}
