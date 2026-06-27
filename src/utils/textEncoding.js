/**
 * Mojibake repair — fixes UTF-8 text that was previously decoded as
 * Windows-1252 and re-saved (the classic "â€™" / "Â·" corruption pattern).
 *
 * Algorithm: map each character back to the single byte it would have been
 * in cp1252, then re-decode that byte sequence as UTF-8. If any character
 * can't be a cp1252 byte, or the result isn't valid UTF-8, the original
 * string is returned untouched — so normal, uncorrupted text always passes
 * through unchanged.
 */
const CP1252_HIGH_TO_CODEPOINT = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160,
  0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153,
  0x9E: 0x017E, 0x9F: 0x0178,
};
const CODEPOINT_TO_CP1252_BYTE = Object.fromEntries(
  Object.entries(CP1252_HIGH_TO_CODEPOINT).map(([byte, cp]) => [cp, Number(byte)])
);

export function repairMojibake(str) {
  if (typeof str !== 'string' || !str) return str;
  const bytes = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xFF) {
      bytes.push(cp);
    } else if (CODEPOINT_TO_CP1252_BYTE[cp] !== undefined) {
      bytes.push(CODEPOINT_TO_CP1252_BYTE[cp]);
    } else {
      return str; // not mojibake — has a codepoint that can't be a stray byte
    }
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
    return decoded === str ? str : decoded;
  } catch {
    return str;
  }
}
