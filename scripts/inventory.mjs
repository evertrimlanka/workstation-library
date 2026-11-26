import { readFileSync, writeFileSync } from "node:fs";
const m = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const fmt = n => n >= 1e9 ? (n/1e9).toFixed(2)+" GB" : n >= 1e6 ? (n/1e6).toFixed(1)+" MB" : (n/1e3).toFixed(0)+" KB";
const by = id => m.areas.find(a => a.id === id);
const L = [];
L.push("# Workstation Asset Inventory","",`Generated ${m.generatedAt.slice(0,10)} from a programmatic walk of the corpus. Read-only — nothing here was modified.`,"");
L.push("## Totals","",`| Metric | Value |`,`|---|---|`,
  `| Indexed entries | ${m.totals.entries.toLocaleString()} |`,
  `| Files walked | ${m.totals.files.toLocaleString()} |`,
  `| Indexed size | ${m.totals.bytesHuman} |`,"");
L.push("## Areas","",`| Area | Entries | Size | Source |`,`|---|---|---|---|`);
for (const a of m.areas) L.push(`| ${a.label} | ${a.count.toLocaleString()}${a.iconTotal?` (${a.iconTotal.toLocaleString()} files)`:""} | ${fmt(a.bytes)} | \`${a.root.replace(process.env.HOME,"~")}\` |`);
L.push("");

const comp = by("components");
if (comp) {
  const g = {};
  for (const i of comp.items) (g[i.group] ||= []).push(i.name);
  L.push("## Components","",`${comp.count.toLocaleString()} files across ${Object.keys(g).length} source groups.`,"");
  for (const [k,v] of Object.entries(g).sort()) {
    L.push(`### ${k} — ${v.length}`,"", v.sort().join(" · "),"");
  }
}
const eff = by("effects");
if (eff) L.push("## Text & visual effects","",`${eff.count} effects.`,"", eff.items.map(i=>i.name).sort().join(" · "),"");
const icons = by("icons");
if (icons) {
  L.push("## Icon sets","",`${icons.count} sets · ${icons.iconTotal.toLocaleString()} SVG files · ${fmt(icons.bytes)}.`,"",
    "| Set | Icons | Size |","|---|---|---|");
  for (const s of icons.sets) L.push(`| ${s.name} | ${s.count.toLocaleString()} | ${fmt(s.bytes)} |`);
  L.push("");
}
const brands = by("brands");
if (brands) L.push("## Brand design specs","",`${brands.count} DESIGN.md files. Extraction corpus only — never ship as named variants.`,"",
  brands.items.map(i=>i.name).sort().join(" · "),"");
const tools = by("tools");
if (tools) {
  const g = {};
  for (const i of tools.items) (g[i.group] ||= []).push(i.name);
  L.push("## Tools catalogue","",`${tools.count} tools in ${Object.keys(g).length} categories.`,"");
  for (const [k,v] of Object.entries(g).sort()) L.push(`### ${k} — ${v.length}`,"", v.sort().join(" · "),"");
}
const aud = by("audits");
if (aud) L.push("## UX audits","",`${aud.count} files · ${fmt(aud.bytes)}.`,"", aud.items.map(i=>`\`${i.file}\``).join(" · "),"");
writeFileSync(new URL("../INVENTORY.md", import.meta.url), L.join("\n"));
console.log("INVENTORY.md written:", L.length, "lines");
