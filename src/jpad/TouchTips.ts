import { icon } from "./Icons.js";
import { HELP, Help } from "./TipHelp.js";
import { BLOCK_HELP } from "./BlockHelp.js";
import { createLab } from "./SheepLabs.js";

/**
 * Tooltips für Touch-Geräte: Wer eine halbe Sekunde lang den Finger auf einen Button legt,
 * bekommt einen kurzen Hinweis, was der Button bewirkt. Der Button wird dabei NICHT ausgelöst.
 *
 * Inhalt: ausführliche Hilfe aus TipHelp (data-help), sonst ein kurzer Text: data-tip, aria-label,
 * title oder die Beschriftung des Buttons. Wie in QPad bleibt der Hinweis stehen, bis er über
 * sein ✕ (oder durch Tippen daneben) geschlossen wird.
 *
 * Einige Knöpfe (Start, Schritt, Stopp …) reagieren in der Online-IDE schon beim Aufsetzen
 * des Fingers (pointerdown). Bei Touch halten wir dieses Ereignis zurück und reichen es erst
 * beim Loslassen nach – so startet ein langer Druck das Programm nicht.
 */

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;
const DEFERRED = '[data-ref="runBtn"], [data-ref="pauseBtn"], [data-ref="stopBtn"], [data-ref="stepInto"], [data-ref="stepOver"], [data-ref="stepOut"]';
const REPLAY = "_jpTipReplay";

export class TouchTips {

    private timer: any = null;
    private btn: HTMLElement | null = null;
    private startX = 0;
    private startY = 0;
    private deferred: PointerEvent | null = null;
    private suppressClick = false;
    private tipEl: HTMLElement | null = null;
    private tipAnchor: HTMLElement | null = null;

    constructor() {
        const opt = { capture: true, passive: false } as AddEventListenerOptions;
        const passive = { capture: true, passive: true } as AddEventListenerOptions;
        window.addEventListener("pointerdown", e => this.onDown(e), opt);
        window.addEventListener("pointermove", e => this.onMove(e.clientX, e.clientY), passive);
        window.addEventListener("touchmove", e => { const t = e.touches[0]; if (t) this.onMove(t.clientX, t.clientY); }, passive);
        window.addEventListener("pointerup", () => this.onUp(), passive);
        window.addEventListener("touchend", () => this.onUp(), passive);
        window.addEventListener("touchcancel", () => this.cancel(), passive);
        // Nach einem langen Druck darf der folgende Klick (auch der nachgereichte der Hilfsleiste) nichts auslösen
        window.addEventListener("click", e => {
            if (!this.suppressClick) return;
            this.suppressClick = false;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, opt);
        // Kein Kontextmenü / keine Lupe beim langen Drücken auf Buttons
        window.addEventListener("contextmenu", e => {
            if ((<HTMLElement>e.target)?.closest?.("button")) e.preventDefault();
        }, opt);
        window.addEventListener("resize", () => this.hideTip());
        document.addEventListener("keydown", e => { if (e.key == "Escape") this.hideTip(); }, true);
    }

    // ---------------------------------------------------------------- Langes Drücken

    private onDown(e: PointerEvent) {
        if ((e as any)[REPLAY]) return;
        const target = <HTMLElement>e.target;
        this.suppressClick = false;

        // Offenen Hinweis schließen – außer man tippt hinein oder erneut auf seine Glühbirne (die schaltet selbst)
        if (this.tipEl && !this.tipEl.contains(target) && !(this.tipEl.classList.contains("is-info") && this.tipAnchor?.contains(target))) {
            this.hideTip();
        }

        this.cancel();
        // Finger, Stift und (JPadBlox) Maus: langes Drücken mit der linken Maustaste zeigt den Hinweis ebenso
        if (!e.isPrimary) return;
        if (e.pointerType != "touch" && !((e.pointerType == "mouse" || e.pointerType == "pen") && e.button == 0)) return;
        const btn = target?.closest?.<HTMLElement>("button");
        if (!btn || (<HTMLButtonElement>btn).disabled || this.tipEl?.contains(btn)) return;

        this.btn = btn;
        this.startX = e.clientX;
        this.startY = e.clientY;
        if (btn.matches(DEFERRED)) {
            // Erst beim Loslassen weiterreichen (siehe oben)
            // (preventDefault hält den Fokus im Editor, die Tastatur bleibt offen)
            e.stopPropagation();
            e.preventDefault();
            this.deferred = e;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            const b = this.btn;
            this.btn = null;
            this.deferred = null;
            this.suppressClick = true;
            if (b) this.showTip(b);
        }, HOLD_MS);
    }

    private onMove(x: number, y: number) {
        if (!this.timer) return;
        if (Math.abs(x - this.startX) > MOVE_TOLERANCE || Math.abs(y - this.startY) > MOVE_TOLERANCE) this.cancel();
    }

    private onUp() {
        if (!this.timer) return;
        clearTimeout(this.timer);
        this.timer = null;
        const d = this.deferred, b = this.btn;
        this.deferred = null;
        this.btn = null;
        if (d && b && b.isConnected) {
            // Kurzer Tipp: das zurückgehaltene pointerdown jetzt nachreichen
            const ev = new PointerEvent("pointerdown", {
                bubbles: true, cancelable: true, composed: true,
                pointerId: d.pointerId, pointerType: d.pointerType, isPrimary: d.isPrimary,
                clientX: d.clientX, clientY: d.clientY, button: d.button, buttons: d.buttons
            });
            (ev as any)[REPLAY] = true;
            b.dispatchEvent(ev);
        }
    }

    private cancel() {
        clearTimeout(this.timer);
        this.timer = null;
        this.btn = null;
        this.deferred = null;
    }

    static textFor(btn: HTMLElement): string {
        return (btn.dataset.tip || btn.getAttribute("aria-label") || btn.title || btn.textContent || "").replace(/\s+/g, " ").trim();
    }

    // ---------------------------------------------------------------- Anzeige

    private showTip(btn: HTMLElement) {
        const help = btn.dataset.help ? (HELP[btn.dataset.help] ?? BLOCK_HELP[btn.dataset.help]) : undefined;
        const pop = document.createElement("div");
        pop.setAttribute("role", "dialog");
        const close = `<button class="jp-iconbtn jp-tip-close" aria-label="Hinweis schließen">${icon("close")}</button>`;
        if (help) {
            pop.className = "jp-tip is-help";
            pop.setAttribute("aria-label", "Hilfe zu " + help.title);
            pop.innerHTML = renderHelp(help, close);
            // JPadBlox: große Bausteinhilfe mit Werkstatt aus den Lernpfaden
            if (help.lab) {
                pop.classList.add("is-wide");
                const host = pop.querySelector<HTMLElement>("[data-lab]");
                host?.appendChild(createLab(help.lab));
            }
            if (btn.closest(".jp-blockpanel, .jp-blocks-scroll")) pop.classList.add("is-wide");
        } else {
            const text = TouchTips.textFor(btn);
            if (!text) return;
            pop.className = "jp-tip is-short";
            pop.innerHTML = `<p>${esc(text)}</p>${close}`;
        }
        this.place(pop, btn);
    }

    /** Hinweis der Glühbirne (wie in QPad): erklärt das lange Drücken. Erneutes Tippen schließt ihn. */
    toggleInfo(anchor: HTMLElement) {
        if (this.tipEl?.classList.contains("is-info")) { this.hideTip(); return; }
        const pop = document.createElement("div");
        pop.className = "jp-tip is-info";
        pop.setAttribute("role", "dialog");
        pop.innerHTML = `
            <span class="jp-tip-info-icon">${icon("lightbulb")}</span>
            <p>Weißt Du nicht, was ein Button bewirkt? Lege einfach eine halbe Sekunde lang Deinen Finger auf den Button (oder halte die Maustaste so lange gedrückt), um Hilfe zu bekommen.</p>
            <button class="jp-iconbtn jp-tip-close" aria-label="Hinweis schließen">${icon("close")}</button>`;
        this.place(pop, anchor);
    }

    /** Unter (oder notfalls über) dem Button platzieren */
    private place(pop: HTMLElement, anchor: HTMLElement) {
        this.hideTip();
        // Buttons im Hinweis sollen dem Editor den Fokus nicht nehmen (sonst klappt die Tastatur zu)
        pop.querySelectorAll("button").forEach(b => b.addEventListener("pointerdown", e => e.preventDefault()));
        pop.querySelector<HTMLElement>(".jp-tip-close")?.addEventListener("click", () => this.hideTip());
        document.body.appendChild(pop);
        this.tipEl = pop;
        this.tipAnchor = anchor;
        const r = anchor.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.visualViewport?.height ?? window.innerHeight; // ohne Bildschirmtastatur
        // JPadBlox: große Bausteinhilfe neben der senkrechten Bausteinleiste – rechts daneben, möglichst hoch
        if (pop.classList.contains("is-wide") && anchor.closest(".jp-blockpanel") && vw - r.right > 380) {
            pop.style.maxHeight = Math.round(vh - 16) + "px";
            const w = Math.min(pop.offsetWidth, vw - r.right - 20);
            pop.style.width = w + "px";
            const h = pop.offsetHeight;
            pop.style.left = (r.right + 10) + "px";
            pop.style.top = Math.max(8, Math.min(vh - h - 8, r.top - 60)) + "px";
            return;
        }
        const below = vh - 8 - (r.bottom + 10), above = r.top - 10 - 8;
        // Unter den Button, wenn es passt oder dort mehr Platz ist – sonst darüber; notfalls scrollt die Hilfe
        const h0 = pop.offsetHeight;
        const putBelow = h0 <= below || below >= above;
        const space = Math.max(120, putBelow ? below : above);
        pop.style.maxHeight = Math.min(space, Math.round(vh * 0.72), 600) + "px";
        const w = pop.offsetWidth, h = pop.offsetHeight;
        const left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
        const top = putBelow ? r.bottom + 10 : r.top - 10 - h;
        pop.style.left = left + "px";
        pop.style.top = Math.max(8, top) + "px";
    }

    hideTip() {
        this.tipEl?.remove();
        this.tipEl = null;
        this.tipAnchor = null;
    }
}

function esc(t: string): string {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** `Code` und **fett** im Hilfetext */
function inline(t: string): string {
    return esc(t).replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

const KEYWORDS = /^(?:public|private|protected|class|void|new|if|else|while|for|do|break|return|true|false|null|static|this|super|extends|implements|interface|abstract)$/;
const TYPES = /^(?:Integer|Double|Boolean|Character|String)$/;

/** Kleine Syntax-Hervorhebung für die Beispiele (Farben wie im Editor) */
function highlight(code: string): string {
    const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_]*)/gm;
    let out = "", last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        out += esc(code.slice(last, m.index));
        const [t] = m;
        if (m[1]) out += `<span class="tk-comment">${esc(t)}</span>`;
        else if (m[2] || m[3]) out += `<span class="tk-string">${esc(t)}</span>`;
        else if (m[4]) out += `<span class="tk-number">${esc(t)}</span>`;
        else if (KEYWORDS.test(t)) out += `<span class="tk-keyword">${esc(t)}</span>`;
        else if (TYPES.test(t) || /^[A-ZÄÖÜ]/.test(t) && code[re.lastIndex] != "(") out += `<span class="tk-type">${esc(t)}</span>`;
        else if (code[re.lastIndex] == "(") out += `<span class="tk-method">${esc(t)}</span>`;
        else out += esc(t);
        last = re.lastIndex;
    }
    return out + esc(code.slice(last));
}

function renderHelp(h: Help, close: string): string {
    return `
        <div class="jp-tip-head">
            ${h.code ? `<code class="jp-tip-title is-code">${esc(h.title)}</code>` : `<span class="jp-tip-title">${esc(h.title)}</span>`}
            <span class="jp-tip-kind">${esc(h.kind)}</span>
            <span class="jp-tip-spacer"></span>
            ${close}
        </div>
        <p class="jp-tip-text">${inline(h.text)}</p>
        ${h.steps ? `<ol class="jp-tip-steps">${h.steps.map(s => `<li>${inline(s)}</li>`).join("")}</ol>` : ""}
        ${(h.examples ?? []).map(e => `
            <div class="jp-tip-ex">
                <div class="jp-tip-ex-head">${esc(e.caption)}</div>
                <pre class="jp-tip-code">${highlight(e.code)}</pre>
            </div>`).join("")}
        ${h.lab ? `<div class="jp-tip-ex"><div class="jp-tip-ex-head">${esc(h.labCaption ?? "Ausprobieren")}</div><div data-lab></div></div>` : ""}
        ${h.warn ? `<p class="jp-tip-warn"><b>Achtung:</b> ${inline(h.warn)}</p>` : ""}
        ${h.note ? `<p class="jp-tip-note">${inline(h.note)}</p>` : ""}`;
}
