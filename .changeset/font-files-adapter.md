---
'@flamboyantengineer/document-editor': minor
---

The fonts adapter can serve the font files Pretext layout measures with: `shaper()` gives HarfBuzz's WebAssembly module, and `files(families, { signal })` gives the faces of the named families as WOFF 1.0 or OpenType bytes (`FontShaper`, `FontFaceFile`, `FontFiles`). Each face that cannot be read, such as empty bytes, an unknown style, a weight outside 1 to 1000 or a WOFF2 file, is reported as a problem rather than thrown. The editor does not lay pages out with them yet.
