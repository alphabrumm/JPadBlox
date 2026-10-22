/**
 * Lernpfade für JPad-Projekte.
 *
 * Ein Lernpfad ist eine HTML-Seite, die in der Projektdatei (Feld `lernpfadHtml`) mitreist
 * und im Reiter „Lernpfad“ angezeigt wird. Damit die Projektdatei eine einzige Datei bleibt,
 * werden Bilder und andere eingebundene Dateien als data-URIs direkt ins HTML geschrieben.
 *
 * Quellen:
 * - eine einzelne HTML-Datei oder ein ZIP (index.html mit Unterordnern wie img/), z. B. über das Menü
 * - ein Link: jpad…/?lernpfad=<URL zu .html/.zip/.json> bzw. ?projekt=<URL zu .json>
 */

import JSZip from "jszip";
import { ProjectFile, ProjectStore } from "./ProjectStore.js";

const MIME: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
    css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    pdf: "application/pdf", txt: "text/plain", java: "text/plain"
};

function mimeOf(path: string): string {
    const ext = path.split(/[?#]/)[0].split(".").pop()!.toLowerCase();
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

function looksLikeHtml(text: string): boolean {
    return /<(html|body|div|p|h1|h2|section|main)\b/i.test(text);
}

function bytesToBase64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

/**
 * Ersetzt eingebundene Dateien (src, href von Stylesheets/Bildern, poster, url(...)) durch das,
 * was `resolve` liefert (meist eine data-URI). Liefert `resolve` null, bleibt der Verweis stehen.
 * Links auf andere HTML-Seiten werden nicht eingebettet, sondern nur über `link` umgeschrieben.
 */
async function inlineResources(html: string, resolve: (ref: string) => Promise<string | null>,
    link?: (ref: string) => string | null): Promise<string> {
    const pattern = /(\s(src|href|poster)\s*=\s*)(["'])([^"']*)\3|url\(\s*(["']?)([^"')]+)\5\s*\)/gi;
    const isPage = (attr: string | undefined, ref: string) => attr?.toLowerCase() == "href" && /\.html?([?#]|$)/i.test(ref);
    const refs = new Set<string>();
    for (const m of html.matchAll(pattern)) {
        const ref = m[4] ?? m[6];
        if (ref && !isExternal(ref) && !isPage(m[2], ref)) refs.add(ref);
    }
    const resolved = new Map<string, string>();
    for (const ref of refs) {
        const uri = await resolve(ref);
        if (uri) resolved.set(ref, uri);
    }
    return html.replace(pattern, (all, attr, name, q, ref1, q2, ref2) => {
        if (attr) {
            if (isExternal(ref1)) return all;
            const uri = isPage(name, ref1) ? link?.(ref1) : resolved.get(ref1);
            return uri ? `${attr}${q}${uri}${q}` : all;
        }
        const uri = resolved.get(ref2);
        return uri ? `url("${uri}")` : all;
    });
}

/** Liest eine HTML- oder ZIP-Datei und liefert eine eigenständige HTML-Seite. */
export async function readLernpfadFile(file: File): Promise<string> {
    const isZip = /\.zip$/i.test(file.name) || file.type == "application/zip";
    const html = isZip ? await fromZip(await file.arrayBuffer(), file.name) : await file.text();
    if (!looksLikeHtml(html)) {
        throw new Error(`„${file.name}“ sieht nicht nach einem Lernpfad (HTML-Seite) aus.`);
    }
    return html;
}

async function fromZip(data: ArrayBuffer, label: string): Promise<string> {
    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(data);
    } catch (e) {
        throw new Error(`„${label}“ ist kein lesbares ZIP-Archiv.`);
    }
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir && !/(^|\/)(__MACOSX|\.)/.test(n));
    const htmlFiles = names.filter(n => /\.html?$/i.test(n))
        .sort((a, b) => a.split("/").length - b.split("/").length);
    const main = htmlFiles.find(n => /(^|\/)index\.html?$/i.test(n)) || htmlFiles[0];
    if (!main) throw new Error(`Im ZIP „${label}“ ist keine HTML-Seite.`);

    const base = main.includes("/") ? main.substring(0, main.lastIndexOf("/") + 1) : "";
    const html = await zip.file(main)!.async("string");
    return inlineResources(html, async (ref) => {
        const path = normalize(base + decodeURIComponent(ref.split(/[?#]/)[0]));
        const entry = zip.file(path);
        return entry ? `data:${mimeOf(path)};base64,${await entry.async("base64")}` : null;
    });
}

/** HTML von einer Adresse: Bilder usw. werden mitgeladen und eingebettet. */
async function fromUrlHtml(html: string, url: string): Promise<string> {
    return inlineResources(html, async (ref) => {
        const abs = new URL(ref, url).href;
        try {
            const r = await fetch(abs);
            if (!r.ok) return abs;
            const type = r.headers.get("content-type")?.split(";")[0] || mimeOf(abs);
            return `data:${type};base64,${bytesToBase64(new Uint8Array(await r.arrayBuffer()))}`;
        } catch (e) {
            return abs; // nicht ladbar (z. B. CORS): wenigstens die volle Adresse eintragen
        }
    }, (ref) => new URL(ref, url).href);
}

/**
 * Notlösung, wenn der Server das Laden verweigert (CORS): Der Lernpfad wird direkt von seiner
 * Adresse angezeigt. Das klappt nur online und nur, wenn die Seite das Einbetten erlaubt.
 */
function framePage(url: string): string {
    const u = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
        + `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head>`
        + `<body><iframe src="${u}" allow="clipboard-write; fullscreen"></iframe></body></html>`;
}

function titleOf(html: string): string | undefined {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!m) return undefined;
    const div = document.createElement("div");
    div.innerHTML = m[1];
    const t = div.textContent?.replace(/\s+/g, " ").trim();
    return t || undefined;
}

function nameFromUrl(url: string): string {
    const parts = new URL(url).pathname.split("/").filter(s => s).map(s => decodeURIComponent(s));
    // „…/schaf-konstruktor/index.html“ → Ordnername
    if (parts.length > 0 && /^index\.html?$/i.test(parts[parts.length - 1])) parts.pop();
    const last = parts.pop() || "Lernpfad";
    return last.replace(/\.(html?|zip|json)$/i, "").replace(/[_-]+/g, " ").trim() || "Lernpfad";
}

export type LinkedProject = {
    name: string;
    files: ProjectFile[];
    spritesheetBase64?: string;
    lernpfadHtml?: string;
    /** Hinweis für die Lehrkraft/den Schüler, z. B. wenn nur die Notlösung möglich war */
    note?: string;
};

function corsError(url: string): Error {
    return new Error(`JPad kann „${url}“ nicht laden. Entweder ist die Adresse falsch, das Gerät offline, `
        + `oder der Server erlaubt anderen Seiten das Laden nicht (CORS). Am einfachsten liegt die Datei auf demselben `
        + `Server wie JPad oder auf GitHub Pages.`);
}

/**
 * Lädt ein Projekt bzw. einen Lernpfad über einen Link.
 * - `projekt`: Projektdatei (.json), darf selbst schon einen Lernpfad enthalten
 * - `lernpfad`: HTML-Seite, ZIP oder ebenfalls eine Projektdatei (.json)
 */
export async function loadLinkedProject(projekt: string | null, lernpfad: string | null): Promise<LinkedProject> {
    let result: LinkedProject | undefined;
    const load = async (url: string): Promise<LinkedProject> => {
        let r: Response;
        try {
            r = await fetch(url);
        } catch (e) {
            throw corsError(url);
        }
        if (!r.ok) throw new Error(`„${url}“ wurde nicht gefunden (Fehler ${r.status}).`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (bytes[0] == 0x50 && bytes[1] == 0x4b) { // „PK“: ZIP
            const html = await fromZip(bytes.buffer, nameFromUrl(url));
            return { name: titleOf(html) || nameFromUrl(url), files: [], lernpfadHtml: html };
        }
        const text = new TextDecoder().decode(bytes);
        if (/^\s*[\[{]/.test(text)) {
            const p = ProjectStore.parseImport(text, nameFromUrl(url) + ".json");
            return { name: p.name, files: p.files, spritesheetBase64: p.spritesheetBase64, lernpfadHtml: p.lernpfadHtml };
        }
        if (!looksLikeHtml(text)) throw new Error(`„${url}“ ist weder ein Lernpfad (HTML/ZIP) noch eine Projektdatei.`);
        const html = await fromUrlHtml(text, r.url || url);
        return { name: titleOf(html) || nameFromUrl(url), files: [], lernpfadHtml: html };
    };

    if (projekt) result = await load(projekt);
    if (lernpfad) {
        let l: LinkedProject;
        try {
            l = await load(lernpfad);
        } catch (e) {
            // HTML-Seite, die nicht geladen werden darf: direkt anzeigen (nur online)
            if (/\.zip([?#]|$)/i.test(lernpfad) || /\.json([?#]|$)/i.test(lernpfad)) throw e;
            l = {
                name: nameFromUrl(lernpfad), files: [], lernpfadHtml: framePage(lernpfad),
                note: "Der Lernpfad wird direkt von seiner Adresse angezeigt und braucht deshalb eine Internetverbindung."
            };
        }
        if (result) {
            result.lernpfadHtml = l.lernpfadHtml;
            result.note = l.note;
        } else {
            result = l;
        }
    }
    if (!result) throw new Error("Im Link fehlt die Adresse des Lernpfads.");
    return result;
}
