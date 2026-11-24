// How every lab's pages lay their text out: with the layout engine, measured and drawn with the
// labs' served font files and HarfBuzz (DOCE-PAGINATION-11, DOCE-HOST-1.14.1).

import { LAB_FONTS } from './served-fonts.js';

/** The editor props every lab's pages are laid out with. */
export const LAB_TEXT_LAYOUT = { textLayout: 'pretext', fonts: LAB_FONTS } as const;
