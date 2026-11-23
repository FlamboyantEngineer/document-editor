# Script fonts for the closeness checks

Subsets of Noto fonts (SIL Open Font License 1.1, see `OFL.txt`) that the Pretext lab serves under `?scripts`
(DOCE-LABS-7.3) and the font-file measurer's unit tests read (DOCE-PAGINATION-12.2). Each file is one of the
`@fontsource` WOFF files below, cut to the characters of `e2e/pretext-scripts.ts`, with every layout feature kept; it
keeps its original `unicode-range` (`faces.json`), so the families are served in parts as a web font host serves them,
and the emoji family's sequences reach across parts.

| Family               | Source package                                |
| -------------------- | --------------------------------------------- |
| Lab Noto Arabic      | `@fontsource/noto-sans-arabic@5.3.0`          |
| Lab Noto Hebrew      | `@fontsource/noto-sans-hebrew@5.3.0`          |
| Lab Noto Devanagari  | `@fontsource/noto-sans-devanagari@5.3.0`      |
| Lab Noto Thai        | `@fontsource/noto-sans-thai@5.3.0`            |
| Lab Noto SC          | `@fontsource/noto-sans-sc@5.3.1`              |
| Lab Noto Symbols 2   | `@fontsource/noto-sans-symbols-2@5.3.0`       |
| Lab Noto Color Emoji | `@fontsource/noto-color-emoji@5.3.2` (COLRv1) |

To cut them again after changing the words, for each 400-weight WOFF of a package that has one of the characters in
its `unicode-range` and draws it, except the parts for scripts Geist serves (latin, latin-ext, cyrillic, cyrillic-ext,
vietnamese, greek), run fontTools' `pyftsubset <file> --text=<characters> --layout-features='*' --flavor=woff
--no-hinting`, where the characters are `scriptCharacters()` of `e2e/pretext-scripts.ts` plus ` ()[],.:;!?-0123456789`,
and give the face its rule's `unicode-range` in `faces.json`.
