import { icon } from "./Icons.js";
import { TouchEditor } from "./TouchEditor.js";
import { LanguageBridge } from "./LanguageBridge.js";
import { BLOCKS, insertBlock, blockRowHtml, BlockContext } from "./Blocks.js";

type Key = { label: string, insert?: string, action?: string, aria?: string, tip?: string, help?: string, wide?: boolean };

/**
 * Hilfsleiste über der Bildschirmtastatur mit den Zeichen, die auf der
 * iPad-Tastatur nur über Umwege erreichbar sind.
 */
const KEYS: Key[] = [
    { label: icon("tab"), action: "tab", aria: "Einrücken", tip: "Einrücken (Tabulator)", help: "tab" },
    { label: "{ }", insert: "{§}", tip: "Geschweifte Klammern { } einfügen – für Klassen-, Methoden- und Blockrümpfe", help: "braces" },
    { label: "( )", insert: "(§)", tip: "Runde Klammern ( ) einfügen – für Parameter und Bedingungen", help: "parens" },
    { label: ";", insert: ";", tip: "Strichpunkt ; – beendet eine Anweisung", help: "semicolon" },
    { label: "=", insert: " = ", tip: "Zuweisung = – speichert einen Wert in einer Variablen (am Zeilenende mit Strichpunkt dahinter)", help: "assign" },
    { label: "\" \"", insert: "\"§\"", tip: "Anführungszeichen \" \" einfügen – für Text (String)", help: "quotes" },
    { label: ".", insert: ".", tip: "Punkt . – ruft eine Methode oder ein Attribut eines Objekts auf", help: "dot" },
    { label: "[ ]", insert: "[§]", tip: "Eckige Klammern [ ] einfügen – für Arrays", help: "brackets" },
    { label: "<", insert: "<", tip: "Kleiner als <", help: "lt" },
    { label: ">", insert: ">", tip: "Größer als >", help: "gt" },
    { label: "+", insert: "+", tip: "Plus + – addiert Zahlen oder hängt Texte aneinander", help: "plus" },
    { label: "−", insert: "-", aria: "Minus", tip: "Minus −", help: "minus" },
    { label: "*", insert: "*", tip: "Mal *", help: "times" },
    { label: "/", insert: "/", tip: "Geteilt durch /", help: "divide" },
    { label: "%", insert: " % ", tip: "Modulo % – Rest beim ganzzahligen Teilen", help: "modulo" },
    { label: "!", insert: "!", tip: "Nicht ! – kehrt eine Bedingung um", help: "not" },
    { label: "&&", insert: " && ", tip: "Und && – beide Bedingungen müssen wahr sein", help: "and" },
    { label: "||", insert: " || ", tip: "Oder || – mindestens eine Bedingung muss wahr sein", help: "or" },
    { label: "==", insert: " == ", tip: "Vergleich == – prüft, ob zwei Werte gleich sind", help: "equals" },
    { label: "++", insert: "++", tip: "++ – erhöht eine Zahl um 1", help: "increment" },
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

/** JPadBlox: Im Hochformat und auf dem Handy (ohne Bausteinspalte) zeigt die Hilfsleiste wahlweise
 *  Zeichen oder Bausteine (wird gemerkt). Im Querformat stehen die Bausteine links, die Leiste zeigt Zeichen. */
type BarMode = "chars" | "blocks";
function loadMode(): BarMode {
    try { return localStorage.getItem("jpadblox.barMode") == "blocks" ? "blocks" : "chars"; } catch (e) { return "chars"; }
}

export class KeyBar {

    el: HTMLElement;
    private editorFocused = false;
    private mode: BarMode = loadMode();
    /** von App gesetzt, sobald alles bereit ist */
    blockContext: BlockContext | null = null;

    constructor(root: HTMLElement, private editor: TouchEditor, private bridge: LanguageBridge,
        private showInfo: (html: string | null) => void) {

        this.el = document.createElement("div");
        this.el.className = "jp-keybar";
        this.el.setAttribute("role", "toolbar");
        this.el.setAttribute("aria-label", "Sonderzeichen");
        this.el.innerHTML = `
            <div class="jp-keybar-fixed is-left">
                <button data-action="mode" class="jp-key-mode" aria-label="Zwischen Bausteinen und Sonderzeichen umschalten" data-tip="Umschalten: Code-Bausteine (class, Methode, if, for …) oder Sonderzeichen ({ } ( ) ; = …)">${icon("blocks", "jp-mode-blocks")}<span class="jp-mode-chars">{ }</span></button>
                <button data-action="left" class="jp-key-nav" data-help="left" aria-label="Cursor nach links" data-tip="Cursor ein Zeichen nach links">${icon("left")}</button>
                <button data-action="right" class="jp-key-nav" data-help="right" aria-label="Cursor nach rechts" data-tip="Cursor ein Zeichen nach rechts">${icon("right")}</button>
                <button data-action="lineAdd" class="jp-key-line" aria-label="Neue Zeile einfügen" data-tip="Neue, leere Zeile unter der Zeile mit dem Cursor einfügen (richtig eingerückt)">${icon("lineAdd")}</button>
                <button data-action="lineDelete" class="jp-key-line" aria-label="Zeile löschen" data-tip="Zeile, in der der Cursor steht, löschen">${icon("lineDelete")}</button>
            </div>
            <div class="jp-keybar-main">
            <div class="jp-keybar-scroll">
                ${KEYS.map((k, i) => `<button data-key="${i}" ${k.aria ? `aria-label="${k.aria}"` : ""} ${k.tip ? `data-tip="${k.tip.replace(/"/g, "&quot;")}"` : ""} ${k.help ? `data-help="${k.help}"` : ""}>${k.label}</button>`).join("")}
            </div>
            <div class="jp-keybar-scroll jp-blocks-scroll">
                ${blockRowHtml()}
            </div>
            <div class="jp-keybar-fixed is-right">
                <button data-action="breakpoint" data-help="breakpoint" aria-label="Haltepunkt in dieser Zeile setzen oder entfernen" data-tip="Haltepunkt in dieser Zeile setzen oder entfernen – das Programm hält vor der Zeile an" class="jp-key-breakpoint">${icon("breakpoint")}</button>
                <button data-action="info" data-help="info" aria-label="Info zur Stelle am Cursor" data-tip="Info zu dem Namen, auf dem der Cursor steht">${icon("info")}</button>
                <button data-action="hide" data-help="hide" aria-label="Tastatur ausblenden" data-tip="Bildschirmtastatur ausblenden">${icon("keyboardDown")}</button>
            </div>
            </div>`;
        root.appendChild(this.el);
        this.applyMode();

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
            let lastOffset = -1, lastOpen: boolean | null = null, lastTouch = 0, timer: any;
            const simple = simpleKeyboardMode();
            document.documentElement.classList.toggle("kb-simple", simple);
            const update = (force = false) => {
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
                if (!force && open === lastOpen && Math.abs(offset - lastOffset) < 2) return;
                const quiet = Date.now() - lastTouch;
                if (!force && open === lastOpen && quiet < 700) { timer = setTimeout(update, 700 - quiet); return; }
                lastOffset = offset; lastOpen = open;
                document.documentElement.style.setProperty("--keyboard-offset", offset + "px");
                document.documentElement.classList.toggle("keyboard-open", open);
            };
            const touched = () => { lastTouch = Date.now(); };
            document.addEventListener("touchstart", touched, { capture: true, passive: true });
            document.addEventListener("touchend", touched, { capture: true, passive: true });
            vv.addEventListener("resize", () => update());
            vv.addEventListener("scroll", () => update());
            update();

            /*
             * Tippt man bei ausgeblendeter Tastatur in den Code (egal wo), schiebt iOS während
             * der Tastatur-Animation den sichtbaren Bereich hin und her; die dabei gemessene Höhe stimmt
             * oft nicht, und die ganze Seite bleibt nach oben verschoben (Kopfzeile weg, Hilfsleiste unter
             * der Tastatur). Deshalb 0,5 s nach dem Tipp (Animation fertig) die Seite nach oben zurückscrollen,
             * die nutzbare Höhe neu abfragen, das Layout neu setzen und den Cursor sichtbar machen.
             */
            let lateTimer: any;
            const resetScroll = () => {
                window.scrollTo(0, 0);
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
                /*
                 * iOS schiebt auch Container ohne Scrollbalken (overflow: hidden) in sich nach oben, damit
                 * der Cursor sichtbar wird – z. B. den Code-Bereich, dessen Dateireiter dann oben
                 * verschwinden. Deshalb alle Vorfahren des Editors (außer seinem eigenen Scrollbereich)
                 * auf den Anfang zurücksetzen.
                 */
                for (let el = this.editor.view.scrollDOM.parentElement; el; el = el.parentElement) {
                    if (el.scrollTop) el.scrollTop = 0;
                }
            };
            this.editor.view.dom.addEventListener("touchstart", e => {
                if (e.touches.length != 1 || document.documentElement.classList.contains("keyboard-open")) return;
                clearTimeout(lateTimer);
                lateTimer = setTimeout(() => {
                    // 1. Den von iOS nach oben geschobenen Ausschnitt zurück an den Seitenanfang
                    resetScroll();
                    // 2. Zwei Frames warten, bis der Browser den neuen Ausschnitt meldet, dann Höhe neu
                    //    messen und Layout neu setzen
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        update(true);
                        this.editor.view.requestMeasure();
                        // 3. Falls iOS den Ausschnitt dabei noch einmal verschoben hat: nachkorrigieren
                        // 4. Danach nur im Editor selbst zum Cursor scrollen (nicht die umgebenden Bereiche)
                        setTimeout(() => {
                            if (vv.offsetTop > 1 || window.scrollY > 1) resetScroll();
                            update(true);
                            this.editor.view.requestMeasure();
                            requestAnimationFrame(() => requestAnimationFrame(() => this.editor.revealCursorInside()));
                        }, 350);
                    }));
                }, 500);
            }, { capture: true, passive: true });
        }
    }

    private activate(b: HTMLElement) {
        if (b.dataset.block != null) {
            if (this.blockContext) insertBlock(this.blockContext, BLOCKS[parseInt(b.dataset.block)]);
        } else if (b.dataset.key != null) {
            const k = KEYS[parseInt(b.dataset.key)];
            if (k.action == "tab") this.editor.indentMore();
            else if (k.label == "=" && this.restOfLineEmpty()) this.editor.insert(" = §;");   // meist folgt ein Semikolon
            else if (k.label == "+") this.insertSpaced("+");
            else if (k.insert) this.editor.insert(k.insert);
        } else if (b.dataset.action) {
            this.runAction(b.dataset.action);
        }
    }

    /**
     * Operator mit genau einem Leerzeichen davor und einem danach einfügen: a| → a + |
     * (vorhandene Leerzeichen links vom Cursor werden auf eines gekürzt; am Zeilenanfang kein Leerzeichen davor)
     */
    private insertSpaced(op: string) {
        const view = this.editor.view, st = view.state, sel = st.selection.main;
        const line = st.doc.lineAt(sel.from);
        const before = st.sliceDoc(line.from, sel.from);
        const trimmed = before.replace(/[ \t]+$/, "");
        const from = line.from + trimmed.length;
        const lead = trimmed.trim() == "" ? "" : " ";
        const nextIsSpace = st.sliceDoc(sel.to, sel.to + 1) == " ";
        const insert = (trimmed.trim() == "" ? before : lead) + op + (nextIsSpace ? "" : " ");
        const start = trimmed.trim() == "" ? line.from : from;
        view.dispatch({
            changes: { from: start, to: sel.to, insert },
            selection: { anchor: start + insert.length + (nextIsSpace ? 1 : 0) },
            userEvent: "input.type", scrollIntoView: true
        });
    }

    /** Steht rechts vom Cursor in dieser Zeile nichts mehr? */
    private restOfLineEmpty(): boolean {
        const st = this.editor.view.state, sel = st.selection.main;
        return st.sliceDoc(sel.to, st.doc.lineAt(sel.to).to).trim() == "";
    }

    private async runAction(action: string) {
        switch (action) {
            case "mode":
                this.mode = this.mode == "blocks" ? "chars" : "blocks";
                try { localStorage.setItem("jpadblox.barMode", this.mode); } catch (e) { }
                this.applyMode();
                break;
            case "lineAdd": this.editor.insertLine(); break;
            case "lineDelete": this.editor.deleteLine(); break;
            case "left": this.editor.moveCursor(-1); break;
            case "right": this.editor.moveCursor(1); break;
            case "info": this.showInfo(await this.bridge.hover(this.editor.getCursorOffset())); break;
            case "hide": this.editor.view.contentDOM.blur(); break;
            case "breakpoint": this.editor.onToggleBreakpoint?.(this.editor.getCursorLine()); break;
        }
    }

    private applyMode() {
        this.el.dataset.mode = this.mode;
        this.el.querySelector(".jp-keybar-main")?.scrollTo({ left: 0 });
        const btn = this.el.querySelector<HTMLElement>('[data-action="mode"]');
        btn?.setAttribute("aria-pressed", String(this.mode == "blocks"));
    }

    setEditorFocused(focused: boolean) {
        this.editorFocused = focused;
        document.documentElement.classList.toggle("editor-focused", focused);
    }
}
