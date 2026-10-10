// Nach dem Build: Startseite, Server-Einstellungen, Aufräumen
import { copyFileSync, writeFileSync, rmSync } from "fs";

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
</IfModule>
`);

for (const f of ["maintenance", "includeIDE.js"]) rmSync(`${out}/${f}`, { recursive: true, force: true });
console.log("JPad: dist-jpad ist fertig zum Hochladen.");
