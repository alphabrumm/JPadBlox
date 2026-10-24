import { icon } from "./Icons.js";
import { TouchEditor, smartSemicolon } from "./TouchEditor.js";
import { LanguageBridge } from "./LanguageBridge.js";
import { BLOCKS, insertBlock, blockRowHtml, BlockContext } from "./Blocks.js";
import type { EditorView } from "@codemirror/view";
import { hasNextSnippetField, nextSnippetField } from "@codemirror/autocomplete";

type Key = { label: string, insert?: string, action?: string, aria?: string, tip?: string, help?: string, wide?: boolean,
    /** in Eingabefeldern (Bedingung im if-Dialog) ausgeblendet */
    noField?: boolean };

/**
 * Hilfsleiste über der Bildschirmtastatur mit den Zeichen, die auf der
 * iPad-Tastatur nur über Umwege erreichbar sind.
 */
const KEYS: Key[] = [
    { label: icon("tab"), action: "tab", aria: "Einrücken", tip: "Einrücken (Tabulator)", help: "tab" },
    { label: "{ }", noField: true, insert: "{§}", tip: "Geschweifte Klammern { } einfügen – für Klassen-, Methoden- und Blockrümpfe", help: "braces" },
    { label: "( )", insert: "(§)", tip: "Runde Klammern ( ) einfügen – für Parameter und Bedingungen", help: "parens" },
    { label: ";", noField: true, insert: ";", tip: "Strichpunkt ; – beendet eine Anweisung", help: "semicolon" },
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
        // Cursor-, Zeilen- und rechte Knöpfe: auf dem iPad fest am Rand, auf dem iPhone (wenig Platz) zusätzlich als
        // Kopie am Anfang bzw. Ende der scrollbaren Reihe (die festen sind dort ausgeblendet, siehe CSS html.phone)
        const navKeys = `
                <button data-action="left" class="jp-key-nav" data-help="left" aria-label="Cursor nach links" data-tip="Cursor ein Zeichen nach links">${icon("left")}</button>
                <button data-action="right" class="jp-key-nav" data-help="right" aria-label="Cursor nach rechts" data-tip="Cursor ein Zeichen nach rechts">${icon("right")}</button>
                <button data-action="markUp" class="jp-col-only" aria-label="Rechteck: Ecke eine Zeile nach oben" data-tip="Spalten markieren: Ecke eine Zeile nach oben">${icon("lineUp")}</button>
                <button data-action="markDown" class="jp-col-only" aria-label="Rechteck: Ecke eine Zeile nach unten" data-tip="Spalten markieren: Ecke eine Zeile nach unten">${icon("lineDown")}</button>
                <button data-action="mark" class="jp-key-mark" aria-label="Markier-Modus" aria-pressed="false" data-tip="Markier-Modus: Die Zeile mit dem Cursor ist der Anfang. Tippe auf eine andere Zeile – alles dazwischen ist markiert. Dann ausschneiden, Zeilen löschen oder an anderer Stelle einfügen.">${icon("markMode")}</button>
                <button data-action="lineAdd" class="jp-key-line" aria-label="Neue Zeile einfügen" data-tip="Neue, leere Zeile unter der Zeile mit dem Cursor einfügen (richtig eingerückt)">${icon("lineAdd")}</button>
                <button data-action="lineDelete" class="jp-key-line" aria-label="Zeile löschen" data-tip="Zeile, in der der Cursor steht, löschen">${icon("lineDelete")}</button>
                <button data-action="cutBlock" class="jp-mark-only" aria-label="Markierten Block ausschneiden" data-tip="Markierten Block ausschneiden – danach Einfügestelle antippen und einfügen">${icon("cut")}</button>
                <button data-action="copyBlock" class="jp-mark-only" aria-label="Markierten Block kopieren" data-tip="Markierten Block kopieren – danach Einfügestelle antippen und einfügen">${icon("copy")}</button>
                <button data-action="pasteBlock" class="jp-mark-only" aria-label="Einfügen" data-tip="Text aus der Zwischenablage einfügen (ganze Zeilen vor der Zeile mit dem Cursor)">${icon("paste")}</button>`;
        const rightKeys = `
                <button data-action="breakpoint" data-help="breakpoint" aria-label="Haltepunkt in dieser Zeile setzen oder entfernen" data-tip="Haltepunkt in dieser Zeile setzen oder entfernen – das Programm hält vor der Zeile an" class="jp-key-breakpoint">${icon("breakpoint")}</button>
                <button data-action="info" data-help="info" aria-label="Info zur Stelle am Cursor" data-tip="Info zu dem Namen, auf dem der Cursor steht">${icon("info")}</button>
                <button data-action="hide" data-help="hide" aria-label="Tastatur ausblenden" data-tip="Bildschirmtastatur ausblenden">${icon("keyboardDown")}</button>`;
        this.el.innerHTML = `
            <div class="jp-keybar-fixed is-left">
                <button data-action="mode" class="jp-key-mode" aria-label="Zwischen Bausteinen und Sonderzeichen umschalten" data-tip="Umschalten: Code-Bausteine (class, Methode, if, for …) oder Sonderzeichen ({ } ( ) ; = …)">${icon("blocks", "jp-mode-blocks")}<span class="jp-mode-chars">{ }</span></button>
${navKeys}
            </div>
            <div class="jp-keybar-markextra">
                <button data-action="colToggle" class="jp-colswitch" role="switch" aria-checked="false" aria-label="Spalten statt Zeilen markieren" data-tip="Kippschalter: ganze Zeilen markieren oder nur Spalten (ein Rechteck – mit dem Finger aufziehen)"><span class="jp-seg jp-seg-rows">${icon("selRows")}<span>Zeilen</span></span><span class="jp-seg jp-seg-cols">${icon("selCols")}<span>Spalten</span></span></button>
            </div>
            <div class="jp-keybar-main">
            <div class="jp-keybar-scroll">
                <span class="jp-phone-only jp-phone-group">${navKeys}</span>
                ${KEYS.map((k, i) => `<button data-key="${i}" ${k.noField ? "data-nofield" : ""} ${k.aria ? `aria-label="${k.aria}"` : ""} ${k.tip ? `data-tip="${k.tip.replace(/"/g, "&quot;")}"` : ""} ${k.help ? `data-help="${k.help}"` : ""}>${k.label}</button>`).join("")}
                <span class="jp-phone-only jp-phone-group jp-phone-right">${rightKeys}</span>
            </div>
            <div class="jp-keybar-scroll jp-blocks-scroll">
                <span class="jp-phone-only jp-phone-group">${navKeys}</span>
                ${blockRowHtml()}
                <span class="jp-phone-only jp-phone-group jp-phone-right">${rightKeys}</span>
            </div>
            <div class="jp-keybar-fixed is-right">
${rightKeys}
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
            tap = { b, x: t.clientX, y: t.clientY, moved: false, hadFocus: this.target.hasFocus };
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
            if (t.hadFocus && !this.target.hasFocus && t.b.dataset.action != "hide") this.target.focus();
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
            /*
             * Nur nach einem Tipp (der die Tastatur öffnet) – nicht nach einem Wischen zum Scrollen: Sonst sprang
             * der Editor nach einem Schwung am Ende des Scrollens zurück zum Cursor (meist ganz nach oben).
             */
            let startX = 0, startY = 0;
            this.editor.view.dom.addEventListener("touchmove", e => {
                const t = e.touches[0];
                if (t && Math.hypot(t.clientX - startX, t.clientY - startY) > 10) clearTimeout(lateTimer);
            }, { capture: true, passive: true });
            this.editor.view.dom.addEventListener("touchstart", e => {
                if (e.touches.length != 1 || document.documentElement.classList.contains("keyboard-open")) return;
                startX = e.touches[0].clientX; startY = e.touches[0].clientY;
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
                            requestAnimationFrame(() => requestAnimationFrame(() => { if (this.editor.view.hasFocus) this.editor.revealCursorInside(); }));
                        }, 350);
                    }));
                }, 500);
            }, { capture: true, passive: true });
        }
    }

    // ------------------------------------------------ Eingabefeld (Bedingung im if-Dialog)

    /** Eingabefeld mit Fokus (z. B. Bedingung im if-Dialog): Die Leiste schreibt dann dorthin */
    private field: EditorView | null = null;

    /** Ziel der Tasten: das zuletzt benutzte Eingabefeld eines offenen Dialogs, sonst der Editor */
    private get target(): EditorView { return this.field ?? this.editor.view; }

    setField(view: EditorView | null) {
        this.field = view;
        this.el.classList.toggle("is-field", !!view);
        document.documentElement.classList.toggle("field-keys", !!view);
    }

    /** Feld wird geschlossen: Leiste schreibt wieder in den Editor */
    clearField(view: EditorView) {
        if (this.field == view) this.setField(null);
    }

    /** Text an der Cursorstelle des Ziels einfügen; § markiert die Cursorposition danach */
    private insertText(text: string) {
        if (!this.field) { this.editor.insert(text); return; }
        const view = this.field;
        let cursorDelta = text.indexOf("§");
        if (cursorDelta >= 0) text = text.replace("§", ""); else cursorDelta = text.length;
        const r = view.state.selection.main;
        view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + cursorDelta }, userEvent: "input.type", scrollIntoView: true });
    }

    private activate(b: HTMLElement) {
        if (b.dataset.block != null) {
            if (this.blockContext) insertBlock(this.blockContext, BLOCKS[parseInt(b.dataset.block)]);
        } else if (b.dataset.key != null) {
            const k = KEYS[parseInt(b.dataset.key)];
            if (k.action == "tab") {
                // Im Feld: zur nächsten Eingabestelle (z. B. Parameter von equals(…)), sonst nichts
                if (this.field) { if (hasNextSnippetField(this.field.state)) nextSnippetField(this.field); }
                else this.editor.indentMore();
            }
            else if (k.label == "=" && !this.field && this.restOfLineEmpty()) this.editor.insert(" = §;");   // meist folgt ein Semikolon
            else if (k.label == "+") this.insertSpaced("+");
            // Strichpunkt im Editor: ans Zeilenende, dann neue Zeile (im for-Kopf, in Text oder Kommentar normal)
            else if (k.label == ";" && !this.field) { if (!smartSemicolon(this.editor.view)) this.editor.insert(";"); }
            // In Bedingungen: Vergleichs- und Verknüpfungszeichen mit genau einem Leerzeichen davor und danach
            else if (this.field && ["<", ">", "&&", "||", "==", "%"].includes(k.label)) this.insertSpaced(k.label);
            else if (k.insert) this.insertText(k.insert);
        } else if (b.dataset.action) {
            this.runAction(b.dataset.action);
        }
        if (this.field && !this.field.hasFocus && b.dataset.action != "hide") this.field.focus();
    }

    /**
     * Operator mit genau einem Leerzeichen davor und einem danach einfügen: a| → a + |
     * (vorhandene Leerzeichen links vom Cursor werden auf eines gekürzt; am Zeilenanfang kein Leerzeichen davor)
     */
    private insertSpaced(op: string) {
        const view = this.target, st = view.state, sel = st.selection.main;
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

    // ------------------------------------------------ Markier-Modus (Logik in TouchEditor)

    private setMarking(on: boolean) {
        if (on) this.editor.startMarking(); else this.editor.stopMarking();
        this.renderMarking();
    }

    private renderMarking() {
        const on = this.editor.marking;
        this.el.classList.toggle("is-marking", on);
        this.el.classList.toggle("is-placing", on && this.editor.markPhase == "cut");
        this.el.querySelectorAll<HTMLElement>('[data-action="mark"]').forEach(b => b.setAttribute("aria-pressed", String(on)));
        // Beim Festlegen des Blocks verschieben ← → die Endzeile: dann als Pfeile hoch/runter anzeigen
        const cols = on && this.editor.markPhase == "select" && this.editor.markColumns;
        this.el.classList.toggle("is-marking-cols", cols);
        this.el.querySelectorAll<HTMLElement>('[data-action="colToggle"]').forEach(b => b.setAttribute("aria-checked", String(cols)));
        const vertical = on && this.editor.markPhase == "select" && !cols;
        const navState = vertical ? "v" : cols ? "c" : "n";
        if (this.el.dataset.navState == navState) return;
        this.el.dataset.navState = navState;
        this.el.querySelectorAll<HTMLElement>('[data-action="left"], [data-action="right"]').forEach(b => {
            const left = b.dataset.action == "left";
            b.innerHTML = icon(vertical ? (left ? "lineUp" : "lineDown") : (left ? "left" : "right"));
            b.setAttribute("aria-label", vertical ? (left ? "Endzeile eine Zeile nach oben" : "Endzeile eine Zeile nach unten") : cols ? (left ? "Ecke eine Spalte nach links" : "Ecke eine Spalte nach rechts") : (left ? "Cursor nach links" : "Cursor nach rechts"));
            b.dataset.tip = vertical ? (left ? "Markierung: Endzeile eine Zeile nach oben" : "Markierung: Endzeile eine Zeile nach unten")
                : cols ? (left ? "Spalten markieren: Ecke eine Spalte nach links" : "Spalten markieren: Ecke eine Spalte nach rechts")
                : (left ? "Cursor ein Zeichen nach links" : "Cursor ein Zeichen nach rechts");
        });
    }

    private async runAction(action: string) {
        switch (action) {
            case "mark":
                this.setMarking(!this.editor.marking);
                break;
            case "colToggle":
                this.editor.setMarkColumns(!this.editor.markColumns);
                this.renderMarking();
                break;
            case "markUp": case "markDown":
                this.editor.moveMarkEnd(action == "markUp" ? -1 : 1);
                break;
            case "cutBlock": {
                // Spaltenblöcke nicht formatieren – das würde die Spalten verschieben
                const cols = this.editor.markColumns;
                if (this.editor.cutMarked() && !cols) await this.blockContext?.format();
                this.renderMarking();
                break;
            }
            case "copyBlock":
                this.editor.copyMarked();
                this.renderMarking();
                break;
            case "pasteBlock":
                if (this.editor.pasteMarked() == "lines") await this.blockContext?.format();
                this.renderMarking();
                break;
            case "mode":
                this.mode = this.mode == "blocks" ? "chars" : "blocks";
                try { localStorage.setItem("jpadblox.barMode", this.mode); } catch (e) { }
                this.applyMode();
                break;
            case "lineAdd": this.editor.insertLine(); break;
            case "lineDelete": if (this.field || !this.editor.deleteMarked()) this.editor.deleteLine(); break;
            case "left": case "right": {
                // Markier-Modus: Endzeile bzw. Einfügezeile eine Zeile nach oben/unten
                if (!this.field && this.editor.moveMarkCol(action == "left" ? -1 : 1)) break;
                if (!this.field && this.editor.moveMarkEnd(action == "left" ? -1 : 1)) break;
                const v = this.target, d = action == "left" ? -1 : 1;
                const head = Math.max(0, Math.min(v.state.doc.length, v.state.selection.main.head + d));
                v.dispatch({ selection: { anchor: head }, scrollIntoView: true });
                break;
            }
            case "info": this.showInfo(await this.bridge.hover(this.editor.getCursorOffset())); break;
            case "hide": this.target.contentDOM.blur(); break;
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
