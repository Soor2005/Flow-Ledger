#!/usr/bin/env python3
"""
Revert all accent-color CSS variable substitutions back to their original hardcoded values.
Processes all .jsx and .js files under src/components, src/utils, and src/hooks.
"""

import os
import re
from pathlib import Path

BASE_DIR = r"C:\Users\surya\OneDrive\Documents\Claude\Projects\Flow Ledger\flow-ledger-app\src"
SEARCH_DIRS = [
    os.path.join(BASE_DIR, "components"),
    os.path.join(BASE_DIR, "utils"),
    os.path.join(BASE_DIR, "hooks"),
]


def apply_substitutions(content):
    """Apply all substitutions to content, returning (new_content, total_count)."""
    total = 0

    def sub(pat, repl, text):
        nonlocal total
        result, n = pat.subn(repl, text)
        total += n
        return result

    def sub_fn(pat, fn, text):
        nonlocal total
        result, n = pat.subn(fn, text)
        total += n
        return result

    # ------------------------------------------------------------------
    # 1. RGB-channel variables (most specific – do first)
    #    rgba(var(--color-accent-r,124),var(--color-accent-g,108),var(--color-accent-b,242),
    # ------------------------------------------------------------------
    content = sub(
        re.compile(
            r'rgba\(var\(--color-accent-r,124\),var\(--color-accent-g,108\),var\(--color-accent-b,242\),'
        ),
        'rgba(124,108,242,',
        content
    )

    # ------------------------------------------------------------------
    # 2. Named composite vars WITH explicit fallbacks (longer names first)
    # ------------------------------------------------------------------

    # nav-bg with fallback
    content = sub(
        re.compile(
            r'var\(--color-accent-nav-bg,\s*linear-gradient\(135deg,\s*rgba\(107,92,242,0\.86\)\s*0%,\s*rgba\(85,68,224,0\.80\)\s*100%\)\)'
        ),
        'linear-gradient(135deg, rgba(107,92,242,0.86) 0%, rgba(85,68,224,0.80) 100%)',
        content
    )

    # nav-shadow with fallback
    content = sub(
        re.compile(
            r'var\(--color-accent-nav-shadow,\s*0 4px 18px rgba\(107,92,242,0\.26\),\s*inset 0 1px 0 rgba\(255,255,255,0\.16\)\)'
        ),
        '0 4px 18px rgba(107,92,242,0.26), inset 0 1px 0 rgba(255,255,255,0.16)',
        content
    )

    # nav-border with fallback
    content = sub(
        re.compile(r'var\(--color-accent-nav-border,\s*rgba\(124,108,242,0\.38\)\)'),
        'rgba(124,108,242,0.38)',
        content
    )

    # glow-sm with fallback
    content = sub(
        re.compile(r'var\(--color-accent-glow-sm,\s*0 2px 8px rgba\(124,108,242,0\.45\)\)'),
        '0 2px 8px rgba(124,108,242,0.45)',
        content
    )

    # glow-md with fallback
    content = sub(
        re.compile(r'var\(--color-accent-glow-md,\s*0 5px 16px rgba\(124,108,242,0\.40\)\)'),
        '0 5px 16px rgba(124,108,242,0.40)',
        content
    )

    # ------------------------------------------------------------------
    # 3. Generic alpha vars WITH fallback:
    #    var(--color-accent-aNN,rgba(124,108,242,0.NN))  →  rgba(124,108,242,0.NN)
    # ------------------------------------------------------------------
    def repl_alpha_with_fallback(m):
        return f'rgba(124,108,242,{m.group(2)})'

    content = sub_fn(
        re.compile(r'var\(--color-accent-a(\d{2}),rgba\(124,108,242,(0\.\d+)\)\)'),
        repl_alpha_with_fallback,
        content
    )

    # ------------------------------------------------------------------
    # 4. Named bare composite vars (NO fallback), longest names first
    # ------------------------------------------------------------------
    named_bare = [
        ('var(--color-accent-gradient-end)', '#6b6dff'),
        ('var(--color-accent-nav-bg)',
         'linear-gradient(135deg, rgba(107,92,242,0.86) 0%, rgba(85,68,224,0.80) 100%)'),
        ('var(--color-accent-nav-shadow)',
         '0 4px 18px rgba(107,92,242,0.26), inset 0 1px 0 rgba(255,255,255,0.16)'),
        ('var(--color-accent-nav-border)', 'rgba(124,108,242,0.38)'),
        ('var(--color-accent-avatar)',
         'linear-gradient(135deg, #7c6cf2 0%, #60a5fa 100%)'),
        ('var(--color-accent-glow-sm)', '0 2px 8px rgba(124,108,242,0.45)'),
        ('var(--color-accent-glow-md)', '0 5px 16px rgba(124,108,242,0.40)'),
        ('var(--color-accent-light)', '#9b8ff8'),
        ('var(--color-accent-btn)', 'linear-gradient(135deg, #7c6cf2, #6b6dff)'),
    ]
    for lit, rep in named_bare:
        content = sub(re.compile(re.escape(lit)), rep, content)

    # ------------------------------------------------------------------
    # 5. Bare alpha vars var(--color-accent-aNN)  (no fallback)
    #    Must come AFTER the with-fallback pattern
    # ------------------------------------------------------------------
    def repl_alpha_bare(m):
        nn = m.group(1)
        return f'rgba(124,108,242,0.{nn})'

    content = sub_fn(
        re.compile(r'var\(--color-accent-a(\d{2})\)'),
        repl_alpha_bare,
        content
    )

    # ------------------------------------------------------------------
    # 6. var(--color-accent) in single quotes
    # ------------------------------------------------------------------
    content = sub(
        re.compile(r"'var\(--color-accent\)'"),
        "'#7c6cf2'",
        content
    )

    # ------------------------------------------------------------------
    # 7. var(--color-accent) in double quotes
    # ------------------------------------------------------------------
    content = sub(
        re.compile(r'"var\(--color-accent\)"'),
        '"#7c6cf2"',
        content
    )

    # ------------------------------------------------------------------
    # 8. Bare var(--color-accent) – only the sole CSS value, not inside
    #    a larger gradient or multi-value expression.
    #    We replace when NOT preceded by comma/open-paren and NOT followed
    #    by comma/space+non-closing content.
    # ------------------------------------------------------------------
    content = sub(
        re.compile(
            r"(?<![,(])"            # not part of multi-value (e.g. gradient args)
            r"var\(--color-accent\)"
            r"(?![,\s\da-zA-Z%#])" # not followed by more value tokens
        ),
        '#7c6cf2',
        content
    )

    return content, total


def process_files():
    results = {}
    total_files_changed = 0
    total_subs = 0

    for search_dir in SEARCH_DIRS:
        if not os.path.isdir(search_dir):
            print(f"  [skip] Directory not found: {search_dir}")
            continue
        for root, dirs, files in os.walk(search_dir):
            dirs[:] = [d for d in dirs if d != 'node_modules']
            for fname in files:
                if not (fname.endswith('.jsx') or fname.endswith('.js')):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, 'r', encoding='utf-8') as f:
                        original = f.read()
                except Exception as e:
                    print(f"  [error reading] {fpath}: {e}")
                    continue

                new_content, count = apply_substitutions(original)

                if count > 0:
                    try:
                        with open(fpath, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        results[fpath] = count
                        total_files_changed += 1
                        total_subs += count
                    except Exception as e:
                        print(f"  [error writing] {fpath}: {e}")
                else:
                    results[fpath] = 0

    return results, total_files_changed, total_subs


def main():
    print("=" * 70)
    print("Reverting accent-color CSS variable substitutions")
    print("=" * 70)

    results, total_files_changed, total_subs = process_files()

    print(f"\nFiles scanned: {len(results)}")
    print(f"Files changed: {total_files_changed}")
    print(f"Total substitutions made: {total_subs}")
    print()

    changed = {k: v for k, v in results.items() if v > 0}
    unchanged = {k: v for k, v in results.items() if v == 0}

    if changed:
        print("--- Changed files ---")
        for fpath, count in sorted(changed.items()):
            rel = os.path.relpath(fpath, BASE_DIR)
            print(f"  {count:4d}  {rel}")

    if unchanged:
        print(f"\n--- Unchanged files ({len(unchanged)}) ---")
        for fpath in sorted(unchanged.keys()):
            rel = os.path.relpath(fpath, BASE_DIR)
            print(f"        {rel}")

    print("\nDone.")


if __name__ == "__main__":
    main()
