import { ColorHelper } from "../compiler/java/lexer/ColorHelper.js";
import { icon } from "./Icons.js";
import { escapeHtml } from "./LanguageBridge.js";

/**
 * „Color Handbuch“: alle vordefinierten Farben der Klasse Color der Online-IDE.
 * Die Werte stammen direkt aus ColorHelper.predefinedColors, also aus derselben Quelle,
 * die der Interpreter verwendet.
 */

type ColorEntry = { name: string, hex: string, r: number, g: number, b: number, h: number, s: number, l: number };

function toEntry(name: string, value: number): ColorEntry {
    const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max != min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max == rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
        else if (max == gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
    }
    const hex = "#" + value.toString(16).padStart(6, "0").toUpperCase();
    return { name, hex, r, g, b, h, s, l };
}

/** Graustufen ans Ende, sonst nach Farbton, innerhalb ähnlicher Töne nach Helligkeit */
function hueOrder(a: ColorEntry, b: ColorEntry): number {
    const grayA = a.s < 0.12, grayB = b.s < 0.12;
    if (grayA != grayB) return grayA ? 1 : -1;
    if (grayA) return b.l - a.l;
    const ha = Math.round(a.h / 15), hb = Math.round(b.h / 15);
    if (ha != hb) return ha - hb;
    return b.l - a.l;
}

export function openColorBook(root: HTMLElement, toast: (text: string, iconName?: string) => void) {
    const all = Object.entries(ColorHelper.predefinedColors).map(([n, v]) => toEntry(n, v));

    const layer = document.createElement("div");
    layer.className = "jp-sheet-layer jp-handbook-layer";
    layer.innerHTML = `
        <div class="jp-handbook jp-colors" role="dialog" aria-modal="true" aria-label="Color Handbuch">
            <header class="jp-handbook-head">
                <h2>Color Handbuch</h2>
                <span class="jp-handbook-count"></span>
                <button class="jp-iconbtn jp-handbook-close" aria-label="Schließen">${icon("close")}</button>
            </header>
            <div class="jp-sprite-example">
                <p class="jp-color-intro">Farben wählst du über die Klasse <code>Color</code>, z. B. für Füllung und Rand einer Figur:</p>
                <pre><span class="tok-type">Circle</span> c = <span class="tok-kw">new</span> <span class="tok-type">Circle</span>(<span class="tok-num">200</span>, <span class="tok-num">150</span>, <span class="tok-num">50</span>);
c.<span class="tok-fn">setFillColor</span>(<span class="tok-type">Color</span>.green);
c.<span class="tok-fn">setBorderColor</span>(<span class="tok-type">Color</span>.darkslategray);</pre>
                <p>Tippe auf eine Farbe, um <code>Color.name</code> zu kopieren.</p>
            </div>
            <div class="jp-color-tools">
                <label class="jp-handbook-search">
                    ${icon("search")}
                    <input type="search" placeholder="Farbe suchen, z. B. blue, gray, rot"
                        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
                </label>
                <div class="jp-segmented jp-color-sort" role="group" aria-label="Sortierung">
                    <button data-sort="name" aria-pressed="true"><span>A–Z</span></button>
                    <button data-sort="hue" aria-pressed="false"><span>Farbton</span></button>
                </div>
            </div>
            <div class="jp-handbook-list jp-color-list"></div>
            <p class="jp-handbook-source">Farbwerte aus der Klasse Color der Online-IDE von Martin Pabst.</p>
        </div>`;
    root.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add("is-open"));

    const list = layer.querySelector<HTMLElement>(".jp-color-list")!;
    const input = layer.querySelector<HTMLInputElement>("input")!;
    const count = layer.querySelector<HTMLElement>(".jp-handbook-count")!;
    let sort: "name" | "hue" = "name";

    const close = () => {
        layer.classList.remove("is-open");
        document.removeEventListener("keydown", onKey);
        setTimeout(() => layer.remove(), 200);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key == "Escape") close(); };
    document.addEventListener("keydown", onKey);
    layer.querySelector(".jp-handbook-close")!.addEventListener("click", close);
    layer.addEventListener("click", e => { if (e.target == layer) close(); });

    // Deutsche Suchbegriffe auf Farbtöne abbilden
    const german: Record<string, (c: ColorEntry) => boolean> = {
        rot: c => c.s > 0.25 && (c.h < 15 || c.h >= 345),
        orange: c => c.s > 0.25 && c.h >= 15 && c.h < 40,
        gelb: c => c.s > 0.25 && c.h >= 40 && c.h < 70,
        grün: c => c.s > 0.2 && c.h >= 70 && c.h < 170,
        gruen: c => c.s > 0.2 && c.h >= 70 && c.h < 170,
        blau: c => c.s > 0.2 && c.h >= 170 && c.h < 255,
        lila: c => c.s > 0.2 && c.h >= 255 && c.h < 300,
        violett: c => c.s > 0.2 && c.h >= 255 && c.h < 300,
        pink: c => c.s > 0.25 && c.h >= 300 && c.h < 345,
        rosa: c => c.s > 0.25 && (c.h >= 300 || c.h < 15) && c.l > 0.6,
        grau: c => c.s < 0.12,
        braun: c => c.h >= 10 && c.h < 45 && c.l < 0.5 && c.s > 0.2,
    };

    const render = () => {
        const f = input.value.trim().toLowerCase();
        let colors = all.filter(c => !f || c.name.toLowerCase().includes(f) || c.hex.toLowerCase().includes(f)
            || (german[f] ? german[f](c) : false));
        colors = colors.sort(sort == "name" ? (a, b) => a.name.localeCompare(b.name) : hueOrder);
        list.innerHTML = colors.length == 0
            ? `<div class="jp-empty">${icon("search")}<p>Keine Farbe gefunden für „${escapeHtml(input.value.trim())}“.</p></div>`
            : `<div class="jp-color-grid">${colors.map(c => `
                <button class="jp-color-item" data-name="${c.name}" aria-label="Color.${c.name}, ${c.hex}">
                    <span class="jp-color-swatch" style="background:${c.hex}"></span>
                    <span class="jp-color-text">
                        <span class="jp-color-name"><span class="tok-type">Color</span>.${c.name}</span>
                        <span class="jp-color-hex">${c.hex} · ${c.r}, ${c.g}, ${c.b}</span>
                    </span>
                </button>`).join("")}</div>`;
        count.textContent = f ? `${colors.length} von ${all.length} Farben` : `${all.length} Farben`;
    };

    layer.querySelectorAll<HTMLElement>("[data-sort]").forEach(b => b.addEventListener("click", () => {
        sort = <any>b.dataset.sort;
        layer.querySelectorAll<HTMLElement>("[data-sort]").forEach(x => x.setAttribute("aria-pressed", String(x == b)));
        render();
    }));

    list.addEventListener("click", async e => {
        const item = (<HTMLElement>e.target).closest<HTMLElement>("[data-name]");
        if (!item) return;
        const code = "Color." + item.dataset.name;
        try {
            await navigator.clipboard.writeText(code);
            toast(`Kopiert: ${code}`, "check");
        } catch (err) {
            toast(code, "info");
        }
        list.querySelectorAll(".is-copied").forEach(x => x.classList.remove("is-copied"));
        item.classList.add("is-copied");
    });

    let timer: any;
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 100); });
    render();
}
