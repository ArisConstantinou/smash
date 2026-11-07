#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p assets/wasm
${CLANG:-clang} --target=wasm32 -O3 -fno-fast-math -ffp-contract=off -nostdlib \
  -Wl,--no-entry -Wl,--export-memory -Wl,--initial-memory=393216 -Wl,--max-memory=393216 \
  -Wl,--strip-all -o assets/wasm/collision.wasm native/collision.c
