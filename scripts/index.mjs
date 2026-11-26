#!/usr/bin/env node
/**
 * Corpus indexer.
 *
 * Turns three scraped/inspected folders into one queryable manifest without
 * adopting any of it. Icons are aggregated per set (292k individual entries
 * would make the manifest useless); everything else is listed individually.
 *
 * Read-only. Never writes into the source corpus.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname, basename, relative } from "node:path";

const HOME = process.env.HOME;
const P = join(HOME, "Workstation/Workspace/projects");

const AREAS = [
  {
    id: "components",
    label: "Components",
    kind: "files",
    description: "Copy-paste UI components from three sources. Substrate inferred from path.",
    root: `${P}/shadcn-io-scrape/recreate`,
    dirs: {
      "animate-ui": "animate-ui",
      "ui-components": "shadcn.io",
      animatekit: "AnimateKit",
    },
    depthLimit: 4
  },
  {
    id: "effects",
    label: "Text & visual effects",
    kind: "files",
    description: "97 text effects scraped, each with its source CSS and attribution.",
    root: `${P}/shadcn-io-scrape/recreate/text-effects`,
    dirs: { "": "text-effects" },
    depthLimit: 3
  },
  {
    id: "icons",
    label: "Icons",
    kind: "sets",
    description: "Icon sets, aggregated. Mixing sets is a quality regression — pick one.",
    root: `${P}/shadcn-io-scrape/recreate/icons`
  },
  {
    id: "brands",
    label: "Brand design specs",
    kind: "brands",
    description: "500 DESIGN.md files. Extraction corpus — never ship as named variants.",
    root: `${P}/shadcn-io-scrape/recreate/design-md`
  },
  {
    id: "tools",
    label: "Tools catalogue",
    kind: "tools",
    description: "518 tools scraped from the shadcn.io sitemap, plus the pipeline that pulled them.",
    root: `${P}/shadcn-tools`
  },
  {
    id: "audits",
    label: "UX audits",
    kind: "files",
    description: "Severity-graded audit findings (S1–S3) — the judgment layer.",
    root: `${P}/audot`,
    dirs: { "": "audits" },
    depthLimit: 4
  }
];

const CODE_EXT = new Set([".tsx", ".ts", ".jsx", ".js", ".css", ".scss", ".html", ".vue", ".svelte"]);

function walk(dir, depth, acc, limit) {
  if (depth > limit) return acc;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, depth + 1, acc, limit);
    else acc.push(full);
  }
  return acc;
}

function fileEntry(full, root, fallbackGroup) {
  let st; try { st = statSync(full); } catch { return null; }
  const rel = relative(root, full);
  const parts = rel.split("/");
  const group = parts.length > 1 ? parts[0] : fallbackGroup;
  return {
    id: rel,
    name: basename(full, extname(full)),
    file: rel,
    group,
    ext: extname(full) || "(none)",
    bytes: st.size,
    code: CODE_EXT.has(extname(full))
  };
}

function inferSubstrate(p) {
  if (/base-ui/i.test(p)) return "Base UI";
  if (/react-aria/i.test(p)) return "React Aria";
  if (/radix/i.test(p)) return "Radix";
  return "—";
}

const out = { generatedAt: new Date().toISOString(), areas: [], totals: { entries: 0, files: 0, bytes: 0 } };

/* ---------- components / effects / audits: list files ---------- */
for (const area of AREAS.filter(a => a.kind === "files")) {
  const items = [];
  for (const [sub, groupLabel] of Object.entries(area.dirs)) {
    const start = sub ? join(area.root, sub) : area.root;
    for (const f of walk(start, 0, [], area.depthLimit)) {
      const e = fileEntry(f, area.root, groupLabel);
      if (!e) continue;
      e.group = sub ? `${groupLabel}${inferSubstrate(e.file) !== "—" ? " · " + inferSubstrate(e.file) : ""}` : groupLabel;
      items.push(e);
    }
  }
  const bytes = items.reduce((a, b) => a + b.bytes, 0);
  out.areas.push({ ...area, count: items.length, bytes, items });
  out.totals.entries += items.length;
  out.totals.files += items.length;
  out.totals.bytes += bytes;
}

/* ---------- icons: aggregate per set ---------- */
{
  const area = AREAS.find(a => a.id === "icons");
  const sets = [];
  let totalFiles = 0, totalBytes = 0;
  let dirs = [];
  try { dirs = readdirSync(area.root, { withFileTypes: true }).filter(d => d.isDirectory()); } catch {}
  for (const d of dirs) {
    if (d.name.startsWith(".")) continue;
    const dir = join(area.root, d.name);
    const files = walk(dir, 0, [], 2);
    const svgs = files.filter(f => f.endsWith(".svg"));
    let bytes = 0;
    for (const f of svgs) { try { bytes += statSync(f).size; } catch {} }
    totalFiles += svgs.length; totalBytes += bytes;
    sets.push({
      id: d.name,
      name: d.name,
      count: svgs.length,
      bytes,
      sample: svgs.slice(0, 10).map(f => basename(f, ".svg"))
    });
  }
  sets.sort((a, b) => b.count - a.count);
  out.areas.push({
    ...area,
    count: sets.length,
    iconTotal: totalFiles,
    bytes: totalBytes,
    sets,
    items: sets.map(s => ({ id: s.id, name: s.name, file: `${s.count} icons`, group: "icon sets", ext: ".svg", bytes: s.bytes, code: false }))
  });
  out.totals.entries += sets.length;
  out.totals.files += totalFiles;
  out.totals.bytes += totalBytes;
}

/* ---------- brands: parse frontmatter ---------- */
{
  const area = AREAS.find(a => a.id === "brands");
  const items = [];
  let files = [];
  try { files = readdirSync(area.root).filter(f => f.endsWith(".md") && f !== "README.md"); } catch {}
  for (const f of files) {
    const full = join(area.root, f);
    let st; try { st = statSync(full); } catch { continue; }
    let text = "";
    try { text = readFileSync(full, "utf8").slice(0, 1200); } catch {}
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    const grab = k => {
      const m = fm && fm[1].match(new RegExp(`^${k}:\\s*(.+)$`, "m"));
      return m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
    };
    items.push({
      id: basename(f, ".md"),
      name: grab("name") || basename(f, ".md"),
      file: f,
      group: "brands",
      ext: ".md",
      bytes: st.size,
      website: grab("website"),
      tags: grab("tags"),
      code: false
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  const bytes = items.reduce((a, b) => a + b.bytes, 0);
  out.areas.push({ ...area, count: items.length, bytes, items });
  out.totals.entries += items.length;
  out.totals.files += items.length;
  out.totals.bytes += bytes;
}

/* ---------- tools: parse TOOLS.md categories ---------- */
{
  const area = AREAS.find(a => a.id === "tools");
  const md = (() => { try { return readFileSync(join(area.root, "TOOLS.md"), "utf8"); } catch { return ""; } })();
  const items = [];
  let cat = "uncategorised";
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*\((\d+)\)/);
    if (h) { cat = h[1]; continue; }
    const li = line.match(/^-\s+(\S+)\s*$/);
    if (li) items.push({ id: li[1], name: li[1], file: `${cat}`, group: cat, ext: "tool", bytes: 0, code: false });
  }
  const cats = [...new Set(items.map(i => i.group))];
  out.areas.push({
    ...area,
    count: items.length,
    bytes: 0,
    categories: cats.length,
    items
  });
  out.totals.entries += items.length;
}

/* ---------- write ---------- */
out.totals.bytesHuman = (out.totals.bytes / 1e9).toFixed(2) + " GB";
writeFileSync(new URL("../manifest.json", import.meta.url), JSON.stringify(out, null, 2));

const line = "─".repeat(64);
console.log(line);
console.log("CORPUS INDEX");
console.log(line);
for (const a of out.areas) {
  const size = (a.bytes / 1e6).toFixed(1) + " MB";
  const extra = a.iconTotal ? ` (${a.iconTotal.toLocaleString()} icon files)` : "";
  const extra2 = a.categories ? `, ${a.categories} categories` : "";
  console.log(`  ${String(a.count).padStart(7)}  ${a.label.padEnd(22)} ${size.padStart(10)}${extra}${extra2}`);
}
console.log(line);
console.log(`  entries: ${out.totals.entries.toLocaleString()}`);
console.log(`  files  : ${out.totals.files.toLocaleString()}`);
console.log(`  size   : ${out.totals.bytesHuman}`);
console.log(line);