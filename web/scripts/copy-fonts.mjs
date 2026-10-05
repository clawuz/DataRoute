// Copies the licensed TK web fonts from ../font into public/fonts (git-ignored, never committed).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "font");
const out = join(root, "public", "fonts");
const FILES = [
  "TK_DISPLAY/TK_Display_Web_WOFF2/TK_Display_Condensed_WOFF2/TKDisplayCondensed-SemiBold.woff2",
  "TK_DISPLAY/TK_Display_Web_WOFF2/TK_Display_Condensed_WOFF2/TKDisplayCondensed-Bold.woff2",
  "TK_TEXT/TK_Text_Web_WOFF2/TK_Text_Wide_WOFF2/TKTextWide-Medium.woff2",
  "TK_TEXT/TK_Text_Web_WOFF2/TK_Text_Regular_WOFF2/TKText-Regular.woff2",
  "TK_TEXT/TK_Text_Web_WOFF2/TK_Text_Regular_WOFF2/TKText-Medium.woff2",
];

if (!existsSync(src)) {
  console.warn(`[fonts] ${src} not found — the HUD falls back to system fonts`);
  process.exit(0);
}
mkdirSync(out, { recursive: true });
let copied = 0;
for (const file of FILES) {
  const from = join(src, file);
  if (!existsSync(from)) {
    console.warn(`[fonts] missing ${file}`);
    continue;
  }
  copyFileSync(from, join(out, file.split("/").pop()));
  copied++;
}
console.log(`[fonts] copied ${copied}/${FILES.length} files to public/fonts`);
