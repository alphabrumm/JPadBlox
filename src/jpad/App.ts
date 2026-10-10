import jQuery from "jquery";
import * as monaco from 'monaco-editor';
import { JPadMain } from "./JPadMain.js";
import { TouchEditor } from "./TouchEditor.js";
import { LanguageBridge, escapeHtml } from "./LanguageBridge.js";
import { ProjectInfo, ProjectStore, STARTER_FILES, ProjectFile } from "./ProjectStore.js";
import { icon } from "./Icons.js";
import { Dialogs } from "./Dialogs.js";
import { KeyBar } from "./KeyBar.js";
import { ThemeManager } from "../client/main/gui/ThemeManager.js";
import { GUIFile } from "../client/workspace/File.js";
import { JavaLanguage } from "../compiler/java/JavaLanguage.js";
import { SchedulerState } from "../compiler/common/interpreter/SchedulerState.js";
import { WorkspaceExporter } from "../client/workspace/WorkspaceImporterExporter.js";

type View = "code" | "output" | "problems";
type ThemeChoice = "auto" | "light" | "dark";

const SPEEDS: { label: string, value: number | "max" }[] = [
    { label: "Zeitlupe", value: 2 },
    { label: "Langsam", value: 20 },
    { label: "Schnell", value: 5000 },
    { label: "Maximal", value: "max" },
];

declare var APP_VERSION: string;

/**
 * Die Oberfläche von JPad: Kopfzeile, Dateireiter, Editor, Ausgabe, Probleme,
 * Menü und Tastatur-Hilfsleiste.
 */
export class App {

    store = new ProjectStore();
    project!: ProjectInfo;
    main!: JPadMain;
    editor!: TouchEditor;
    bridge!: LanguageBridge;
    dialogs!: Dialogs;
    keyBar!: KeyBar;

    root: HTMLElement;
    el: Record<string, HTMLElement> = {};

    view: View = "code";
    sideView: "output" | "problems" = "output";
    errorCount = 0;
    modifiedSaveTimer: any;

    constructor(root: HTMLElement) {
        this.root = root;
    }

    // =====================================================================
    // Start
    // =====================================================================

    async start() {
        this.applyTheme(this.getThemeChoice());
        matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.applyTheme(this.getThemeChoice()));

        await this.store.open();
        this.project = this.store.ensureCurrent();

        this.buildShell();
        this.dialogs = new Dialogs(this.root);

        // Die IDE-Logik (Compiler, Interpreter, Ausgabe) der Online-IDE
        const $ideDiv = jQuery('<div class="jp-ide joeCssFence notranslate"></div>');
        this.el.outputHost.appendChild($ideDiv[0]);
        new ThemeManager(<HTMLDivElement>$ideDiv[0]).switchTheme(this.effectiveTheme());

        this.main = new JPadMain($ideDiv, ProjectStore.scriptIdFor(this.project.id));

        const starterScripts = STARTER_FILES.map(f => ({ title: f.name, text: f.text }));
        // Liegt das Projekt schon in der Datenbank, lädt MainEmbedded es von dort.
        await this.main.init(starterScripts);

        this.bridge = new LanguageBridge(<JavaLanguage>this.main.getCurrentProgrammingLanguage(),
            () => this.main.getActiveFile()?.getMonacoModel());
        this.bridge.onAfterCompletion = () => this.updateSignatureSoon();

        this.editor = new TouchEditor(this.el.editorHost, this.bridge, {
            onCursorActivity: () => this.updateSignatureSoon(),
            onDocChanged: () => this.markModified(),
            onFocusChanged: (focused) => this.keyBar.setEditorFocused(focused),
            onHistoryChanged: (canUndo, canRedo) => {
                this.el.undo.toggleAttribute("disabled", !canUndo);
                this.el.redo.toggleAttribute("disabled", !canRedo);
            }
        }, this.getFontSize());

        this.keyBar = new KeyBar(this.root, this.editor, this.bridge, (html) => this.showInfo(html));

        this.wireMain();
        this.wireRunButtons();

        const first = this.main.getActiveFile() || this.main.getFiles()[0];
        if (first) this.main.setFileActive(first);

        this.renderFileTabs();
        this.renderProjectTitle();
        this.setView("code");
        this.root.removeAttribute("aria-busy");
        this.root.querySelector(".jp-boot")?.remove();

        this.main.programControlButtons?.speedControl.setSpeedInStepsPerSecond(this.getSpeed());

        // Vor dem Schließen/Wechseln der App alles sichern
        const flush = () => this.main.flush();
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState == "hidden") flush(); });
    }

    // =====================================================================
    // Grundgerüst
    // =====================================================================

    private buildShell() {
        this.root.insertAdjacentHTML("beforeend", `
        <header class="jp-topbar">
            <button class="jp-iconbtn" data-ref="menuBtn" aria-label="Menü öffnen">${icon("menu")}</button>
            <button class="jp-project" data-ref="projectBtn" aria-label="Projekt umbenennen">
                <span class="jp-project-name" data-ref="projectName"></span>
                <span class="jp-project-state" data-ref="projectState"></span>
            </button>
            <div class="jp-topbar-spacer"></div>
            <div class="jp-toolgroup jp-edit-tools">
                <button class="jp-iconbtn" data-ref="undo" aria-label="Rückgängig" title="Rückgängig">${icon("undo")}</button>
                <button class="jp-iconbtn" data-ref="redo" aria-label="Wiederholen" title="Wiederholen">${icon("redo")}</button>
                <button class="jp-iconbtn jp-wide-only" data-ref="formatBtn" aria-label="Code formatieren" title="Code formatieren">${icon("format")}</button>
                <button class="jp-iconbtn" data-ref="saveBtn" aria-label="Projekt als Datei sichern" title="Projekt als Datei sichern">${icon("save")}<span class="jp-dot"></span></button>
            </div>
            <div class="jp-toolgroup jp-run-tools">
                <button class="jp-iconbtn jp-step" data-ref="stepInto" aria-label="Hineinspringen">${icon("stepInto")}</button>
                <button class="jp-iconbtn jp-step jp-wide-only" data-ref="stepOut" aria-label="Herausspringen">${icon("stepOut")}</button>
                <button class="jp-iconbtn jp-step" data-ref="stepOver" aria-label="Einzelschritt">${icon("stepOver")}</button>
                <button class="jp-iconbtn jp-stop" data-ref="stopBtn" aria-label="Programm anhalten">${icon("stop")}</button>
                <button class="jp-run" data-ref="pauseBtn" aria-label="Pause">${icon("pause")}</button>
                <button class="jp-run" data-ref="runBtn" aria-label="Programm starten">${icon("play")}</button>
            </div>
        </header>

        <main class="jp-main">
            <section class="jp-pane jp-pane-code" aria-label="Quelltext">
                <nav class="jp-filetabs" data-ref="fileTabs" aria-label="Dateien"></nav>
                <div class="jp-editor" data-ref="editorHost"></div>
                <div class="jp-signature" data-ref="signature" hidden></div>
            </section>
            <section class="jp-pane jp-pane-side">
                <div class="jp-segmented jp-side-switch" role="tablist">
                    <button role="tab" data-side="output">${icon("output")}<span>Ausgabe</span></button>
                    <button role="tab" data-side="problems">${icon("problems")}<span>Probleme</span><span class="jp-badge" data-ref="sideBadge"></span></button>
                </div>
                <div class="jp-output" data-ref="outputHost"></div>
                <div class="jp-problems" data-ref="problems"></div>
            </section>
        </main>

        <nav class="jp-bottomnav" aria-label="Ansicht">
            <button data-view="code">${icon("code")}<span>Code</span></button>
            <button data-view="output">${icon("output")}<span>Ausgabe</span></button>
            <button data-view="problems">${icon("problems")}<span>Probleme</span><span class="jp-badge" data-ref="navBadge"></span></button>
        </nav>

        <div class="jp-drawer-backdrop" data-ref="drawerBackdrop"></div>
        <aside class="jp-drawer" data-ref="drawer" aria-label="Menü" inert>
            <div class="jp-drawer-head">
                <div class="jp-brand"><span class="jp-brand-mark">J</span>JPad</div>
                <button class="jp-iconbtn" data-ref="drawerClose" aria-label="Menü schließen">${icon("close")}</button>
            </div>
            <div class="jp-drawer-body">
                <h2>Projekte</h2>
                <div class="jp-menu-actions">
                    <button data-ref="newProjectBtn">${icon("plus")}<span>Neues Projekt</span></button>
                    <button data-ref="openFileBtn">${icon("open")}<span>Projekt aus Datei öffnen</span></button>
                    <button data-ref="saveFileBtn">${icon("save")}<span>Projekt als Datei sichern</span></button>
                </div>
                <ul class="jp-projectlist" data-ref="projectList"></ul>

                <h2>Darstellung</h2>
                <div class="jp-segmented" data-ref="themeSwitch">
                    <button data-theme-choice="light">${icon("sun")}<span>Hell</span></button>
                    <button data-theme-choice="dark">${icon("moon")}<span>Dunkel</span></button>
                    <button data-theme-choice="auto">${icon("auto")}<span>System</span></button>
                </div>
                <div class="jp-setting-row">
                    <span>Schriftgröße</span>
                    <div class="jp-stepper">
                        <button data-ref="fontSmaller" aria-label="Schrift kleiner">A−</button>
                        <span data-ref="fontSizeLabel"></span>
                        <button data-ref="fontBigger" aria-label="Schrift größer">A+</button>
                    </div>
                </div>

                <h2>Ausführungstempo</h2>
                <div class="jp-segmented jp-speed" data-ref="speedSwitch">
                    ${SPEEDS.map((s, i) => `<button data-speed="${i}"><span>${s.label}</span></button>`).join("")}
                </div>
                <p class="jp-hint">In der Zeitlupe siehst du im Code, welche Zeile gerade ausgeführt wird.</p>

                <h2>Über JPad</h2>
                <p class="jp-about">JPad ist eine Oberfläche für Tablets und Handys auf Basis der
                <a href="https://www.online-ide.de" target="_blank" rel="noopener">Online-IDE</a> von Martin Pabst.
                Compiler und Programmiersprache stammen unverändert aus der Online-IDE.
                Deine Projekte bleiben auf diesem Gerät, bis du sie als Datei sicherst.
                Lizenz: GNU GPL v3 · <a href="https://github.com/alphabrumm/jpad" target="_blank" rel="noopener">Quellcode</a></p>
                <p class="jp-version">Version ${typeof APP_VERSION != "undefined" ? APP_VERSION : ""}</p>
            </div>
        </aside>
        <input type="file" accept=".json,application/json,text/plain" data-ref="fileInput" hidden>
        `);

        this.root.querySelectorAll<HTMLElement>("[data-ref]").forEach(e => this.el[e.dataset.ref!] = e);

        // ----- Kopfzeile -----
        this.el.menuBtn.addEventListener("click", () => this.openDrawer());
        this.el.drawerClose.addEventListener("click", () => this.closeDrawer());
        this.el.drawerBackdrop.addEventListener("click", () => this.closeDrawer());
        this.el.projectBtn.addEventListener("click", () => this.renameProject());
        this.el.undo.addEventListener("click", () => this.editor.undo());
        this.el.redo.addEventListener("click", () => this.editor.redo());
        this.el.formatBtn.addEventListener("click", () => this.formatCode());
        this.el.saveBtn.addEventListener("click", () => this.exportProject());

        // Kopfzeilen-Knöpfe sollen dem Editor den Fokus nicht wegnehmen (sonst klappt die Tastatur zu)
        this.root.querySelectorAll<HTMLElement>(".jp-topbar button.jp-iconbtn:not([data-ref=menuBtn]):not([data-ref=saveBtn])")
            .forEach(b => b.addEventListener("pointerdown", e => e.preventDefault()));

        // ----- Ansichten -----
        this.root.querySelectorAll<HTMLElement>(".jp-bottomnav [data-view]").forEach(b =>
            b.addEventListener("click", () => this.setView(<View>b.dataset.view)));
        this.root.querySelectorAll<HTMLElement>(".jp-side-switch [data-side]").forEach(b =>
            b.addEventListener("click", () => this.setSideView(<any>b.dataset.side)));

        // ----- Menü -----
        this.el.newProjectBtn.addEventListener("click", () => this.newProject());
        this.el.openFileBtn.addEventListener("click", () => { (<HTMLInputElement>this.el.fileInput).value = ""; this.el.fileInput.click(); });
        this.el.fileInput.addEventListener("change", () => {
            const f = (<HTMLInputElement>this.el.fileInput).files?.[0];
            if (f) this.importProject(f);
        });
        this.el.saveFileBtn.addEventListener("click", () => { this.closeDrawer(); this.exportProject(); });

        this.el.themeSwitch.querySelectorAll<HTMLElement>("[data-theme-choice]").forEach(b =>
            b.addEventListener("click", () => this.setThemeChoice(<ThemeChoice>b.dataset.themeChoice)));
        this.el.fontSmaller.addEventListener("click", () => this.changeFontSize(-1));
        this.el.fontBigger.addEventListener("click", () => this.changeFontSize(+1));
        this.el.speedSwitch.querySelectorAll<HTMLElement>("[data-speed]").forEach(b =>
            b.addEventListener("click", () => this.setSpeedIndex(parseInt(b.dataset.speed!))));
        this.renderSettings();

        // Breites Layout (iPad quer, Laptop) oder Reiter-Layout (Handy, iPad hoch)
        const mq = matchMedia("(min-width: 900px) and (min-aspect-ratio: 1/1)");
        const applyLayout = () => {
            this.root.dataset.layout = mq.matches ? "split" : "tabs";
            this.setView(this.view);
        };
        mq.addEventListener("change", applyLayout);
        applyLayout();
    }

    // =====================================================================
    // Verbindung zur IDE-Logik
    // =====================================================================

    private wireMain() {
        this.main.onActiveFileChanged = (file) => {
            this.editor.showFile(file);
            this.renderFileTabs();
            this.updateProgramPointer();
        };
        this.main.onShowPosition = (file, position, setCursor) => {
            if (this.editor.getFile() != file) this.main.setFileActive(file);
            this.editor.revealLine(position.lineNumber, position.column, setCursor);
        };
        this.main.onCompiled = () => this.onCompiled();
        this.main.onFilesChanged = () => this.renderFileTabs();

        monaco.editor.onDidChangeMarkers(() => {
            this.editor.updateDiagnostics();
            this.renderProblems();
        });

        // Programmzeiger und Exception-Markierung aus dem (unsichtbaren) Monaco-Editor übernehmen
        this.main.getMainEditor().onDidChangeModelDecorations(() => this.updateProgramPointer());
    }

    private updateProgramPointer() {
        const model = this.main.getMainEditor().getModel();
        if (!model || !this.editor || model != this.editor.getFile()?.getMonacoModel()) {
            this.editor?.setLineMarks([]);
            return;
        }
        const marks: { line: number, kind: "pointer" | "exception" }[] = [];
        for (const d of model.getAllDecorations()) {
            const cls = d.options.className || "";
            if (cls.indexOf("jo_revealProgramPointer") >= 0) marks.push({ line: d.range.startLineNumber, kind: "pointer" });
            else if (cls.indexOf("jo_revealExceptionPosition") >= 0) marks.push({ line: d.range.startLineNumber, kind: "exception" });
        }
        this.editor.setLineMarks(marks);
    }

    private onCompiled() {
        this.renderProblems();
        this.renderFileTabs();
    }

    private wireRunButtons() {
        // Muss vor registerButton stehen, damit der Zustand vor dem Start geprüft wird.
        // Beim Start auf schmalen Bildschirmen zur Ausgabe wechseln
        this.el.runBtn.addEventListener("pointerdown", () => {
            if (!this.el.runBtn.classList.contains("jo_active")) {
                if (this.errorCount > 0) {
                    this.toast("Das Programm enthält noch Fehler.", "problems");
                    this.setView("problems");
                }
                return;
            }
            this.main.flush();
            if (this.root.dataset.layout == "tabs") this.setView("output");
            else this.setSideView("output");
        });

        const am = this.main.getActionManager();
        const reg = (id: string, el: HTMLElement) => am.registerButton(id, jQuery(el));
        reg("interpreter.start", this.el.runBtn);
        reg("interpreter.pause", this.el.pauseBtn);
        reg("interpreter.stop", this.el.stopBtn);
        reg("interpreter.stepOver", this.el.stepOver);
        reg("interpreter.stepInto", this.el.stepInto);
        reg("interpreter.stepOut", this.el.stepOut);
        // Aktuellen Zustand übernehmen (die Online-IDE setzt ihn nur bei Änderungen)
        for (const id of ["interpreter.start", "interpreter.pause", "interpreter.stop", "interpreter.stepOver", "interpreter.stepInto", "interpreter.stepOut"]) {
            am.setActive(id, am.isActive(id));
        }
        // Pause-Knopf wird von der Online-IDE ein- und ausgeblendet; anfangs aus
        jQuery(this.el.pauseBtn).hide();

        this.main.getInterpreter().eventManager.on("stateChanged", (_old: SchedulerState, state: SchedulerState) => {
            this.root.dataset.runstate = SchedulerState[state];
        });
        this.root.dataset.runstate = "stopped";
    }

    // =====================================================================
    // Ansichten
    // =====================================================================

    setView(view: View) {
        this.view = view;
        if (view == "output" || view == "problems") this.sideView = view;
        this.root.dataset.view = view;
        this.root.dataset.side = this.sideView;
        this.root.querySelectorAll<HTMLElement>(".jp-bottomnav [data-view]").forEach(b =>
            b.setAttribute("aria-current", String(b.dataset.view == view)));
        this.root.querySelectorAll<HTMLElement>(".jp-side-switch [data-side]").forEach(b =>
            b.setAttribute("aria-selected", String(b.dataset.side == this.sideView)));
        if (view != "code") this.editor?.view.contentDOM.blur();
        // Grafikbereich der Online-IDE über Größenänderung informieren
        setTimeout(() => jQuery('.jo_graphics').trigger('sizeChanged'), 50);
    }

    setSideView(side: "output" | "problems") {
        this.sideView = side;
        if (this.root.dataset.layout == "tabs") this.setView(side);
        else this.setView(this.view == "code" ? "code" : side);
    }

    // =====================================================================
    // Dateien
    // =====================================================================

    private errorsOf(file: GUIFile): monaco.editor.IMarker[] {
        const model = file.getMonacoModel();
        if (!model) return [];
        return monaco.editor.getModelMarkers({ resource: model.uri }).filter(m => m.severity >= monaco.MarkerSeverity.Error);
    }

    renderFileTabs() {
        const container = this.el.fileTabs;
        if (!this.main) return;
        const active = this.main.getActiveFile();
        container.innerHTML = "";
        for (const file of this.main.getFiles()) {
            const errors = this.errorsOf(file).length;
            const b = document.createElement("button");
            b.className = "jp-filetab" + (file == active ? " is-active" : "") + (errors > 0 ? " has-errors" : "");
            b.innerHTML = `<span class="jp-filetab-name">${escapeHtml(file.name.replace(/\.java$/, ""))}</span>`
                + (errors > 0 ? `<span class="jp-badge">${errors}</span>` : "")
                + (file == active ? `<span class="jp-filetab-more" aria-label="Datei-Aktionen">${icon("more")}</span>` : "");
            b.addEventListener("click", () => {
                if (file == this.main.getActiveFile()) this.fileActions(file);
                else this.main.setFileActive(file);
            });
            container.appendChild(b);
        }
        const add = document.createElement("button");
        add.className = "jp-filetab jp-filetab-add";
        add.setAttribute("aria-label", "Neue Klasse");
        add.innerHTML = icon("plus") + "<span>Klasse</span>";
        add.addEventListener("click", () => this.newClass());
        container.appendChild(add);
        container.querySelector(".is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    private validateClassName(name: string, except?: GUIFile): string | null {
        if (!/^[A-Za-zÄÖÜäöü_][A-Za-z0-9ÄÖÜäöüß_]*$/.test(name)) {
            return "Ein Klassenname beginnt mit einem Buchstaben und enthält nur Buchstaben, Ziffern und _.";
        }
        if (this.main.getFiles().some(f => f != except && f.name.toLowerCase() == (name + ".java").toLowerCase())) {
            return `Es gibt schon eine Datei „${name}“.`;
        }
        return null;
    }

    async newClass() {
        const name = await this.dialogs.prompt({
            title: "Neue Klasse",
            label: "Name der Klasse",
            placeholder: "z. B. Auto",
            confirm: "Anlegen",
            validate: (v) => this.validateClassName(v.trim()),
            capitalize: true
        });
        if (!name) return;
        const n = name.trim();
        const file = this.main.createFile(n + ".java", `class ${n} {\n\n   \n\n}\n`);
        this.main.setFileActive(file);
        this.setView("code");
        setTimeout(() => { this.editor.revealLine(3, 4, true); this.editor.focus(); }, 50);
    }

    async fileActions(file: GUIFile) {
        const base = file.name.replace(/\.java$/, "");
        const choice = await this.dialogs.actions(base, [
            { id: "rename", label: "Umbenennen", icon: "edit" },
            { id: "format", label: "Code formatieren", icon: "format" },
            { id: "delete", label: "Löschen", icon: "trash", danger: true, disabled: this.main.getFiles().length <= 1 },
        ]);
        if (choice == "rename") {
            const newName = await this.dialogs.prompt({
                title: "Datei umbenennen", label: "Neuer Name", value: base, confirm: "Umbenennen",
                validate: (v) => this.validateClassName(v.trim(), file), capitalize: true
            });
            if (newName && newName.trim() != base) {
                this.main.renameFile(file, newName.trim() + ".java");
                this.toast(`Umbenannt in „${newName.trim()}“. Denk daran, auch den Klassennamen im Code anzupassen.`);
            }
        } else if (choice == "format") {
            this.formatCode();
        } else if (choice == "delete") {
            const ok = await this.dialogs.confirm({
                title: `„${base}“ löschen?`,
                text: "Die Datei wird aus diesem Projekt entfernt. Das lässt sich nicht rückgängig machen.",
                confirm: "Löschen", danger: true
            });
            if (ok) {
                this.editor.forgetFile(file);
                this.main.deleteFile(file);
                this.markModified();
            }
        }
    }

    async formatCode() {
        const changed = await this.bridge.format();
        this.toast(changed ? "Code formatiert." : "Der Code ist bereits ordentlich formatiert.");
    }

    // =====================================================================
    // Probleme
    // =====================================================================

    renderProblems() {
        if (!this.main) return;
        const list = this.el.problems;
        const items: string[] = [];
        let count = 0;
        const entries: { file: GUIFile, marker: monaco.editor.IMarker }[] = [];
        for (const file of this.main.getFiles()) {
            const model = file.getMonacoModel();
            if (!model) continue;
            for (const m of monaco.editor.getModelMarkers({ resource: model.uri })) {
                if (m.severity < monaco.MarkerSeverity.Warning) continue;
                if (m.severity >= monaco.MarkerSeverity.Error) count++;
                entries.push({ file, marker: m });
            }
        }
        entries.sort((a, b) => b.marker.severity - a.marker.severity);
        list.innerHTML = "";
        if (entries.length == 0) {
            list.innerHTML = `<div class="jp-empty">${icon("check")}<p>Keine Fehler gefunden.</p><p class="jp-hint">Tippe auf ▶, um dein Programm zu starten.</p></div>`;
        }
        for (const { file, marker } of entries) {
            const b = document.createElement("button");
            const isError = marker.severity >= monaco.MarkerSeverity.Error;
            b.className = "jp-problem " + (isError ? "is-error" : "is-warning");
            b.innerHTML = `<span class="jp-problem-where">${escapeHtml(file.name.replace(/\.java$/, ""))}, Zeile ${marker.startLineNumber}</span>
                <span class="jp-problem-msg">${escapeHtml(marker.message)}</span>`;
            b.addEventListener("click", () => {
                this.main.setFileActive(file);
                this.setView("code");
                this.editor.revealLine(marker.startLineNumber, marker.startColumn, true);
                this.editor.focus();
            });
            list.appendChild(b);
        }
        this.errorCount = count;
        for (const badge of [this.el.navBadge, this.el.sideBadge]) {
            badge.textContent = count > 0 ? String(count) : "";
            badge.hidden = count == 0;
        }
        void items;
    }

    // =====================================================================
    // Parameterhilfe & Info
    // =====================================================================

    private signatureTimer: any;
    updateSignatureSoon() {
        clearTimeout(this.signatureTimer);
        this.signatureTimer = setTimeout(async () => {
            const offset = this.editor.getCursorOffset();
            const line = this.editor.view.state.doc.lineAt(offset);
            const before = this.editor.view.state.sliceDoc(line.from, offset);
            // Nur innerhalb offener runder Klammern nachfragen
            const open = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
            const info = open > 0 ? await this.bridge.signatureHelp(offset) : null;
            const bar = this.el.signature;
            if (!info) { bar.hidden = true; return; }
            bar.innerHTML = `<code>${info.html}</code>`;
            bar.hidden = false;
        }, 120);
    }

    showInfo(html: string | null) {
        if (!html) {
            this.toast("Zu dieser Stelle gibt es keine Informationen. Setze den Cursor auf einen Namen.");
            return;
        }
        this.dialogs.sheet("Info", `<div class="jp-doc">${html}</div>`);
    }

    // =====================================================================
    // Projekte
    // =====================================================================

    renderProjectTitle() {
        this.el.projectName.textContent = this.project.name;
        const unsaved = this.project.modified > this.project.exported;
        this.el.projectState.textContent = unsaved
            ? (this.project.exported == 0 ? "noch nie als Datei gesichert" : "Änderungen nicht als Datei gesichert")
            : "als Datei gesichert";
        this.root.classList.toggle("is-unsaved", unsaved);
    }

    markModified() {
        this.project.modified = Date.now();
        clearTimeout(this.modifiedSaveTimer);
        this.modifiedSaveTimer = setTimeout(() => {
            this.store.update(this.project.id, { modified: this.project.modified });
            this.renderProjectTitle();
        }, 400);
    }

    async renameProject() {
        const name = await this.dialogs.prompt({
            title: "Projekt umbenennen", label: "Projektname", value: this.project.name, confirm: "Umbenennen",
            validate: v => v.trim().length == 0 ? "Bitte gib einen Namen ein." : null
        });
        if (!name || name.trim() == this.project.name) return;
        this.project.name = this.store.uniqueName(name.trim(), this.project.id);
        this.store.update(this.project.id, { name: this.project.name });
        this.renderProjectTitle();
        this.renderProjectList();
    }

    renderProjectList() {
        const ul = this.el.projectList;
        ul.innerHTML = "";
        const fmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
        for (const p of this.store.list()) {
            const li = document.createElement("li");
            const isCurrent = p.id == this.project.id;
            li.className = "jp-projectitem" + (isCurrent ? " is-current" : "");
            li.innerHTML = `
                <button class="jp-projectitem-open">${icon(isCurrent ? "check" : "folder")}
                    <span><span class="jp-projectitem-name">${escapeHtml(p.name)}</span>
                    <span class="jp-projectitem-date">geändert ${fmt.format(new Date(p.modified))}</span></span>
                </button>
                <button class="jp-iconbtn jp-projectitem-del" aria-label="Projekt „${escapeHtml(p.name)}“ löschen">${icon("trash")}</button>`;
            li.querySelector(".jp-projectitem-open")!.addEventListener("click", () => {
                if (!isCurrent) this.switchToProject(p.id); else this.closeDrawer();
            });
            li.querySelector(".jp-projectitem-del")!.addEventListener("click", () => this.deleteProject(p));
            ul.appendChild(li);
        }
    }

    switchToProject(id: string) {
        this.main.flush();
        this.store.setCurrentId(id);
        // Neu laden ist der robusteste Weg, die IDE mit einem anderen Projekt zu starten.
        setTimeout(() => location.reload(), 150);
    }

    async newProject() {
        const name = await this.dialogs.prompt({
            title: "Neues Projekt", label: "Projektname", placeholder: "z. B. Bankkonto", confirm: "Anlegen",
            validate: v => v.trim().length == 0 ? "Bitte gib einen Namen ein." : null
        });
        if (!name) return;
        const p = this.store.createInfo(name.trim());
        await this.store.writeFiles(p.id, STARTER_FILES);
        this.switchToProject(p.id);
    }

    async deleteProject(p: ProjectInfo) {
        const ok = await this.dialogs.confirm({
            title: `„${p.name}“ löschen?`,
            text: p.exported >= p.modified ? "Das Projekt wird von diesem Gerät gelöscht. Deine gesicherte Datei bleibt erhalten."
                : "Das Projekt wird von diesem Gerät gelöscht. Es wurde nicht als Datei gesichert und ist danach verloren.",
            confirm: "Löschen", danger: true
        });
        if (!ok) return;
        await this.store.deleteProject(p.id);
        if (p.id == this.project.id) {
            const next = this.store.list()[0] || this.store.createInfo("Mein Projekt");
            this.switchToProject(next.id);
        } else {
            this.renderProjectList();
        }
    }

    async exportProject() {
        this.main.flush();
        const files: ProjectFile[] = this.main.getFiles().map(f => ({ name: f.name, text: f.getText() }));
        let exported;
        try {
            exported = await WorkspaceExporter.exportWorkspace(this.main.getCurrentWorkspace());
            exported.name = this.project.name;
        } catch (e) {
            exported = ProjectStore.toExportedWorkspace(this.project.name, files);
        }
        const json = JSON.stringify(exported, undefined, 2);
        const filename = this.project.name.replace(/[\\/:*?"<>|]/g, "_") + ".json";
        const file = new File([json], filename, { type: "application/json" });

        let done = false;
        const nav: any = navigator;
        if (nav.canShare && nav.canShare({ files: [file] })) {
            try {
                await nav.share({ files: [file], title: this.project.name });
                done = true;
            } catch (e: any) {
                if (e && e.name == "AbortError") return; // Teilen abgebrochen
            }
        }
        if (!done) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(file);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        }
        this.project.exported = Date.now();
        this.store.update(this.project.id, { exported: this.project.exported, modified: this.project.modified });
        this.renderProjectTitle();
        this.toast(`„${filename}“ gesichert.`, "check");
    }

    async importProject(file: File) {
        try {
            const text = await file.text();
            const { name, files } = ProjectStore.parseImport(text, file.name);
            const p = this.store.createInfo(name);
            p.exported = p.modified;
            this.store.update(p.id, { exported: p.modified });
            await this.store.writeFiles(p.id, files);
            this.closeDrawer();
            this.toast(`„${p.name}“ geöffnet.`, "check");
            this.switchToProject(p.id);
        } catch (e: any) {
            this.dialogs.alert({ title: "Datei lässt sich nicht öffnen", text: e?.message || String(e) });
        }
    }

    // =====================================================================
    // Menü & Einstellungen
    // =====================================================================

    openDrawer() {
        this.main.flush();
        this.renderProjectList();
        this.renderSettings();
        this.root.classList.add("drawer-open");
        this.el.drawer.removeAttribute("inert");
        (<HTMLElement>this.el.drawerClose).focus({ preventScroll: true });
    }

    closeDrawer() {
        this.root.classList.remove("drawer-open");
        this.el.drawer.setAttribute("inert", "");
    }

    getThemeChoice(): ThemeChoice {
        try { return <ThemeChoice>(localStorage.getItem("jpad.theme") || "auto"); } catch (e) { return "auto"; }
    }

    effectiveTheme(): "light" | "dark" {
        const c = this.getThemeChoice();
        if (c == "auto") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        return c;
    }

    setThemeChoice(c: ThemeChoice) {
        try { localStorage.setItem("jpad.theme", c); } catch (e) { }
        this.applyTheme(c);
        this.renderSettings();
    }

    applyTheme(c: ThemeChoice) {
        document.documentElement.dataset.theme = c;
        const eff = this.effectiveTheme();
        document.documentElement.dataset.effective = eff;
        const ide = this.root.querySelector<HTMLDivElement>(".jp-ide");
        if (ide) new ThemeManager(ide).switchTheme(eff);
        const meta = document.querySelectorAll('meta[name="theme-color"]');
        meta.forEach(m => m.setAttribute("content", eff == "dark" ? "#151922" : "#F3F5F9"));
    }

    getFontSize(): number {
        try { return parseInt(localStorage.getItem("jpad.fontSize") || "") || 16; } catch (e) { return 16; }
    }

    changeFontSize(delta: number) {
        const size = Math.max(12, Math.min(24, this.getFontSize() + delta));
        try { localStorage.setItem("jpad.fontSize", String(size)); } catch (e) { }
        this.editor?.setFontSize(size);
        this.renderSettings();
    }

    getSpeedIndex(): number {
        try {
            const v = localStorage.getItem("jpad.speed");
            return v == null ? 3 : Math.max(0, Math.min(SPEEDS.length - 1, parseInt(v)));
        } catch (e) { return 3; }
    }

    getSpeed() { return SPEEDS[this.getSpeedIndex()].value; }

    setSpeedIndex(i: number) {
        try { localStorage.setItem("jpad.speed", String(i)); } catch (e) { }
        this.main?.programControlButtons?.speedControl.setSpeedInStepsPerSecond(SPEEDS[i].value);
        this.renderSettings();
    }

    renderSettings() {
        const c = this.getThemeChoice();
        this.el.themeSwitch.querySelectorAll<HTMLElement>("[data-theme-choice]").forEach(b =>
            b.setAttribute("aria-pressed", String(b.dataset.themeChoice == c)));
        this.el.fontSizeLabel.textContent = this.getFontSize() + " pt";
        const s = this.getSpeedIndex();
        this.el.speedSwitch.querySelectorAll<HTMLElement>("[data-speed]").forEach(b =>
            b.setAttribute("aria-pressed", String(parseInt(b.dataset.speed!) == s)));
    }

    // =====================================================================
    // Hinweise
    // =====================================================================

    private toastTimer: any;
    toast(text: string, iconName: string = "info") {
        let t = this.root.querySelector<HTMLElement>(".jp-toast");
        if (!t) {
            t = document.createElement("div");
            t.className = "jp-toast";
            t.setAttribute("role", "status");
            this.root.appendChild(t);
        }
        t.innerHTML = icon(iconName) + `<span>${escapeHtml(text)}</span>`;
        t.classList.add("is-visible");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t!.classList.remove("is-visible"), 3200);
    }
}
