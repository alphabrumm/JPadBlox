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
        this.el.addEventListener("pointerdown", e => {
            if ((<HTMLElement>e.target).closest("button")) e.preventDefault();
        });

        /*
         * iOS Safari (vor allem auf dem iPhone) nimmt dem Editor beim Tippen auf einen Knopf
         * trotzdem den Fokus, wenn der Knopf nicht in einem scrollbaren Bereich liegt – dann
         * klappt die Tastatur zu, bevor die Aktion ausgeführt ist. Für die fest stehenden
         * Knöpfe links und rechts behandeln wir die Berührung deshalb selbst: touchstart wird
         * abgefangen (kein Fokuswechsel) und die Aktion bei touchend ausgeführt.
         */
        let touched: HTMLElement | null = null;
        // Auf dem Handy scrollt der rechte Bereich mit der Zeichenleiste mit – dort muss ein
        // Wischen über die Knöpfe weiterhin scrollen, also keine eigene Behandlung.
        const narrow = matchMedia("(max-width: 600px)");
        const handleSelf = (b: HTMLElement) => !!b.closest(".is-left") || !narrow.matches;
        this.el.querySelectorAll<HTMLElement>(".jp-keybar-fixed button").forEach(b => {
            b.addEventListener("touchstart", e => {
                if (!handleSelf(b)) return;
                e.preventDefault();
                touched = b;
                b.classList.add("is-pressed");
            }, { passive: false });
            b.addEventListener("touchend", e => {
                if (touched != b) return;
                e.preventDefault();
                b.classList.remove("is-pressed");
                if (touched == b) this.activate(b);
                touched = null;
            }, { passive: false });
            b.addEventListener("touchcancel", () => { b.classList.remove("is-pressed"); touched = null; });
        });

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
            let lastOffset = -1, lastOpen: boolean | null = null, lastTouch = 0, timer: any;
            const update = () => {
                clearTimeout(timer);
                const offset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
                const open = offset > 80;
                if (open === lastOpen && Math.abs(offset - lastOffset) < 2) return;
                const quiet = Date.now() - lastTouch;
                if (open === lastOpen && quiet < 700) { timer = setTimeout(update, 700 - quiet); return; }
                lastOffset = offset; lastOpen = open;
                document.documentElement.style.setProperty("--keyboard-offset", offset + "px");
                document.documentElement.classList.toggle("keyboard-open", open);
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
