#!/usr/bin/env bash
# AZET Pass app/toolbar icons in the reference's slots: 128 grid, rounded square r=18 (reference measured: 14% radius,
# brand blue rgb(23,93,220), gray rgb(124,124,124), lock badge rgb(85,85,85)), white mark in the glyph box (24,16)-(105,114).
# usage: make-icons.sh <out-dir> <size>...
set -euo pipefail
out=$1; shift; mkdir -p "$out"
MARK='<path fill="#fff" fill-rule="evenodd" transform="translate(32 16) scale(2.46 3.06)" d="M13 1a8 8 0 1 1 0 16a8 8 0 0 1 0-16Zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0-6ZM11 16h4v15h-4ZM15 21h5v3.5h-5ZM15 26.5h4v3.5h-4Z"/>'
LOCK='<g transform="translate(70 70)"><rect x="4" y="22" width="50" height="36" rx="6" fill="#555" stroke="#fff" stroke-width="5"/><path d="M14 22v-8a15 15 0 0 1 30 0v8" fill="none" stroke="#555" stroke-width="8"/></g>'
svg() { echo "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\"><rect width=\"128\" height=\"128\" rx=\"18\" fill=\"$1\"/>$MARK$2</svg>"; }
for s in "$@"; do
  svg '#175ddc' '' | rsvg-convert -w "$s" -h "$s" -o "$out/blue-$s.png"
  svg '#7c7c7c' '' | rsvg-convert -w "$s" -h "$s" -o "$out/gray-$s.png"
  svg '#175ddc' "$LOCK" | rsvg-convert -w "$s" -h "$s" -o "$out/locked-$s.png"
done
