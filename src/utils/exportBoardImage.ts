import { Chess } from 'chess.js';

export type BoardTheme = 'green' | 'wood' | 'blue';

export interface ExportBoardOptions {
  fen: string;
  isFlipped?: boolean;
  boardTheme?: BoardTheme;
  lastMove?: { from: string; to: string } | null;
}

// Raw SVG definitions for all 12 chess pieces
const PIECE_SVGS: Record<string, string> = {
  P: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><path d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 l 23,0 c 0,-7.92 -4.41,-12.41 -7.41,-13.47 C 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z" fill="#ffffff" stroke="#2c3e50" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  p: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><path d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 l 23,0 c 0,-7.92 -4.41,-12.41 -7.41,-13.47 C 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z" fill="#262626" stroke="#171717" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  N: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#2c3e50" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill="#ffffff"/><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,7.4 17.07,8.06 18,8.5 C 18.58,8.65 17.58,9.59 18,10 C 19.34,9.88 20.35,8.96 22,10 z" fill="#ffffff"/><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill="#2c3e50"/><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill="#2c3e50"/></g></svg>`,
  n: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#171717" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill="#262626"/><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,7.4 17.07,8.06 18,8.5 C 18.58,8.65 17.58,9.59 18,10 C 19.34,9.88 20.35,8.96 22,10 z" fill="#262626"/><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill="#ffffff"/><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill="#ffffff"/></g></svg>`,
  B: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#2c3e50" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#ffffff" stroke-linecap="butt"><path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.06 9,36 9,36 z"/><path d="M 12,36 C 11,32 11,24 16,19 C 14.5,13.5 17.5,8 22.5,8 C 27.5,8 30.5,13.5 29,19 C 34,24 34,32 33,36 z"/><path d="M 22.5,5 C 21.67,5 21,5.67 21,6.5 C 21,7.33 21.67,8 22.5,8 C 23.33,8 24,7.33 24,6.5 C 24,5.67 23.33,5 22.5,5 z"/></g><path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18"/></g></svg>`,
  b: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#171717" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#262626" stroke-linecap="butt"><path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.06 9,36 9,36 z"/><path d="M 12,36 C 11,32 11,24 16,19 C 14.5,13.5 17.5,8 22.5,8 C 27.5,8 30.5,13.5 29,19 C 34,24 34,32 33,36 z"/><path d="M 22.5,5 C 21.67,5 21,5.67 21,6.5 C 21,7.33 21.67,8 22.5,8 C 23.33,8 24,7.33 24,6.5 C 24,5.67 23.33,5 22.5,5 z"/></g><path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" stroke="#ffffff"/></g></svg>`,
  R: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#ffffff" fill-rule="evenodd" stroke="#2c3e50" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 9,39 L 36,39 L 36,36 L 9,36 z"/><path d="M 12,36 L 12,32 L 33,32 L 33,36 z"/><path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z"/><path d="M 34,14 L 31,17 L 14,17 L 11,14 z"/><path d="M 31,17 L 31,29.5 L 14,29.5 L 14,17 z"/><path d="M 31,29.5 L 32.5,32 L 12.5,32 L 14,29.5 z"/><path d="M 11,14 L 34,14" fill="none"/></g></svg>`,
  r: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#262626" fill-rule="evenodd" stroke="#171717" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 9,39 L 36,39 L 36,36 L 9,36 z"/><path d="M 12,36 L 12,32 L 33,32 L 33,36 z"/><path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z"/><path d="M 34,14 L 31,17 L 14,17 L 11,14 z"/><path d="M 31,17 L 31,29.5 L 14,29.5 L 14,17 z"/><path d="M 31,29.5 L 32.5,32 L 12.5,32 L 14,29.5 z"/><path d="M 11,14 L 34,14" fill="none" stroke="#ffffff"/><path d="M 14,29.5 L 31,29.5" fill="none" stroke="#ffffff"/></g></svg>`,
  Q: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#ffffff" fill-rule="evenodd" stroke="#2c3e50" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 9 26 C 17.5 24.5 30 24.5 36 26 L 38 14 L 31 25 L 22.5 10 L 14 25 L 7 14 L 9 26 z"/><path d="M 9 26 C 9 28 10.5 28 11.5 30 C 12.5 31.5 12.5 31 12 33.5 C 10.5 34.5 10.5 36 10 39 L 35 39 C 34.5 36 34.5 34.5 33 33.5 C 32.5 31 32.5 31.5 33.5 30 C 34.5 28 36 28 36 26 C 27.5 24.5 17.5 24.5 9 26 z"/><circle cx="6" cy="12" r="2"/><circle cx="14" cy="9" r="2"/><circle cx="22.5" cy="8" r="2"/><circle cx="31" cy="9" r="2"/><circle cx="39" cy="12" r="2"/><path d="M 11.5 30 C 15 29 30 29 33.5 30" fill="none"/><path d="M 12 33.5 C 18 32.5 27 32.5 33 33.5" fill="none"/></g></svg>`,
  q: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#262626" fill-rule="evenodd" stroke="#171717" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 9 26 C 17.5 24.5 30 24.5 36 26 L 38 14 L 31 25 L 22.5 10 L 14 25 L 7 14 L 9 26 z"/><path d="M 9 26 C 9 28 10.5 28 11.5 30 C 12.5 31.5 12.5 31 12 33.5 C 10.5 34.5 10.5 36 10 39 L 35 39 C 34.5 36 34.5 34.5 33 33.5 C 32.5 31 32.5 31.5 33.5 30 C 34.5 28 36 28 36 26 C 27.5 24.5 17.5 24.5 9 26 z"/><circle cx="6" cy="12" r="2" fill="#ffffff"/><circle cx="14" cy="9" r="2" fill="#ffffff"/><circle cx="22.5" cy="8" r="2" fill="#ffffff"/><circle cx="31" cy="9" r="2" fill="#ffffff"/><circle cx="39" cy="12" r="2" fill="#ffffff"/><path d="M 11.5 30 C 15 29 30 29 33.5 30" fill="none" stroke="#ffffff"/><path d="M 12 33.5 C 18 32.5 27 32.5 33 33.5" fill="none" stroke="#ffffff"/></g></svg>`,
  K: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#2c3e50" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 22.5,11.63 L 22.5,6" stroke-linejoin="miter"/><path d="M 20,8 L 25,8" stroke-linejoin="miter"/><path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" fill="#ffffff" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 33.5,37 36,33 36,29 C 36,25 32,23 32,23 C 32,23 28.5,25.5 22.5,25.5 C 16.5,25.5 13,23 13,23 C 13,23 9,25 9,29 C 9,33 11.5,37 11.5,37 z" fill="#ffffff"/><path d="M 11.5,30 C 17,27 28,27 33.5,30"/><path d="M 11.5,33.5 C 17,30.5 28,30.5 33.5,33.5"/><path d="M 11.5,37 C 17,34 28,34 33.5,37"/></g></svg>`,
  k: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#171717" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 22.5,11.63 L 22.5,6" stroke="#171717" stroke-linejoin="miter"/><path d="M 20,8 L 25,8" stroke="#171717" stroke-linejoin="miter"/><path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" fill="#262626" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 33.5,37 36,33 36,29 C 36,25 32,23 32,23 C 32,23 28.5,25.5 22.5,25.5 C 16.5,25.5 13,23 13,23 C 13,23 9,25 9,29 C 9,33 11.5,37 11.5,37 z" fill="#262626"/><path d="M 11.5,30 C 17,27 28,27 33.5,30" stroke="#ffffff"/><path d="M 11.5,33.5 C 17,30.5 28,30.5 33.5,33.5" stroke="#ffffff"/><path d="M 11.5,37 C 17,34 28,34 33.5,37" stroke="#ffffff"/></g></svg>`,
};

// In-memory cache of loaded image elements
const imageCache: Map<string, HTMLImageElement> = new Map();

function getLoadedPieceImage(pieceKey: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(pieceKey);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }

  const svg = PIECE_SVGS[pieceKey];
  if (!svg) {
    return Promise.reject(new Error(`Unknown piece key: ${pieceKey}`));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(pieceKey, img);
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error(`Failed to load piece SVG: ${pieceKey}`));
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Preloads all piece SVGs into browser cache for instant rendering
 */
export async function preloadPieceImages(): Promise<void> {
  await Promise.all(Object.keys(PIECE_SVGS).map((k) => getLoadedPieceImage(k).catch(() => null)));
}

/**
 * Renders the chessboard to an HTML Canvas element
 */
export async function renderChessBoardToCanvas(options: ExportBoardOptions): Promise<HTMLCanvasElement> {
  const {
    fen,
    isFlipped = false,
    boardTheme = 'green',
    lastMove = null,
  } = options;

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    chess = new Chess();
  }

  const board = chess.board();

  const canvas = document.createElement('canvas');
  const size = 800; // 800 x 800 px for crisp sharpness
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Palette definitions
  const themes = {
    green: {
      light: '#edeed1',
      dark: '#779952',
      lightLastMove: '#f5f682',
      darkLastMove: '#b9ca43',
      lightCoord: '#779952',
      darkCoord: '#edeed1',
    },
    wood: {
      light: '#f0d9b5',
      dark: '#b58863',
      lightLastMove: '#e8d197',
      darkLastMove: '#c9975b',
      lightCoord: '#b58863',
      darkCoord: '#f0d9b5',
    },
    blue: {
      light: '#dee3e6',
      dark: '#8ca2ad',
      lightLastMove: '#d8e6ad',
      darkLastMove: '#9fb47f',
      lightCoord: '#8ca2ad',
      darkCoord: '#dee3e6',
    },
  };

  const theme = themes[boardTheme] || themes.green;
  const squareSize = size / 8; // 100px

  const files = isFlipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = isFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

  // 1. Draw Squares & Highlights
  for (let rIdx = 0; rIdx < 8; rIdx++) {
    for (let fIdx = 0; fIdx < 8; fIdx++) {
      const file = files[fIdx];
      const rank = ranks[rIdx];
      const square = `${file}${rank}`;
      const isLight = (fIdx + rIdx) % 2 === 0;

      const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);

      let squareColor = isLight ? theme.light : theme.dark;
      if (isLastMove) {
        squareColor = isLight ? theme.lightLastMove : theme.darkLastMove;
      }

      ctx.fillStyle = squareColor;
      ctx.fillRect(fIdx * squareSize, rIdx * squareSize, squareSize, squareSize);

      // Coordinate notation: rank on left edge (fIdx === 0), file on bottom edge (rIdx === 7)
      ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';

      if (fIdx === 0) {
        ctx.fillStyle = isLight ? theme.lightCoord : theme.darkCoord;
        ctx.fillText(`${rank}`, fIdx * squareSize + 5, rIdx * squareSize + 16);
      }

      if (rIdx === 7) {
        ctx.fillStyle = isLight ? theme.lightCoord : theme.darkCoord;
        ctx.fillText(`${file}`, fIdx * squareSize + squareSize - 14, rIdx * squareSize + squareSize - 5);
      }
    }
  }

  // 2. Draw Pieces
  // Collect all pieces to draw
  const piecesToDraw: Array<{ imgKey: string; x: number; y: number }> = [];

  for (let rIdx = 0; rIdx < 8; rIdx++) {
    for (let fIdx = 0; fIdx < 8; fIdx++) {
      const file = files[fIdx];
      const rank = ranks[rIdx];
      const square = `${file}${rank}`;

      const piece = chess.get(square as any);
      if (piece) {
        const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
        piecesToDraw.push({
          imgKey: key,
          x: fIdx * squareSize,
          y: rIdx * squareSize,
        });
      }
    }
  }

  // Load and draw all pieces
  await Promise.all(
    piecesToDraw.map(async ({ imgKey, x, y }) => {
      try {
        const img = await getLoadedPieceImage(imgKey);
        ctx.drawImage(img, x, y, squareSize, squareSize);
      } catch (err) {
        console.error('Failed to draw piece', imgKey, err);
      }
    })
  );

  return canvas;
}

/**
 * 1-Click Copy Board to Clipboard as Image, with graceful fallback to PNG download
 */
export async function copyBoardImageToClipboard(
  options: ExportBoardOptions
): Promise<{ success: boolean; method: 'clipboard' | 'download'; error?: string }> {
  try {
    const canvas = await renderChessBoardToCanvas(options);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });

    if (!blob) {
      throw new Error('Failed to generate PNG blob');
    }

    // Attempt 1: Native clipboard write image
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob,
          }),
        ]);
        return { success: true, method: 'clipboard' };
      } catch (clipErr) {
        console.warn('Clipboard write failed (iframe permission or restricted browser). Falling back to direct download.', clipErr);
      }
    }

    // Fallback: Automatic direct download of PNG file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echiquier-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { success: true, method: 'download' };
  } catch (err: any) {
    console.error('Export chessboard image failed:', err);
    return { success: false, method: 'download', error: err?.message || 'Erreur d\'export' };
  }
}
