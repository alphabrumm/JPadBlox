// Nach dem Build: Startseite, Server-Einstellungen, Aufräumen
import { copyFileSync, writeFileSync, rmSync, readdirSync, existsSync } from "fs";

const out = "dist-jpad";
copyFileSync(`${out}/jpad.html`, `${out}/index.html`);

// Für Apache-Webspaces (die meisten einfachen Hoster)
writeFileSync(`${out}/.htaccess`, `# JPad: Einstellungen für Apache-Webserver
AddType application/wasm .wasm
AddType application/manifest+json .webmanifest
AddType text/javascript .js .mjs

# Immer HTTPS (nötig für Offline-Modus und Teilen-Menü auf dem iPad)
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

# Dateien mit Hash im Namen dürfen lange zwischengespeichert werden
<IfModule mod_headers.c>
  <FilesMatch "\\.(js|css|wasm|woff2?|png|svg|json|txt|mp3)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "(index|jpad)\\.html$|jpad-sw\\.js$|\\.webmanifest$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  # Lernpfade und Projekte in learn/ ändern sich (ohne Hash im Namen): immer neu prüfen
  <If "%{REQUEST_URI} =~ m#/learn/#">
    Header set Cache-Control "no-cache"
  </If>
</IfModule>
`);

// JCodes für alle Lernpfade und Projekte in learn/9 … learn/13 (Ersatz für learn/jcode.php ohne PHP, z. B. GitHub Pages)
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const jcodeOf = rel => {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(rel)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    let c = "";
    for (let i = 0; i < 5; i++) { c += ALPHABET[h & 31]; h >>>= 5; }
    return c;
};
const codes = {};
for (let k = 9; k <= 13; k++) {
    const dir = `${out}/learn/${k}`;
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) if (/\.(json|html)$/.test(f)) codes[jcodeOf(`${k}/${f}`)] = `${k}/${f}`;
}
writeFileSync(`${out}/learn/jcodes.json`, JSON.stringify(codes, null, 1));
console.log("JCodes:", Object.entries(codes).map(([c, f]) => `${c} ${f}`).join(", "));

for (const f of ["maintenance", "includeIDE.js"]) rmSync(`${out}/${f}`, { recursive: true, force: true });
console.log("JPad: dist-jpad ist fertig zum Hochladen.");
