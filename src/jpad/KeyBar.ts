import { icon } from "./Icons.js";
import { TouchEditor } from "./TouchEditor.js";
import { LanguageBridge } from "./LanguageBridge.js";

type Key = { label: string, insert?: string, action?: string, aria?: string, wide?: boolean };

/**
 * Hilfsleiste über der Bildschirmtastatur mit den Zeichen, die auf der
 * iPad-Tastatur nur über Umwege erreichbar sind.
 */
const KEYS: Key[] = [
    { label: icon("tab"), action: "tab", aria: "Einrücken" },
    { label: "{ }", insert: "{§}" },
    { label: "( )", insert: "(§)" },
    { label: ";", insert: ";" },
    { label: "=", insert: " = " },
    { label: "\" \"", insert: "\"§\"" },
    { label: ".", insert: "." },
    { label: "[ ]", insert: "[§]" },
    { label: "<", insert: "<" },
    { label: ">", insert: ">" },
    { label: "+", insert: "+" },
    { label: "−", insert: "-", aria: "Minus" },
    { label: "*", insert: "*" },
    { label: "/", insert: "/" },
    { label: "!", insert: "!" },
    { label: "&&", insert: " && " },
    { label: "||", insert: " || " },
    { label: "==", insert: " == " },
    { label: "++", insert: "++" },
];

/** Testmodus für die Tastatur-Behandlung: „?kb=einfach“ schaltet ein, „?kb=normal“ aus (wird gemerkt). */
function simpleKeyboardMode(): boolean {
    const m = /[?&]kb=(einfach|normal)\b/.exec(location.search);
    try {
        if (m) localStorage.setItem("jpad.kb", m[1]);
        return localStorage.getItem("jpad.kb") == "einfach";
    } catch (e) {
        return m?.[1] == "einfach";
    }
}

export class KeyBar {

    el: HTMLElement;
    private editorFocused = false;

    constructor(root: HTMLElement, private editor: TouchEditor, private bridge: LanguageBridge,
        private showInfo: (html: string | null) => void) {

        this.el = document.createElement("div");
        this.el.className = "jp-keybar";
        this.el.setAttribute("role", "toolbar");
        this.el.setAttribute("aria-label", "Sonderzeichen");
        this.el.innerHTML = `
            <div class="jp-keybar-fixed is-left">
                <button data-action="left" aria-label="Cursor nach links">${icon("left")}</button>
                <button data-action="right" aria-label="Cursor nach rechts">${icon("right")}</button>
            </div>
            <div class="jp-keybar-main">
            <div class="jp-keybar-scroll">
                ${KEYS.map((k, i) => `<button data-key="${i}" ${k.aria ? `aria-label="${k.aria}"` : ""}>${k.label}</button>`).join("")}
            </div>
            <div class="jp-keybar-fixed is-right">
                <button data-action="breakpoint" aria-label="Haltepunkt in dieser Zeile setzen oder entfernen" class="jp-key-breakpoint">${icon("breakpoint")}</button>
                <button data-action="complete" aria-label="Vorschläge anzeigen" class="jp-key-accent">${icon("lightbulb")}</button>
                <button data-action="info" aria-label="Info zur Stelle am Cursor">${icon("info")}</button>
                <button data-action="hide" aria-label="Tastatur ausblenden">${icon("keyboardDown")}</button>
            </div>
            </div>`;
        root.appendChild(this.el);

        // Fokus im Editor behalten, sonst schließt sich die Tastatur
        // (wie qPad) auch „mousedown“ – das reicht Safari nach dem Fingertipp nach und verschiebt sonst den Fokus
        for (const ev of ["pointerdown", "mousedown"]) this.el.addEventListener(ev, e => {
            if ((<HTMLElement>e.target).closest("button")) e.preventDefault();
        });

        /*
         * iOS Safari nimmt dem Editor beim Tippen auf einen Knopf der Leiste trotz preventDefault
         * bei pointerdown oft den Fokus – dann klappt die Bildschirmtastatur zu. Ursache sind die
         * Maus-Ereignisse, die Safari nach dem Fingertipp nachreicht. Deshalb behandeln wir jede
         * Berührung selbst: Ein Tipp ohne Wischen wird bei touchend ausgeführt und mit
         * preventDefault abgeschlossen (keine nachgereichten Maus-Ereignisse, kein Fokuswechsel).
         * Knöpfe außerhalb eines scrollbaren Bereichs fangen schon touchstart ab; in der
         * scrollbaren Zeichenleiste bleibt Wischen zum Scrollen erhalten.
         */
        const inScroller = (b: HTMLElement) => {
            for (let p = b.parentElement; p && p != this.el.parentElement; p = p.parentElement) {
                const ox = getComputedStyle(p).overflowX;
                if ((ox == "auto" || ox == "scroll") && p.scrollWidth > p.clientWidth + 1) return true;
            }
            return false;
        };
        let tap: { b: HTMLElement, x: number, y: number, moved: boolean, hadFocus: boolean } | null = null;
        this.el.addEventListener("touchstart", e => {
            const b = (<HTMLElement>e.target).closest<HTMLElement>("button");
            if (!b || e.touches.length > 1) { tap?.b.classList.remove("is-pressed"); tap = null; return; }
            if (!inScroller(b)) e.preventDefault();
            const t = e.touches[0];
            tap = { b, x: t.clientX, y: t.clientY, moved: false, hadFocus: this.editor.view.hasFocus };
            b.classList.add("is-pressed");
        }, { passive: false });
        this.el.addEventListener("touchmove", e => {
            if (!tap || tap.moved) return;
            const t = e.touches[0];
            if (Math.abs(t.clientX - tap.x) > 10 || Math.abs(t.clientY - tap.y) > 10) {
                tap.moved = true;
                tap.b.classList.remove("is-pressed");
            }
        }, { passive: true });
        this.el.addEventListener("touchend", e => {
            const t = tap;
            tap = null;
            if (!t) return;
            t.b.classList.remove("is-pressed");
            if (t.moved) return;
            e.preventDefault();
            t.b.click();
            // Falls Safari den Fokus doch genommen hat: zurückgeben, solange der Finger-Gestus noch gilt
            if (t.hadFocus && !this.editor.view.hasFocus && t.b.dataset.action != "hide") this.editor.view.focus();
        }, { passive: false });
        this.el.addEventListener("touchcancel", () => { tap?.b.classList.remove("is-pressed"); tap = null; });

        // Maus, Trackpad, Tastatur und die scrollbare Zeichenleiste
        this.el.addEventListener("click", e => {
            const b = (<HTMLElement>e.target).closest<HTMLElement>("button");
            if (b) this.activate(b);
        });

        // Leiste über der Bildschirmtastatur halten
        const vv = window.visualViewport;
        if (vv) {
            /*
             * iOS verschiebt bei offener Bildschirmtastatur den sichtbaren Bereich schon beim
             * Antippen ein Stück (Cursor sichtbar halten). Würden wir darauf sofort mit neuem Layout
             * reagieren, änderte sich die Seite zwischen den beiden Tipps eines Doppeltipps – Safari
             * verliert dann den Anker der Wortauswahl und markiert alles bis zum Textanfang.
             * Deshalb: nur echte Änderungen schreiben, Tastatur auf/zu sofort, kleine Verschiebungen
             * erst, wenn gerade nicht getippt wird.
             */
            let lastOffset = -1, lastOpen: boolean | null = null, lastTouch = 0, lastTop = 0, openedAt = 0, timer: any;
            const simple = simpleKeyboardMode();
            document.documentElement.classList.toggle("kb-simple", simple);
            const update = () => {
                clearTimeout(timer);
                const offset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
                const open = offset > 80;
                if (simple) {
                    /*
                     * Testmodus „?kb=einfach“ (wie qPad): Die App liegt nicht mehr fest positioniert
                     * über der Seite, sondern ist genau so hoch wie der sichtbare Bereich. Jede
                     * Änderung wird sofort übernommen, die Seite nach oben geschoben und der Editor
                     * sofort neu vermessen – so passt Safaris Layout schon beim nächsten Tipp.
                     */
                    document.documentElement.style.setProperty("--app-height", Math.round(vv.height) + "px");
                    document.documentElement.style.setProperty("--keyboard-offset", offset + "px");
                    document.documentElement.classList.toggle("keyboard-open", open);
                    if (window.scrollY || window.scrollX || vv.offsetTop) window.scrollTo(0, 0);
                    this.editor.view.requestMeasure();
                    return;
                }
                /*
                 * Beim Öffnen der Tastatur schiebt Safari (vor allem auf dem iPhone) den sichtbaren
                 * Bereich ein Stück nach unten (vv.offsetTop > 0). Die fest positionierte App würde
                 * dann oben aus dem Bild rutschen – samt Kopfzeile. Deshalb beginnt die App oben am
                 * sichtbaren Bereich (--vv-top) und endet unten an der Tastatur (--keyboard-offset).
                 */
                const top = open ? Math.max(0, Math.round(vv.offsetTop)) : 0;
                if (open === lastOpen && Math.abs(offset - lastOffset) < 2 && Math.abs(top - lastTop) < 2) return;
                const now = Date.now(), quiet = now - lastTouch;
                // Kurz nach dem Öffnen sofort anpassen (Safari schiebt erst nach), sonst erst, wenn gerade nicht getippt wird
                if (open === lastOpen && quiet < 700 && now - openedAt > 1500) { timer = setTimeout(update, 700 - quiet); return; }
                if (open !== lastOpen && open) openedAt = now;
                lastOffset = offset; lastOpen = open; lastTop = top;
                document.documentElement.style.setProperty("--keyboard-offset", offset + "px");
                document.documentElement.style.setProperty("--vv-top", top + "px");
                document.documentElement.classList.toggle("keyboard-open", open);
                if (open && (window.scrollY || window.scrollX)) window.scrollTo(0, 0);
            };
            const touched = () => { lastTouch = Date.now(); };
            document.addEventListener("touchstart", touched, { capture: true, passive: true });
            document.addEventListener("touchend", touched, { capture: true, passive: true });
            vv.addEventListener("resize", update);
            vv.addEventListener("scroll", update);
            update();
        }
    }

    private activate(b: HTMLElement) {
        if (b.dataset.key != null) {
            const k = KEYS[parseInt(b.dataset.key)];
            if (k.action == "tab") this.editor.indentMore();
            else if (k.insert) this.editor.insert(k.insert);
        } else if (b.dataset.action) {
            this.runAction(b.dataset.action);
        }
    }

    private async runAction(action: string) {
        switch (action) {
            case "left": this.editor.moveCursor(-1); break;
            case "right": this.editor.moveCursor(1); break;
            case "complete": this.editor.startCompletion(); break;
            case "info": this.showInfo(await this.bridge.hover(this.editor.getCursorOffset())); break;
            case "hide": this.editor.view.contentDOM.blur(); break;
            case "breakpoint": this.editor.onToggleBreakpoint?.(this.editor.getCursorLine()); break;
        }
    }

    setEditorFocused(focused: boolean) {
        this.editorFocused = focused;
        document.documentElement.classList.toggle("editor-focused", focused);
    }
}
