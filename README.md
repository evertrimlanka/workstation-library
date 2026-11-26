# Workstation Asset Library

A programmatic index of the scraped/inspected asset corpus — **read-only**, nothing adopted.

- `scripts/index.mjs` — walks the corpus, emits `manifest.json`
- `scripts/inventory.mjs` — emits `INVENTORY.md` from the manifest
- `index.html` — browsable library, reads `manifest.json`

## Why an index and not a library

The corpus is ~296k files. Adopting it wholesale would be 296k available ways to be
inconsistent. The index makes it **queryable without adopting it** — inspiration for
review, not a dependency.

## Rebuild

```bash
node scripts/index.mjs && node scripts/inventory.mjs
```

## Honest scope

The walk covers `recreate/` and the tooling docs. It excludes `raw/`, `shots/`, `dist/`
and `.git`, so indexed size (0.35 GB) is smaller than the folder size on disk (3.6 GB).
Icons are aggregated per set — listing 292,701 individual entries would make the
manifest useless.
