import { SpritesheetData } from "../client/spritemanager/SpritesheetData.js";
import type { PixiSpritesheetData } from "../client/spritemanager/PixiSpritesheetData.js";
import type { Dialogs } from "./Dialogs.js";
import { icon } from "./Icons.js";
import { escapeHtml } from "./LanguageBridge.js";
import { builtinSpriteNames } from "./SpriteLibraryView.js";

/**
 * „Eigene Sprites“: Bilder aus Fotos/Dateien werden zu einem Spritesheet im Format der
 * Online-IDE zusammengepackt (Zip mit spritesheet.png + spritesheet.json, Frames „Name#Index“).
 *
 * Das Laden in Compiler und Grafik übernimmt unverändert
 * SpritesheetData.initializeSpritesheetForWorkspace von Martin Pabst: Jede Reihe wird dabei zu
 * einem zusätzlichen Wert der Aufzählung SpriteLibrary, z. B. SpriteLibrary.Rakete.
 * In der Projektdatei steckt das Zip als spritesheetBase64 – genau wie in der Online-IDE.
 */

export type UserSprite = { series: string, index: number, canvas: HTMLCanvasElement };

/** Längere Seite größerer Bilder wird auf diesen Wert verkleinert (Hintergründe bis 800 × 600 bleiben scharf). */
const MAX_SIDE = 800;
/** Abstand zwischen den Bildern im Spritesheet (1 px davon wird mit dem Randpixel gefüllt) */
const PAD = 2;
/** Größte Texturkante, die auch ältere iPads sicher können */
const MAX_SHEET = 4096;

const JAVA_KEYWORDS = new Set(("abstract assert boolean break byte case catch char class const continue default do double else enum " +
    "extends final finally float for goto if implements import instanceof int interface long native new package private protected " +
    "public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var").split(" "));

// ---------------------------------------------------------------------
// Spritesheet lesen und schreiben
// ---------------------------------------------------------------------

export async function unpackSheet(zip: Uint8Array): Promise<UserSprite[]> {
    const sd = new SpritesheetData();
    await sd.unpackZip(zip);
    const w = sd.pixiSpritesheetData.meta.size.w, h = sd.pixiSpritesheetData.meta.size.h;
    const full = document.createElement("canvas");
    full.width = w; full.height = h;
    full.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(sd.pngImageData.buffer, sd.pngImageData.byteOffset, w * h * 4), w, h), 0, 0);

    const result: UserSprite[] = [];
    for (const key of Object.keys(sd.pixiSpritesheetData.frames)) {
        const m = key.match(/^(.*)#(\d+)$/);
        if (!m) continue;
        const f = sd.pixiSpritesheetData.frames[key].frame;
        const c = document.createElement("canvas");
        c.width = Math.max(1, f.w); c.height = Math.max(1, f.h);
        c.getContext("2d")!.drawImage(full, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        result.push({ series: m[1], index: parseInt(m[2]), canvas: c });
    }
    return sortSprites(result);
}

export async function packSheet(sprites: UserSprite[]): Promise<Uint8Array | null> {
    if (sprites.length == 0) return null;

    // Regalpacken: nach Höhe sortiert, zeilenweise von links nach rechts
    const order = [...sprites].sort((a, b) => b.canvas.height - a.canvas.height);
    const widest = Math.max(...order.map(s => s.canvas.width));
    const sheetW = Math.min(MAX_SHEET, Math.max(1024, widest + 2 * PAD));
    const places: { s: UserSprite, x: number, y: number }[] = [];
    let x = PAD, y = PAD, rowH = 0;
    for (const s of order) {
        const w = s.canvas.width, h = s.canvas.height;
        if (x + w + PAD > sheetW) { x = PAD; y += rowH + PAD; rowH = 0; }
        places.push({ s, x, y });
        x += w + PAD;
        rowH = Math.max(rowH, h);
    }
    const sheetH = y + rowH + PAD;
    if (sheetH > MAX_SHEET) {
        throw new Error("Die Bilder sind zusammen zu groß. Lösche ein paar Bilder oder verwende kleinere.");
    }

    const sheet = document.createElement("canvas");
    sheet.width = sheetW; sheet.height = sheetH;
    const ctx = sheet.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const frames: PixiSpritesheetData["frames"] = {};
    for (const { s, x, y } of places) {
        const c = s.canvas, w = c.width, h = c.height;
        // Randpixel um 1 px nach außen verlängern: verhindert Säume beim weichen Skalieren
        ctx.drawImage(c, 0, 0, w, 1, x, y - 1, w, 1);
        ctx.drawImage(c, 0, h - 1, w, 1, x, y + h, w, 1);
        ctx.drawImage(c, 0, 0, 1, h, x - 1, y, 1, h);
        ctx.drawImage(c, w - 1, 0, 1, h, x + w, y, 1, h);
        ctx.drawImage(c, 0, 0, w, h, x, y, w, h);
        frames[s.series + "#" + s.index] = {
            frame: { x, y, w, h },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w, h },
            sourceSize: { w, h },
            pivot: { x: 0.5, y: 0.5 }
        };
    }

    const blob = await new Promise<Blob | null>(resolve => sheet.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Das Bild konnte nicht erstellt werden.");
    const sd = new SpritesheetData();
    sd.pngFile = new Uint8Array(await blob.arrayBuffer());
    sd.pixiSpritesheetData = {
        frames,
        meta: { app: "JPad", version: "1.0", image: "spritesheet.png", format: "RGBA8888", size: { w: sheetW, h: sheetH }, scale: "1" }
    };
    await sd.makeZip();
    return sd.zipFile;
}

/** Lädt eine Bilddatei (PNG, JPG, GIF, HEIC auf dem iPad …) und verkleinert sie bei Bedarf. */
export async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        try {
            await img.decode();
        } catch (e) {
            throw new Error(`„${file.name}“ lässt sich nicht als Bild öffnen.`);
        }
        let w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) throw new Error(`„${file.name}“ lässt sich nicht als Bild öffnen.`);
        const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        return c;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function sortSprites(list: UserSprite[]): UserSprite[] {
    return list.sort((a, b) => a.series.localeCompare(b.series) || a.index - b.index);
}

/** Macht aus einem Dateinamen einen gültigen Java-Bezeichner, z. B. „rakete-rot.png“ → „RaketeRot“. */
export function suggestName(filename: string): string {
    const base = filename.replace(/\.[^.]*$/, "");
    const words = base.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).filter(w => w.length > 0);
    let name = words.map(w => w[0].toUpperCase() + w.substring(1)).join("");
    if (!name) name = "MeinSprite";
    if (/^\d/.test(name)) name = "Bild" + name;
    return name;
}

// ---------------------------------------------------------------------
// Oberfläche
// ---------------------------------------------------------------------

export type UserSpritesHost = {
    dialogs: Dialogs;
    toast: (text: string, iconName?: string) => void;
    load: () => Promise<Uint8Array | null>;
    /** speichert das Spritesheet (null = keine eigenen Sprites) und meldet es Compiler und Grafik */
    save: (zip: Uint8Array | null) => Promise<void>;
};

export async function openUserSprites(root: HTMLElement, host: UserSpritesHost) {
    const layer = document.createElement("div");
    layer.className = "jp-sheet-layer jp-handbook-layer";
    layer.innerHTML = `
        <div class="jp-handbook jp-sprites jp-usersprites" role="dialog" aria-modal="true" aria-label="Eigene Sprites">
            <header class="jp-handbook-head">
                <h2>Eigene Sprites</h2>
                <span class="jp-handbook-count"></span>
                <button class="jp-iconbtn jp-handbook-close" aria-label="Schließen">${icon("close")}</button>
            </header>
            <div class="jp-sprite-example jp-usersprites-intro"></div>
            <div class="jp-usersprites-bar">
                <button class="jp-btn jp-btn-primary" data-act="add">${icon("plus")}<span>Bilder hinzufügen</span></button>
                <span class="jp-usersprites-busy" hidden>Bilder werden verarbeitet …</span>
            </div>
            <div class="jp-handbook-list jp-sprite-list"><div class="jp-empty"><p>Wird geladen …</p></div></div>
            <p class="jp-handbook-source">Die Bilder gehören zu diesem Projekt. Sie werden mit dem Projekt gespeichert und beim
            Sichern in die Projektdatei geschrieben. Größere Bilder verkleinert JPad auf höchstens ${MAX_SIDE} Pixel.</p>
            <input type="file" accept="image/*" multiple hidden>
        </div>`;
    root.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add("is-open"));

    const list = layer.querySelector<HTMLElement>(".jp-sprite-list")!;
    const intro = layer.querySelector<HTMLElement>(".jp-usersprites-intro")!;
    const count = layer.querySelector<HTMLElement>(".jp-handbook-count")!;
    const busy = layer.querySelector<HTMLElement>(".jp-usersprites-busy")!;
    const fileInput = layer.querySelector<HTMLInputElement>("input[type=file]")!;

    const close = () => {
        layer.classList.remove("is-open");
        document.removeEventListener("keydown", onKey);
        setTimeout(() => layer.remove(), 200);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key == "Escape" && !layer.querySelector(".jp-sheet-layer")) close(); };
    document.addEventListener("keydown", onKey);
    layer.querySelector(".jp-handbook-close")!.addEventListener("click", close);
    layer.addEventListener("click", e => { if (e.target == layer) close(); });

    let sprites: UserSprite[] = [];
    let builtin = new Set<string>();
    try {
        builtin = await builtinSpriteNames();
        const zip = await host.load();
        if (zip) sprites = await unpackSheet(zip);
    } catch (e) {
        console.error(e);
        list.innerHTML = `<div class="jp-empty"><p>Die eigenen Sprites konnten nicht geladen werden.</p></div>`;
        return;
    }

    const thumbs = new WeakMap<HTMLCanvasElement, string>();
    const thumb = (c: HTMLCanvasElement) => {
        let u = thumbs.get(c);
        if (!u) { u = c.toDataURL("image/png"); thumbs.set(c, u); }
        return u;
    };
    const seriesNames = () => [...new Set(sprites.map(s => s.series))];
    const codeFor = (series: string, index: number) => `new Sprite(100, 100, SpriteLibrary.${series}, ${index})`;

    const render = () => {
        const names = seriesNames();
        const first = names[0];
        intro.innerHTML = first
            ? `<pre><span class="tok-type">Sprite</span> s = <span class="tok-kw">new</span> <span class="tok-type">Sprite</span>(<span class="tok-num">100</span>, <span class="tok-num">100</span>, <span class="tok-type">SpriteLibrary</span>.${escapeHtml(first)}, <span class="tok-num">0</span>);</pre>
               <p>Deine Bilder verwendest du wie die eingebauten: Name der Reihe und Nummer des Bildes. Die Koordinaten geben die Bildmitte an – ein Hintergrund für die ganze Welt (800 × 600) gehört also nach (400 | 300). Tippe auf ein Bild für den passenden Code.</p>`
            : `<p class="jp-color-intro">Hol dir Bilder aus der Fotos- oder Dateien-App und verwende sie in deinem Programm als Sprite, zum Beispiel deine eigene Spielfigur.</p>
               <p>Mehrere Bilder mit demselben Namen bilden eine Reihe (Nr. 0, 1, 2 …). So kannst du Figuren animieren.</p>`;
        count.textContent = sprites.length == 0 ? "" : `${names.length} ${names.length == 1 ? "Reihe" : "Reihen"} · ${sprites.length} ${sprites.length == 1 ? "Bild" : "Bilder"}`;

        if (sprites.length == 0) {
            list.innerHTML = `<div class="jp-empty">${icon("image")}<p>Noch keine eigenen Sprites in diesem Projekt.</p></div>`;
            return;
        }
        list.innerHTML = names.map(name => {
            const items = sprites.filter(s => s.series == name);
            return `<section class="jp-sprite-set" data-series="${escapeHtml(name)}">
                <h3><code>SpriteLibrary.${escapeHtml(name)}</code><span>${items.length} ${items.length == 1 ? "Bild" : "Bilder"}</span>
                    <span class="jp-usersprites-seriesbtns">
                        <button class="jp-iconbtn" data-act="addTo" aria-label="Bild zur Reihe ${escapeHtml(name)} hinzufügen" title="Bild hinzufügen">${icon("plus")}</button>
                        <button class="jp-iconbtn" data-act="rename" aria-label="Reihe ${escapeHtml(name)} umbenennen" title="Umbenennen">${icon("edit")}</button>
                        <button class="jp-iconbtn" data-act="deleteSeries" aria-label="Reihe ${escapeHtml(name)} löschen" title="Reihe löschen">${icon("trash")}</button>
                    </span>
                </h3>
                <div class="jp-sprite-grid">${items.map(s => {
                    const w = s.canvas.width, h = s.canvas.height;
                    const zoom = Math.min(4, 76 / Math.max(w, h));
                    return `<button class="jp-sprite-tile" data-index="${s.index}" aria-label="${escapeHtml(name)} Nummer ${s.index}">
                        <span class="jp-sprite-box"><img class="jp-sprite-img${zoom > 1 ? " is-pixelated" : ""}" alt="" src="${thumb(s.canvas)}"
                            style="width:${Math.round(w * zoom)}px;height:${Math.round(h * zoom)}px"></span>
                        <span class="jp-sprite-nr">Nr. ${s.index}</span>
                        <span class="jp-sprite-size">${w} × ${h}</span>
                    </button>`;
                }).join("")}</div>
            </section>`;
        }).join("");
    };

    const validateName = (v: string, allowExisting: boolean, except?: string): string | null => {
        if (v.length == 0) return "Bitte gib einen Namen ein.";
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) return "Nur Buchstaben (ohne Umlaute), Ziffern und _ – und nicht mit einer Ziffer beginnen.";
        if (JAVA_KEYWORDS.has(v)) return `„${v}“ ist ein Java-Schlüsselwort.`;
        if (builtin.has(v)) return `„${v}“ gibt es schon in der Sprite Bibliothek. Wähle einen anderen Namen.`;
        if (!allowExisting && v != except && seriesNames().includes(v)) return `Es gibt schon eine Reihe „${v}“.`;
        return null;
    };

    /** Speichert den neuen Stand; bei einem Fehler bleibt der alte erhalten. */
    const commit = async (next: UserSprite[], message?: string) => {
        busy.hidden = false;
        try {
            const zip = await packSheet(next);
            await host.save(zip);
            sprites = sortSprites(next);
            render();
            if (message) host.toast(message, "check");
        } catch (e: any) {
            await host.dialogs.alert({ title: "Das hat nicht geklappt", text: e?.message || String(e) });
        } finally {
            busy.hidden = true;
        }
    };

    let addTarget: string | null = null;
    const pickFiles = (target: string | null) => {
        addTarget = target;
        fileInput.value = "";
        fileInput.click();
    };

    fileInput.addEventListener("change", async () => {
        const files: File[] = Array.from(fileInput.files ?? []);
        if (files.length == 0) return;
        let name = addTarget;
        if (!name) {
            const entered = await host.dialogs.prompt({
                title: files.length == 1 ? "Bild hinzufügen" : `${files.length} Bilder hinzufügen`,
                label: "Name im Code (SpriteLibrary.…)",
                value: suggestName(files[0].name),
                confirm: "Hinzufügen",
                capitalize: true,
                validate: v => validateName(v.trim(), true)
            });
            if (!entered) return;
            name = entered.trim();
        }
        busy.hidden = false;
        try {
            const canvases: HTMLCanvasElement[] = [];
            for (const f of files) canvases.push(await imageFileToCanvas(f));
            const existing = sprites.filter(s => s.series == name);
            let next = existing.length == 0 ? 0 : Math.max(...existing.map(s => s.index)) + 1;
            const first = next;
            const added = canvases.map(c => ({ series: name!, index: next++, canvas: c }));
            const range = added.length == 1 ? `Nr. ${first}` : `Nr. ${first}–${next - 1}`;
            await commit([...sprites, ...added], `SpriteLibrary.${name}: ${range} hinzugefügt`);
        } catch (e: any) {
            busy.hidden = true;
            await host.dialogs.alert({ title: "Bild lässt sich nicht verwenden", text: e?.message || String(e) });
        }
    });

    layer.querySelector("[data-act=add]")!.addEventListener("click", () => pickFiles(null));

    list.addEventListener("click", async e => {
        const t = <HTMLElement>e.target;
        const section = t.closest<HTMLElement>("[data-series]");
        if (!section) return;
        const series = section.dataset.series!;
        const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;

        if (act == "addTo") { pickFiles(series); return; }

        if (act == "rename") {
            const v = await host.dialogs.prompt({
                title: "Reihe umbenennen", label: "Neuer Name", value: series, confirm: "Umbenennen", capitalize: true,
                validate: v => validateName(v.trim(), false, series)
            });
            if (!v || v.trim() == series) return;
            const newName = v.trim();
            await commit(sprites.map(s => s.series == series ? { ...s, series: newName } : s),
                `Umbenannt in SpriteLibrary.${newName}. Passe deinen Code an.`);
            return;
        }

        if (act == "deleteSeries") {
            const ok = await host.dialogs.confirm({
                title: `Reihe „${series}“ löschen?`,
                text: "Alle Bilder dieser Reihe werden aus dem Projekt entfernt. Code, der sie verwendet, zeigt dann einen Fehler.",
                confirm: "Löschen", danger: true
            });
            if (ok) await commit(sprites.filter(s => s.series != series), `Reihe „${series}“ gelöscht.`);
            return;
        }

        const tile = t.closest<HTMLElement>("[data-index]");
        if (!tile) return;
        const index = parseInt(tile.dataset.index!);
        const choice = await host.dialogs.actions(`${series} Nr. ${index}`, [
            { id: "copy", label: "Code kopieren", icon: "code" },
            { id: "delete", label: "Bild löschen", icon: "trash", danger: true }
        ]);
        if (choice == "copy") {
            const code = codeFor(series, index);
            try { await navigator.clipboard.writeText(code); host.toast(`Kopiert: ${code}`, "check"); }
            catch (err) { host.toast(code, "info"); }
        } else if (choice == "delete") {
            // Die folgenden Bilder der Reihe rücken nach, damit die Nummern lückenlos bleiben.
            const next = sprites.filter(s => !(s.series == series && s.index == index))
                .map(s => s.series == series && s.index > index ? { ...s, index: s.index - 1 } : s);
            await commit(next, `${series} Nr. ${index} gelöscht.`);
        }
    });

    render();
}
