import spritesheetjson from '/assets/graphics/spritesheet.json.txt';
import spritesheetpng from '/assets/graphics/spritesheet.png';
import { icon } from "./Icons.js";
import { escapeHtml } from "./LanguageBridge.js";

/**
 * „Sprite Bibliothek“: zeigt alle eingebauten Sprites der Online-IDE mit ihren Nummern.
 * Grundlage ist dasselbe Spritesheet (Bild + JSON), das auch der Interpreter verwendet.
 * Ein Tipp auf ein Bild kopiert den passenden Java-Code.
 */

type Frame = { index: number, x: number, y: number, w: number, h: number };
type SpriteSet = { name: string, frames: Frame[] };

const BOX = 76;          // Kantenlänge der Vorschaufläche in px
const MAX_ZOOM = 4;      // kleine Pixelgrafiken höchstens 4-fach vergrößern

let cache: { sets: SpriteSet[], sheetW: number, sheetH: number } | null = null;

async function loadSets() {
    if (cache) return cache;
    const data = await (await fetch(spritesheetjson)).json();
    const groups = new Map<string, Frame[]>();
    for (const key of Object.keys(data.frames)) {
        const m = key.match(/^(.*)#(\d+)$/);
        if (!m) continue;
        const f = data.frames[key].frame;
        if (!groups.has(m[1])) groups.set(m[1], []);
        groups.get(m[1])!.push({ index: parseInt(m[2]), x: f.x, y: f.y, w: f.w, h: f.h });
    }
    const sets: SpriteSet[] = [];
    groups.forEach((frames, name) => sets.push({ name, frames: frames.sort((a, b) => a.index - b.index) }));

    // Größe des Spritesheets (für die Skalierung des Hintergrundbilds)
    const img = new Image();
    img.src = spritesheetpng;
    await img.decode();
    cache = { sets, sheetW: img.naturalWidth, sheetH: img.naturalHeight };
    return cache;
}

export async function openSpriteLibrary(root: HTMLElement, toast: (text: string, iconName?: string) => void) {
    const layer = document.createElement("div");
    layer.className = "jp-sheet-layer jp-handbook-layer";
    layer.innerHTML = `
        <div class="jp-handbook jp-sprites" role="dialog" aria-modal="true" aria-label="Sprite Bibliothek">
            <header class="jp-handbook-head">
                <h2>Sprite Bibliothek</h2>
                <span class="jp-handbook-count"></span>
                <button class="jp-iconbtn jp-handbook-close" aria-label="Schließen">${icon("close")}</button>
            </header>
            <div class="jp-sprite-example">
                <pre><span class="tok-type">Sprite</span> s = <span class="tok-kw">new</span> <span class="tok-type">Sprite</span>(<span class="tok-num">100</span>, <span class="tok-num">150</span>, <span class="tok-type">SpriteLibrary</span>.Minesweeper, <span class="tok-num">3</span>);</pre>
                <p>Erzeugt an der Stelle (100 | 150) ein Sprite mit Bild Nr. 3 der Reihe „Minesweeper“.
                Tippe auf ein Bild, um den passenden Code zu kopieren.</p>
            </div>
            <label class="jp-handbook-search">
                ${icon("search")}
                <input type="search" placeholder="Reihe suchen, z. B. Minesweeper, Space, Bird"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
            </label>
            <div class="jp-handbook-list jp-sprite-list"><div class="jp-empty"><p>Sprites werden geladen …</p></div></div>
            <p class="jp-handbook-source">Grafiken aus der Sprite-Bibliothek der Online-IDE von Martin Pabst.</p>
        </div>`;
    root.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add("is-open"));

    const list = layer.querySelector<HTMLElement>(".jp-sprite-list")!;
    const input = layer.querySelector<HTMLInputElement>("input")!;
    const count = layer.querySelector<HTMLElement>(".jp-handbook-count")!;

    const close = () => {
        layer.classList.remove("is-open");
        document.removeEventListener("keydown", onKey);
        setTimeout(() => layer.remove(), 200);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key == "Escape") close(); };
    document.addEventListener("keydown", onKey);
    layer.querySelector(".jp-handbook-close")!.addEventListener("click", close);
    layer.addEventListener("click", e => { if (e.target == layer) close(); });

    let data: Awaited<ReturnType<typeof loadSets>>;
    try {
        data = await loadSets();
    } catch (e) {
        list.innerHTML = `<div class="jp-empty"><p>Die Sprites konnten nicht geladen werden.</p></div>`;
        return;
    }

    const tile = (set: SpriteSet, f: Frame): string => {
        const zoom = Math.min(MAX_ZOOM, BOX / Math.max(f.w, f.h));
        const w = Math.round(f.w * zoom), h = Math.round(f.h * zoom);
        const pixelated = zoom > 1 ? " is-pixelated" : "";
        const code = `new Sprite(100, 150, SpriteLibrary.${set.name}, ${f.index})`;
        return `<button class="jp-sprite-tile" data-code="${escapeHtml(code)}" aria-label="${escapeHtml(set.name)} Nummer ${f.index}">
            <span class="jp-sprite-box"><span class="jp-sprite-img${pixelated}" style="width:${w}px;height:${h}px;
                background-image:url('${spritesheetpng}');
                background-size:${data.sheetW * zoom}px ${data.sheetH * zoom}px;
                background-position:${-f.x * zoom}px ${-f.y * zoom}px"></span></span>
            <span class="jp-sprite-nr">Nr. ${f.index}</span>
            <span class="jp-sprite-size">${f.w} × ${f.h}</span>
        </button>`;
    };

    const render = () => {
        const filter = input.value.trim().toLowerCase();
        const sets = data.sets.filter(s => !filter || s.name.toLowerCase().includes(filter));
        list.innerHTML = sets.map(s => `
            <section class="jp-sprite-set">
                <h3><code>SpriteLibrary.${escapeHtml(s.name)}</code><span>${s.frames.length} ${s.frames.length == 1 ? "Bild" : "Bilder"}</span></h3>
                <div class="jp-sprite-grid">${s.frames.map(f => tile(s, f)).join("")}</div>
            </section>`).join("")
            || `<div class="jp-empty">${icon("search")}<p>Keine Reihe gefunden für „${escapeHtml(input.value.trim())}“.</p></div>`;
        const total = sets.reduce((n, s) => n + s.frames.length, 0);
        count.textContent = `${sets.length} Reihen · ${total} Bilder`;
    };

    list.addEventListener("click", async e => {
        const t = (<HTMLElement>e.target).closest<HTMLElement>("[data-code]");
        if (!t) return;
        const code = t.dataset.code!;
        try {
            await navigator.clipboard.writeText(code);
            toast(`Kopiert: ${code}`, "check");
        } catch (err) {
            toast(code, "info");
        }
        list.querySelectorAll(".is-copied").forEach(x => x.classList.remove("is-copied"));
        t.classList.add("is-copied");
    });

    let timer: any;
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 120); });
    render();
}
