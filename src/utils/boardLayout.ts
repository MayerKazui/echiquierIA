import { BoardSize } from '../types/ui';

/** Max width of the board (Normal 500px, Grand 640px, XL 760px). */
export const BOARD_MAX_WIDTH: Record<BoardSize, string> = {
  normal: 'max-w-[500px]',
  large: 'max-w-[640px]',
  xl: 'max-w-[760px]',
};

/** Page container width. */
export const PAGE_MAX_WIDTH: Record<BoardSize, string> = {
  normal: 'max-w-7xl',
  large: 'max-w-[1440px]',
  xl: 'max-w-[1600px]',
};

/** Grid column spans of the board column and of the side column (12-column grid). */
export const BOARD_COLUMN_SPAN: Record<BoardSize, string> = {
  normal: 'lg:col-span-7',
  large: 'lg:col-span-8',
  xl: 'lg:col-span-8 xl:col-span-9',
};

export const SIDE_COLUMN_SPAN: Record<BoardSize, string> = {
  normal: 'lg:col-span-5',
  large: 'lg:col-span-4',
  xl: 'lg:col-span-4 xl:col-span-3',
};
