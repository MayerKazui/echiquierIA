import React from 'react';
import bishopBlack from './pieces/Chess_bdt45.svg?raw';
import bishopWhite from './pieces/Chess_blt45.svg?raw';
import kingBlack from './pieces/Chess_kdt45.svg?raw';
import kingWhite from './pieces/Chess_klt45.svg?raw';
import knightBlack from './pieces/Chess_ndt45.svg?raw';
import knightWhite from './pieces/Chess_nlt45.svg?raw';
import pawnBlack from './pieces/Chess_pdt45.svg?raw';
import pawnWhite from './pieces/Chess_plt45.svg?raw';
import queenBlack from './pieces/Chess_qdt45.svg?raw';
import queenWhite from './pieces/Chess_qlt45.svg?raw';
import rookBlack from './pieces/Chess_rdt45.svg?raw';
import rookWhite from './pieces/Chess_rlt45.svg?raw';

// The pieces are the "dark (black) and light (white), no background" set of Wikimedia Commons'
// "SVG chess pieces" table (Chess_?dt45.svg / Chess_?lt45.svg, by Colin M.L. Burnett, tri-licensed
// GFDL / BSD / GPL). The files in ./pieces are the originals, unmodified.

/** Content of a 45x45 SVG file, without its XML prolog and <svg> wrapper. Ids are dropped: several
 *  pieces are inlined in the same page, and duplicate ids are invalid HTML. */
const innerSvg = (file: string): string =>
  file
    .replace(/^[\s\S]*?<svg\b[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\sid="[^"]*"/g, '');

const PIECES: Record<'w' | 'b', Record<string, string>> = {
  w: {
    p: innerSvg(pawnWhite),
    n: innerSvg(knightWhite),
    b: innerSvg(bishopWhite),
    r: innerSvg(rookWhite),
    q: innerSvg(queenWhite),
    k: innerSvg(kingWhite),
  },
  b: {
    p: innerSvg(pawnBlack),
    n: innerSvg(knightBlack),
    b: innerSvg(bishopBlack),
    r: innerSvg(rookBlack),
    q: innerSvg(queenBlack),
    k: innerSvg(kingBlack),
  },
};

export const ChessPiece: React.FC<{ type: string; color: 'w' | 'b'; className?: string }> = ({
  type,
  color,
  className = 'w-full h-full drop-shadow-sm transition-transform duration-150',
}) => {
  const markup = PIECES[color][type.toLowerCase()];
  if (!markup) return null;
  // The markup is one of the bundled files above, never user input
  return <svg viewBox="0 0 45 45" className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
};
