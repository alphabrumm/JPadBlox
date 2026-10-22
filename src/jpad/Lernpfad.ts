/**
 * Lernpfade für JPad-Projekte.
 *
 * Ein Lernpfad ist eine HTML-Seite, die in der Projektdatei (Feld `lernpfadHtml`) mitreist
 * und im Reiter „Lernpfad“ angezeigt wird. Damit die Projektdatei eine einzige Datei bleibt,
 * werden Bilder und andere eingebundene Dateien als data-URIs direkt ins HTML geschrieben.
 *
 * Eingebettet werden kann
 * - eine einzelne HTML-Datei oder
 * - ein ZIP mit index.html (bzw. der ersten HTML-Datei) und Unterordnern wie img/.
 */

import JSZip from "jszip";

const MIME: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
    css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    pdf: "application/pdf", txt: "text/plain", java: "text/plain"
};

function mimeOf(path: string): string {
    const ext = path.split(".").pop()!.toLowerCase();
    return MIME[ext] || "application/octet-stream";
}

/** Normalisiert einen Pfad im ZIP („a/./b/../c“ → „a/c“). */
function normalize(path: string): string {
    const out: string[] = [];
    for (const part of path.split("/")) {
        if (part == "" || part == ".") continue;
        if (part == "..") out.pop(); else out.push(part);
    }
    return out.join("/");
}

function isExternal(ref: string): boolean {
    return /^([a-z][a-z0-9+.-]*:|\/\/|#|\$\{)/i.test(ref) || ref.trim() == "";
}

/** Liest eine HTML- oder ZIP-Datei und liefert eine eigenständige HTML-Seite. */
export async function readLernpfadFile(file: File): Promise<string> {
    const isZip = /\.zip$/i.test(file.name) || file.type == "application/zip";
    const html = isZip ? await fromZip(file) : await file.text();
    if (!/<(html|body|div|p|h1|h2|section|main)\b/i.test(html)) {
        throw new Error(`„${file.name}“ sieht nicht nach einem Lernpfad (HTML-Seite) aus.`);
    }
    return html;
}

async function fromZip(file: File): Promise<string> {
    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch (e) {
        throw new Error(`„${file.name}“ ist kein lesbares ZIP-Archiv.`);
    }
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir && !/(^|\/)(__MACOSX|\.)/.test(n));
    const htmlFiles = names.filter(n => /\.html?$/i.test(n))
        .sort((a, b) => a.split("/").length - b.split("/").length);
    const main = htmlFiles.find(n => /(^|\/)index\.html?$/i.test(n)) || htmlFiles[0];
    if (!main) throw new Error(`Im ZIP „${file.name}“ ist keine HTML-Seite.`);

    const base = main.includes("/") ? main.substring(0, main.lastIndexOf("/") + 1) : "";
    const cache = new Map<string, string | null>();

    const dataUri = async (ref: string): Promise<string | null> => {
        const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
        const path = normalize(base + clean);
        if (cache.has(path)) return cache.get(path)!;
        const entry = zip.file(path);
        let uri: string | null = null;
        if (entry) {
            const b64 = await entry.async("base64");
            uri = `data:${mimeOf(path)};base64,${b64}`;
        }
        cache.set(path, uri);
        return uri;
    };

    let html = await zip.file(main)!.async("string");

    // src="…", href="…" (Stylesheets, Downloads), poster="…" sowie url(…) in CSS
    const pattern = /(\s(?:src|href|poster)\s*=\s*)(["'])([^"']*)\2|url\(\s*(["']?)([^"')]+)\4\s*\)/gi;
    const refs = new Set<string>();
    for (const m of html.matchAll(pattern)) {
        const ref = m[3] ?? m[5];
        if (ref && !isExternal(ref)) refs.add(ref);
    }
    const resolved = new Map<string, string>();
    for (const ref of refs) {
        const uri = await dataUri(ref);
        if (uri) resolved.set(ref, uri);
    }
    html = html.replace(pattern, (all, attr, q, ref1, q2, ref2) => {
        if (attr) {
            const uri = resolved.get(ref1);
            return uri ? `${attr}${q}${uri}${q}` : all;
        }
        const uri = resolved.get(ref2);
        return uri ? `url("${uri}")` : all;
    });
    return html;
}
