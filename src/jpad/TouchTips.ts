import { icon } from "./Icons.js";

/**
 * Tooltips für Touch-Geräte: Wer eine halbe Sekunde lang den Finger auf einen Button legt,
 * bekommt einen kurzen Hinweis, was der Button bewirkt. Der Button wird dabei NICHT ausgelöst.
 *
 * Text: data-tip, sonst aria-label, sonst title, sonst die Beschriftung des Buttons.
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
    private hideTimer: any = null;

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
        window.addEventListener("scroll", () => this.hideTip(), passive);
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
        if (e.pointerType != "touch" || !e.isPrimary) return;
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
        const text = TouchTips.textFor(btn);
        if (!text) return;
        const tip = document.createElement("div");
        tip.className = "jp-tip";
        tip.setAttribute("role", "tooltip");
        tip.textContent = text;
        this.place(tip, btn);
        this.hideTimer = setTimeout(() => this.hideTip(), 6000);
    }

    /** Hinweis der Glühbirne (wie in QPad): erklärt das lange Drücken. Erneutes Tippen schließt ihn. */
    toggleInfo(anchor: HTMLElement) {
        if (this.tipEl?.classList.contains("is-info")) { this.hideTip(); return; }
        const pop = document.createElement("div");
        pop.className = "jp-tip is-info";
        pop.setAttribute("role", "dialog");
        pop.innerHTML = `
            <span class="jp-tip-info-icon">${icon("lightbulb")}</span>
            <p>Weißt Du nicht, was ein Button bewirkt? Lege einfach eine halbe Sekunde lang Deinen Finger auf den Button, um Hilfe zu bekommen.</p>
            <button class="jp-iconbtn jp-tip-close" aria-label="Hinweis schließen">${icon("close")}</button>`;
        const close = pop.querySelector<HTMLElement>(".jp-tip-close")!;
        close.addEventListener("pointerdown", e => e.preventDefault()); // Editor-Fokus behalten
        close.addEventListener("click", () => this.hideTip());
        this.place(pop, anchor);
    }

    /** Unter (oder notfalls über) dem Button platzieren, mit Pfeil auf den Button */
    private place(pop: HTMLElement, anchor: HTMLElement) {
        this.hideTip();
        document.body.appendChild(pop);
        this.tipEl = pop;
        this.tipAnchor = anchor;
        const r = anchor.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.visualViewport?.height ?? window.innerHeight;
        const w = pop.offsetWidth, h = pop.offsetHeight;
        const left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
        let top = r.bottom + 10;
        if (top + h > vh - 8 && r.top - 10 - h >= 8) top = r.top - 10 - h;
        pop.style.left = left + "px";
        pop.style.top = Math.max(8, top) + "px";
        pop.style.setProperty("--arrow-x", Math.max(14, Math.min(w - 14, r.left + r.width / 2 - left)) + "px");
        pop.classList.toggle("is-above", top < r.top);
    }

    hideTip() {
        clearTimeout(this.hideTimer);
        this.tipEl?.remove();
        this.tipEl = null;
        this.tipAnchor = null;
    }
}
