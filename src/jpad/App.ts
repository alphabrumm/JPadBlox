import jQuery from "jquery";
import * as monaco from 'monaco-editor';
import { JPadMain } from "./JPadMain.js";
import { TouchEditor } from "./TouchEditor.js";
import { LanguageBridge, escapeHtml } from "./LanguageBridge.js";
import { ProjectInfo, ProjectStore, STARTER_FILES, ProjectFile } from "./ProjectStore.js";
import { icon } from "./Icons.js";
import { Dialogs } from "./Dialogs.js";
import { KeyBar } from "./KeyBar.js";
import { blockPanelHtml, wireBlockPanel, BlockContext } from "./Blocks.js";
import { DiagramView } from "./Diagram.js";
import { TouchTips } from "./TouchTips.js";
import { ThemeManager } from "../client/main/gui/ThemeManager.js";
import { GUIFile } from "../client/workspace/File.js";
import { JavaLanguage } from "../compiler/java/JavaLanguage.js";
import { SchedulerState } from "../compiler/common/interpreter/SchedulerState.js";
import { WorkspaceExporter } from "../client/workspace/WorkspaceImporterExporter.js";
import { JCM } from "../compiler/java/language/JavaCompilerMessages.js";
import { SpritesheetData } from "../client/spritemanager/SpritesheetData.js";
import { bytesToBase64, base64ToBytes } from "../tools/Base64.js";

/**
 * Bei einem fehlenden Semikolon meldet der Compiler zwei Fehler: „Strichpunkt hier einfügen“
 * (Hilfsmarkierung für die automatische Korrektur) und „Erwartet wird ein Strichpunkt …“.
 * Für Schüler ist das ein Fehler – die Hilfsmarkierung zählen und listen wir deshalb nicht.
 */
function isHelperMarker(m: monaco.editor.IMarker): boolean {
    return m.message.startsWith(JCM.insertSemicolonHere());
}

type View = "code" | "lernpfad" | "output" | "variables" | "diagram" | "problems";
type SideView = "lernpfad" | "output" | "variables" | "diagram" | "problems";
type ThemeChoice = "auto" | "light" | "dark";
type Skin = "default" | "candy" | "hacker";

/** Schriften der Spaß-Themes (nur online; ohne Netz greifen die Ersatzschriften). */
function loadSkinFonts() {
    if (document.getElementById("jp-skin-fonts")) return;
    const link = document.createElement("link");
    link.id = "jp-skin-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=M+PLUS+1+Code:wght@400;600"
        + "&family=Chakra+Petch:wght@400;500;600&family=Share+Tech+Mono&display=swap";
    document.head.appendChild(link);
}

/** JPadBlox: Aufteilung der drei Spalten (siehe applyLayout) */
type ViewMode = "normal" | "editorWide" | "editorFull" | "infoWide" | "infoFull";
type ViewState = { mode: ViewMode, blocksWide: boolean, before?: { mode: ViewMode, blocksWide: boolean } };

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
    tips = new TouchTips();
    diagram!: DiagramView;

    root: HTMLElement;
    el: Record<string, HTMLElement> = {};

    view: View = "code";
    sideView: SideView = "output";
    lernpfadHtml: string | null = null;
    private applyLayout: () => void = () => { };
    private lernpfadMessageHandler: ((ev: MessageEvent) => void) | null = null;
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
        const linkMessage = await this.openFromLink();
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
        await this.applyUserSprites(await this.store.readSpritesheet(this.project.id).catch(() => null));

        this.setupVariablesView();
        this.diagram = new DiagramView(this.el.diagram, this.main, () => this.project.id, (file, line, column) => {
            this.main.setFileActive(file);
            if (this.root.dataset.layout == "tabs") this.setView("code");
            this.editor.revealLine(line, column, true);
        });

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

        // Für Fehlersuche in der Browser-Konsole
        (window as any).jpad = this;
        // Diagnose-Protokoll für Fehlersuche auf echten Geräten: jpad…/?debug
        if (/[?&]debug\b/.test(location.search)) import("./DebugLog.js").then(m => m.startDebugLog(this.editor.view));

        this.keyBar = new KeyBar(this.root, this.editor, this.bridge, (html) => this.showInfo(html));
        const blockContext: BlockContext = {
            view: this.editor.view,
            dialogs: this.dialogs,
            projectTypes: () => this.projectTypes(),
            format: () => this.formatAfterBlock(),
            constructorSuggestion: (offset) => this.bridge.constructorSuggestion(offset),
            createFile: (name, text, cursor) => {
                const file = this.main.createFile(name + ".java", text);
                this.main.setFileActive(file);
                this.setView("code");
                setTimeout(() => {
                    const v = this.editor.view;
                    v.dispatch({ selection: { anchor: Math.min(cursor, v.state.doc.length) }, scrollIntoView: true });
                    v.focus();
                }, 50);
            },
            fileExists: (name) => this.main.getFiles().some(f => f.name.toLowerCase() == (name + ".java").toLowerCase()),
        };
        wireBlockPanel(this.el.blockPanel, blockContext);
        this.keyBar.blockContext = blockContext;
        this.editor.onToggleBreakpoint = (line) => this.toggleBreakpoint(line);
        this.placeKeyBar();

        this.wireMain();
        this.wireRunButtons();

        const first = this.main.getActiveFile() || this.main.getFiles()[0];
        if (first) this.main.setFileActive(first);

        this.renderFileTabs();
        this.renderProjectTitle();
        this.setView("code");
        // Projekt mit eingebettetem Lernpfad: startet mit dem Lernpfad in der Seitenleiste
        this.showLernpfad(await this.store.readLernpfad(this.project.id).catch(() => null));
        if (this.lernpfadHtml) {
            this.setSideView("lernpfad");
            this.showLernpfadLayout();
        }
        this.root.removeAttribute("aria-busy");
        this.root.querySelector(".jp-boot")?.remove();
        if (linkMessage?.error) this.dialogs.alert({ title: "Lernpfad lässt sich nicht öffnen", text: linkMessage.error });
        else if (linkMessage?.info) this.toast(linkMessage.info, "check", 5000);

        this.main.programControlButtons?.speedControl.setSpeedInStepsPerSecond(this.getSpeed());

        // Vor dem Schließen/Wechseln der App alles sichern
        const flush = () => this.main.flush();
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState == "hidden") flush(); });
    }

    // =====================================================================
    // Grundgerüst
    // =====================================================================

    /**
     * Die Hilfsleiste sitzt auf allen Touch-Geräten (iPad wie iPhone) unten: bei offener Tastatur
     * schwebt sie über der Tastatur, sonst steht sie am unteren Bildschirmrand (Klasse „tablet“).
     * Die Klasse „phone“ kennzeichnet zusätzlich Handys (kürzere Bildschirmseite unter 600 px,
     * im Hoch- wie im Querformat; das kleinste iPad hat 744 px) – dort fehlt z. B. die Glühbirne.
     */
    private placeKeyBar() {
        const coarse = matchMedia("(pointer: coarse)");
        const update = () => {
            const phone = coarse.matches && Math.min(screen.width, screen.height) < 600;
            document.documentElement.classList.toggle("phone", phone);
            // Touch-Gerät. maxTouchPoints zusätzlich, weil Safari bei angeschlossenem
            // Trackpad (Magic Keyboard) keinen groben Zeiger mehr meldet.
            const touch = coarse.matches || navigator.maxTouchPoints > 1;
            document.documentElement.classList.toggle("touch", touch);
            // JPadBlox: Die Hilfsleiste steht auf allen Geräten dauerhaft unten – auch an PC und Mac
            // (die Klasse „tablet“ steuert genau das: Leiste immer sichtbar, Platz dafür reserviert)
            document.documentElement.classList.toggle("tablet", true);
            const bar = this.keyBar.el;
            if (bar.parentElement != this.root) this.root.appendChild(bar);
        };
        coarse.addEventListener?.("change", update);
        window.addEventListener("resize", update);
        update();
    }

    private buildShell() {
        this.root.insertAdjacentHTML("beforeend", `
        <header class="jp-topbar">
            <button class="jp-iconbtn" data-ref="menuBtn" aria-label="Menü öffnen" data-tip="Menü: Projekte, Darstellung, Ausführungstempo und Nachschlagen">${icon("menu")}</button>
            <button class="jp-project" data-ref="projectBtn" aria-label="Projekt umbenennen" data-tip="Name des Projekts – antippen, um es umzubenennen">
                <span class="jp-project-name" data-ref="projectName"></span>
                <span class="jp-project-state" data-ref="projectState"></span>
            </button>
            <div class="jp-topbar-spacer"></div>
            <div class="jp-bulbgroup" data-ref="bulbGroup">
                <div class="jp-toolgroup jp-edit-tools" data-ref="editTools">
                    <button class="jp-iconbtn" data-ref="copyAllBtn" data-tip="Code aller Dateien in die Zwischenablage kopieren" aria-label="Code aller Dateien kopieren" title="Code aller Dateien kopieren">${icon("copyAll")}</button>
                    <button class="jp-iconbtn" data-ref="copyFileBtn" data-tip="Code der geöffneten Datei in die Zwischenablage kopieren" aria-label="Code dieser Datei kopieren" title="Code dieser Datei kopieren">${icon("copyFile")}</button>
                    <button class="jp-iconbtn" data-ref="undo" data-tip="Rückgängig: letzte Änderung zurücknehmen" aria-label="Rückgängig" title="Rückgängig">${icon("undo")}</button>
                    <button class="jp-iconbtn" data-ref="redo" data-tip="Wiederholen: zurückgenommene Änderung wiederherstellen" aria-label="Wiederholen" title="Wiederholen">${icon("redo")}</button>
                    <button class="jp-iconbtn jp-wide-only" data-ref="formatBtn" data-tip="Code formatieren: Einrückungen und Abstände ordnen" aria-label="Code formatieren" title="Code formatieren">${icon("format")}</button>
                    <button class="jp-iconbtn" data-ref="saveBtn" data-tip="Projekt als Datei sichern. Ein Punkt zeigt Änderungen, die noch nicht gesichert sind." aria-label="Projekt als Datei sichern" title="Projekt als Datei sichern">${icon("save")}<span class="jp-dot"></span></button>
                </div>
                <span class="jp-topbar-sep" aria-hidden="true"></span>
                <button class="jp-iconbtn jp-bulb" data-ref="bulbBtn" aria-label="Tipp: Hilfe zu den Buttons" data-tip="Tipp: So bekommst Du Hilfe zu jedem Button">${icon("lightbulb")}</button>
            </div>
            <button class="jp-iconbtn jp-skinbtn" data-ref="skinBtn"></button>
            <div class="jp-toolgroup jp-run-tools">
                <button class="jp-iconbtn jp-step jp-step-more" data-ref="stepOver" data-help="stepOver" data-tip="Methode überspringen: führt einen Methodenaufruf in einem Schritt aus" aria-label="Methode überspringen" title="Methode überspringen">${icon("stepOver")}</button>
                <button class="jp-iconbtn jp-step jp-step-more jp-wide-only" data-ref="stepOut" data-help="stepOut" data-tip="Methode verlassen: läuft bis zum Ende der aktuellen Methode" aria-label="Methode verlassen" title="Methode verlassen">${icon("stepOut")}</button>
                <button class="jp-stepbtn" data-ref="stepInto" data-help="step" data-tip="Schritt: führt die nächste Zeile aus – die aktuelle Zeile ist im Code gelb markiert" aria-label="Schritt: nächste Zeile ausführen" title="Schritt: nächste Zeile ausführen">${icon("stepInto")}<span>Schritt</span></button>
                <button class="jp-iconbtn jp-stop" data-ref="stopBtn" data-tip="Programm beenden" aria-label="Programm anhalten">${icon("stop")}</button>
                <button class="jp-run" data-ref="pauseBtn" data-tip="Programm anhalten (Pause)" aria-label="Pause">${icon("pause")}</button>
                <button class="jp-run" data-ref="runBtn" data-help="run" data-tip="Programm starten" aria-label="Programm starten">${icon("play")}</button>
            </div>
        </header>

        <main class="jp-main">
            <section class="jp-pane jp-pane-blocks" aria-label="Bausteine">
                <div class="jp-panehead">
                    <span class="jp-panehead-title">Bausteine</span>
                    <button class="jp-iconbtn jp-layoutbtn" data-ref="blocksLayoutBtn"></button>
                </div>
                <div class="jp-blockpanel" data-ref="blockPanel">${blockPanelHtml()}</div>
            </section>
            <section class="jp-pane jp-pane-code" aria-label="Quelltext">
                <div class="jp-filebar" data-ref="filebar">
                    <nav class="jp-filetabs" data-ref="fileTabs" aria-label="Dateien"></nav>
                    <div class="jp-filebar-actions">
                        <button class="jp-filetab-add" data-ref="newFileBtn" data-tip="Neue Datei (Klasse) anlegen" aria-label="Neue Datei" title="Neue Datei">${icon("plus")}</button>
                    </div>
                    <button class="jp-iconbtn jp-layoutbtn" data-ref="editorFullBtn"></button>
                    <button class="jp-iconbtn jp-layoutbtn" data-ref="layoutBtn"></button>
                </div>
                <div class="jp-editor" data-ref="editorHost"></div>
                <div class="jp-signature" data-ref="signature" hidden></div>
            </section>
            <section class="jp-pane jp-pane-side">
                <div class="jp-sidehead">
                <div class="jp-segmented jp-side-switch" role="tablist">
                    <button role="tab" data-side="lernpfad" class="jp-lernpfad-tab" data-tip="Lernpfad: Anleitung und Aufgaben zu diesem Projekt" aria-label="Lernpfad" title="Lernpfad">${icon("lernpfad")}</button>
                    <button role="tab" data-side="output" data-tip="Ausgabe: Text und Grafik deines Programms">${icon("output")}<span>Ausgabe</span></button>
                    <button role="tab" data-side="variables" data-tip="Variablen und ihre Werte beim schrittweisen Ausführen">${icon("variables")}<span>Variablen</span></button>
                    <button role="tab" data-side="diagram" data-tip="Diagramm: Klassen und Objekte">${icon("diagram")}<span>Diagramm</span></button>
                    <button role="tab" data-side="problems" data-tip="Probleme: Fehler im Code">${icon("problems")}<span>Probleme</span><span class="jp-badge" data-ref="sideBadge"></span></button>
                </div>
                <button class="jp-iconbtn jp-layoutbtn" data-ref="sideFullBtn"></button>
                <button class="jp-iconbtn jp-layoutbtn" data-ref="sideLayoutBtn"></button>
                </div>
                <div class="jp-lernpfad" data-ref="lernpfad"></div>
                <div class="jp-output" data-ref="outputHost"></div>
                <div class="jp-variables joeCssFence" data-ref="variables"></div>
                <div class="jp-diagram" data-ref="diagram"></div>
                <div class="jp-problems" data-ref="problems"></div>
            </section>
        </main>

        <nav class="jp-bottomnav" aria-label="Ansicht">
            <button data-view="code" data-tip="Code: der Editor mit deinen Dateien">${icon("code")}<span>Code</span></button>
            <button data-view="lernpfad" class="jp-lernpfad-tab" data-tip="Lernpfad: Anleitung und Aufgaben zu diesem Projekt">${icon("lernpfad")}<span>Lernpfad</span></button>
            <button data-view="output" data-tip="Ausgabe: Text und Grafik deines Programms">${icon("output")}<span>Ausgabe</span></button>
            <button data-view="variables" data-tip="Variablen und ihre Werte beim schrittweisen Ausführen">${icon("variables")}<span>Variablen</span></button>
            <button data-view="diagram" data-tip="Diagramm: Klassen und Objekte">${icon("diagram")}<span>Diagramm</span></button>
            <button data-view="problems" data-tip="Probleme: Fehler im Code">${icon("problems")}<span>Probleme</span><span class="jp-badge" data-ref="navBadge"></span></button>
        </nav>

        <div class="jp-drawer-backdrop" data-ref="drawerBackdrop"></div>
        <aside class="jp-drawer" data-ref="drawer" aria-label="Menü" inert>
            <div class="jp-drawer-head">
                <div class="jp-brand"><span class="jp-brand-mark">J</span>JPad</div>
                <button class="jp-iconbtn" data-ref="drawerClose" data-tip="Menü schließen" aria-label="Menü schließen">${icon("close")}</button>
            </div>
            <div class="jp-drawer-body">
                <h2>Projekte</h2>
                <div class="jp-menu-actions">
                    <button data-ref="newProjectBtn" data-tip="Neues, leeres Projekt anlegen">${icon("plus")}<span>Neues Projekt</span></button>
                    <button data-ref="openFileBtn" data-tip="Projekt aus einer Datei öffnen (z. B. aus ByCS Drive)">${icon("open")}<span>Projekt aus Datei öffnen</span></button>
                    <button data-ref="saveFileBtn" data-tip="Projekt als Datei sichern">${icon("save")}<span>Projekt als Datei sichern</span></button>
                    <button data-ref="userSpritesBtn" data-tip="Eigene Bilder als Sprites zum Projekt hinzufügen">${icon("imagePlus")}<span>Eigene Sprites</span></button>
                    <button data-ref="lernpfadAddBtn" data-tip="Eine HTML-Seite oder ein ZIP (index.html mit Bildern) als Lernpfad in dieses Projekt einbetten">${icon("lernpfad")}<span>Lernpfad einbetten</span></button>
                    <button data-ref="lernpfadRemoveBtn" data-tip="Den eingebetteten Lernpfad aus diesem Projekt entfernen">${icon("trash")}<span>Lernpfad entfernen</span></button>
                </div>
                <ul class="jp-projectlist" data-ref="projectList"></ul>

                <h2>Darstellung</h2>
                <div class="jp-segmented" data-ref="themeSwitch">
                    <button data-theme-choice="light" data-tip="Helle Darstellung">${icon("sun")}<span>Hell</span></button>
                    <button data-theme-choice="dark" data-tip="Dunkle Darstellung">${icon("moon")}<span>Dunkel</span></button>
                    <button data-theme-choice="auto" data-tip="Darstellung wie in der Systemeinstellung des Geräts">${icon("auto")}<span>System</span></button>
                </div>
                <div class="jp-setting-row">
                    <span>Schriftgröße</span>
                    <div class="jp-stepper">
                        <button data-ref="fontSmaller" data-tip="Schrift im Editor kleiner" aria-label="Schrift kleiner">A−</button>
                        <span data-ref="fontSizeLabel"></span>
                        <button data-ref="fontBigger" data-tip="Schrift im Editor größer" aria-label="Schrift größer">A+</button>
                    </div>
                </div>

                <h2>Ausführungstempo</h2>
                <div class="jp-segmented jp-speed" data-ref="speedSwitch">
                    ${SPEEDS.map((s, i) => `<button data-speed="${i}" data-tip="Ausführungstempo: ${s.label}"><span>${s.label}</span></button>`).join("")}
                </div>
                <p class="jp-hint">In der Zeitlupe siehst du im Code, welche Zeile gerade ausgeführt wird.</p>

                <h2>Nachschlagen</h2>
                <div class="jp-menu-actions">
                    <button data-ref="colorsBtn" data-tip="Alle Farben der Klasse Color nachschlagen">${icon("palette")}<span>Color Handbuch</span></button>
                    <button data-ref="handbookBtn" data-tip="Klassen und Methoden der Online-IDE nachschlagen">${icon("book")}<span>Class Handbuch</span></button>
                    <button data-ref="spritesBtn" data-tip="Alle eingebauten Sprites mit ihren Nummern ansehen">${icon("image")}<span>Sprite Bibliothek</span></button>
                </div>

                <h2>Über JPad</h2>
                <p class="jp-about">JPad ist eine Oberfläche mit Code-Bausteinen zum Antippen für Tablets und Handys auf Basis der
                <a href="https://www.online-ide.de" target="_blank" rel="noopener">Online-IDE</a> von Martin Pabst.
                Compiler und Programmiersprache stammen unverändert aus der Online-IDE.
                Deine Projekte bleiben auf diesem Gerät, bis du sie als Datei sicherst.
                Lizenz: GNU GPL v3 · <a href="https://github.com/alphabrumm/JPadBlox" target="_blank" rel="noopener">Quellcode</a></p>
                <p class="jp-version">Version ${typeof APP_VERSION != "undefined" ? APP_VERSION : ""}</p>
            </div>
        </aside>
        <input type="file" accept=".json,application/json,text/plain" data-ref="fileInput" hidden>
        <input type="file" accept=".html,.htm,.zip,text/html,application/zip" data-ref="lernpfadInput" hidden>
        `);

        this.root.querySelectorAll<HTMLElement>("[data-ref]").forEach(e => this.el[e.dataset.ref!] = e);

        // ----- Kopfzeile -----
        this.el.menuBtn.addEventListener("click", () => this.openDrawer());
        this.el.drawerClose.addEventListener("click", () => this.closeDrawer());
        this.el.drawerBackdrop.addEventListener("click", () => this.closeDrawer());
        this.el.projectBtn.addEventListener("click", () => this.renameProject());
        this.el.bulbBtn.addEventListener("click", () => this.tips.toggleInfo(this.el.bulbBtn));
        this.el.newFileBtn.addEventListener("click", () => this.newFile());
        // JPadBlox: Knopf „Zwischenablage in neue Datei“ entfällt
        this.el.copyAllBtn.addEventListener("click", () => this.copyCode(true));
        this.el.copyFileBtn.addEventListener("click", () => this.copyCode(false));
        this.el.undo.addEventListener("click", () => this.editor.undo());
        this.el.redo.addEventListener("click", () => this.editor.redo());
        this.el.formatBtn.addEventListener("click", () => this.formatCode());
        this.el.saveBtn.addEventListener("click", () => this.exportProject());
        this.el.skinBtn.addEventListener("click", () => this.nextSkin());
        this.renderSkinButton();

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
        this.el.lernpfadAddBtn.addEventListener("click", () => { (<HTMLInputElement>this.el.lernpfadInput).value = ""; this.el.lernpfadInput.click(); });
        this.el.lernpfadInput.addEventListener("change", () => {
            const f = (<HTMLInputElement>this.el.lernpfadInput).files?.[0];
            if (f) this.embedLernpfad(f);
        });
        this.el.lernpfadRemoveBtn.addEventListener("click", () => this.removeLernpfad());
        this.el.handbookBtn.addEventListener("click", async () => {
            this.closeDrawer();
            const { openHandbook } = await import("./Handbook.js");
            openHandbook(this.root);
        });
        this.el.colorsBtn.addEventListener("click", async () => {
            this.closeDrawer();
            const { openColorBook } = await import("./ColorBook.js");
            openColorBook(this.root, (t, i) => this.toast(t, i));
        });
        this.el.userSpritesBtn.addEventListener("click", async () => {
            this.closeDrawer();
            const { openUserSprites } = await import("./UserSprites.js");
            openUserSprites(this.root, {
                dialogs: this.dialogs,
                toast: (t, i) => this.toast(t, i),
                load: () => this.store.readSpritesheet(this.project.id),
                save: async (zip) => {
                    await this.store.writeSpritesheet(this.project.id, zip);
                    await this.applyUserSprites(zip);
                    this.markModified();
                }
            });
        });
        this.el.spritesBtn.addEventListener("click", async () => {
            this.closeDrawer();
            const { openSpriteLibrary } = await import("./SpriteLibraryView.js");
            openSpriteLibrary(this.root, (t, i) => this.toast(t, i));
        });
        this.el.saveFileBtn.addEventListener("click", () => { this.closeDrawer(); this.exportProject(); });

        this.el.themeSwitch.querySelectorAll<HTMLElement>("[data-theme-choice]").forEach(b =>
            b.addEventListener("click", () => this.setThemeChoice(<ThemeChoice>b.dataset.themeChoice)));
        this.el.fontSmaller.addEventListener("click", () => this.changeFontSize(-1));
        this.el.fontBigger.addEventListener("click", () => this.changeFontSize(+1));
        this.el.speedSwitch.querySelectorAll<HTMLElement>("[data-speed]").forEach(b =>
            b.addEventListener("click", () => this.setSpeedIndex(parseInt(b.dataset.speed!))));
        this.renderSettings();

        this.watchWindowControls();

        // Breites Layout (iPad quer, Laptop) oder Reiter-Layout (Handy, iPad hoch)
        const mq = matchMedia("(min-width: 900px) and (min-aspect-ratio: 1/1)");
        /*
         * JPadBlox: drei Spalten (Bausteine | Editor | Ansicht rechts).
         *
         * Bausteinleiste: Knopf wechselt nur zwischen schmal (12,5 %) und breit (25 %).
         * Editor: „Vergrößern“ blendet die Ansicht rechts aus, der Editor nimmt ihren Platz ein (die Ansicht vorher
         *   wird gemerkt). Dann stehen dort zwei Knöpfe: „Volle Breite“ (Editor über das ganze Fenster, Ausgabe usw.
         *   als Reiter unten) und „Verkleinern“ (zurück zur gemerkten Ansicht).
         * Ansicht rechts: „Vergrößern“ macht sie doppelt so breit (40 %), die Bausteine schmal, der Editor bekommt
         *   den Rest (die Ansicht vorher wird gemerkt). Dann zwei Knöpfe: „Volle Breite“ (Ansicht rechts über das
         *   ganze Fenster) und „Verkleinern“ (zurück zur gemerkten Ansicht).
         *   Tippt man dabei auf „Vergrößern“ der Bausteine, wird die Ansicht rechts wieder schmal.
         */
        const setBtn = (btn: HTMLElement, iconName: string, label: string, show = true) => {
            btn.innerHTML = icon(iconName);
            btn.setAttribute("aria-label", label);
            btn.title = label;
            btn.dataset.tip = label;
            btn.hidden = !show;
        };
        const applyLayout = () => {
            const v = this.getViewState();
            const m = v.mode;
            const cols =
                m == "editorFull" ? "full" :
                m == "editorWide" ? (v.blocksWide ? "edit-w" : "edit-n") :
                m == "infoWide" ? "info" :
                m == "infoFull" ? "infofull" :
                v.blocksWide ? "blocks" : "default";
            this.root.dataset.wide = String(mq.matches);
            this.root.dataset.cols = cols;
            this.root.dataset.bwide = String(v.blocksWide && m != "infoWide");
            this.root.dataset.layout = mq.matches && m != "editorFull" ? "split" : "tabs";

            setBtn(this.el.blocksLayoutBtn, v.blocksWide ? "shrink" : "expand",
                v.blocksWide ? "Bausteinleiste schmal anzeigen" : "Bausteinleiste breit anzeigen");

            const editorOpen = m == "editorWide" || m == "editorFull";
            setBtn(this.el.layoutBtn, editorOpen ? "shrink" : "expand",
                editorOpen ? "Verkleinern: zurück zur Ansicht von vorher" : "Editor vergrößern (Ansicht rechts ausblenden)");
            setBtn(this.el.editorFullBtn, "fit", "Editor auf volle Fensterbreite", m == "editorWide");

            const infoOpen = m == "infoWide" || m == "infoFull";
            setBtn(this.el.sideLayoutBtn, infoOpen ? "shrink" : "expand",
                infoOpen ? "Verkleinern: zurück zur Ansicht von vorher" : "Ansicht rechts vergrößern");
            setBtn(this.el.sideFullBtn, "fit", "Ansicht rechts auf volle Fensterbreite", m == "infoWide");

            this.setView(this.view);
            this.alignBulbSoon();
        };
        mq.addEventListener("change", applyLayout);
        const layoutButton = (btn: HTMLElement, change: (v: ViewState) => ViewState) => {
            btn.addEventListener("pointerdown", e => e.preventDefault()); // Tastatur offen lassen
            btn.addEventListener("click", () => { this.setViewState(change(this.getViewState())); applyLayout(); });
        };
        const DEFAULT: ViewState = { mode: "normal", blocksWide: false };
        // Bei doppelt breiter Ansicht rechts: Bausteine breit, Ansicht rechts wieder schmal
        layoutButton(this.el.blocksLayoutBtn, v => v.mode == "infoWide"
            ? { mode: "normal", blocksWide: true }
            : { ...v, blocksWide: !v.blocksWide });
        layoutButton(this.el.layoutBtn, v => {
            if (v.mode == "editorWide" || v.mode == "editorFull") return v.before ?? DEFAULT;
            return { mode: "editorWide", blocksWide: v.blocksWide, before: { mode: v.mode, blocksWide: v.blocksWide } };
        });
        layoutButton(this.el.editorFullBtn, v => ({ ...v, mode: "editorFull" }));
        layoutButton(this.el.sideLayoutBtn, v =>
            v.mode == "infoWide" || v.mode == "infoFull"
                ? v.before ?? DEFAULT
                : { mode: "infoWide", blocksWide: false, before: { mode: v.mode, blocksWide: v.blocksWide } });
        layoutButton(this.el.sideFullBtn, v => ({ ...v, mode: "infoFull" }));
        this.applyLayout = applyLayout;
        applyLayout();

        // Glühbirne im Querformat bündig über dem Code-Editor ausrichten
        const ro = new ResizeObserver(() => this.alignBulbSoon());
        ro.observe(this.root.querySelector(".jp-pane-code")!);
        ro.observe(this.root.querySelector(".jp-topbar")!);
    }

    private bulbFrame = 0;
    alignBulbSoon() {
        cancelAnimationFrame(this.bulbFrame);
        this.bulbFrame = requestAnimationFrame(() => this.alignBulb());
    }

    /**
     * Querformat (Code und Ausgabe nebeneinander): Die Bearbeiten-Knöpfe (Kopieren, Rückgängig,
     * Wiederholen, Formatieren, Sichern) stehen rechtsbündig über dem Code-Editor, der Trennstrich rechts
     * daneben genau mittig in der Lücke zur rechten Ansicht, die Glühbirne linksbündig über der rechten Ansicht.
     * Die Ausführen-Knöpfe bleiben am rechten Rand.
     * Sonst (oder wenn der Platz nicht reicht) reihen sie sich einfach links neben der Glühbirne ein.
     */
    private alignBulb() {
        const g = this.el.bulbGroup, bar = g.parentElement!;
        const sep = g.querySelector<HTMLElement>(".jp-topbar-sep")!;
        const reset = () => {
            g.classList.remove("is-aligned");
            g.style.left = "";
            sep.style.marginLeft = sep.style.marginRight = "";
            this.el.bulbBtn.style.marginLeft = "";
        };
        reset();
        if (this.root.dataset.layout != "split" || getComputedStyle(g).display == "none") return;
        const code = this.root.querySelector(".jp-pane-code")!.getBoundingClientRect();
        const side = this.root.querySelector(".jp-pane-side")!.getBoundingClientRect();
        if (code.width == 0 || side.width == 0) return;
        const tools = this.el.editTools.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        const gapMid = (code.right + side.left) / 2;
        sep.style.marginLeft = Math.max(0, gapMid - code.right - 0.5) + "px";
        sep.style.marginRight = "0px";
        this.el.bulbBtn.style.marginLeft = Math.max(0, side.left - gapMid - 0.5) + "px";
        g.classList.add("is-aligned");
        g.style.left = (code.right - tools.width - barRect.left) + "px";
        // Überschneidet sich die Gruppe mit dem Projektnamen oder den Knöpfen rechts davon: normal einreihen
        const gr = g.getBoundingClientRect();
        const proj = this.el.projectBtn.getBoundingClientRect();
        const run = this.el.skinBtn.getBoundingClientRect();
        if (gr.left < proj.right + 4 || gr.right > run.left - 4) reset();
    }

    /**
     * iPadOS 26 blendet bei Apps im Fenstermodus die Fenster-Steuerelemente („Ampel“) oben links
     * über den Inhalt. Web-Apps erfahren davon nichts (safe-area-inset bleibt 0). Deshalb machen
     * wir oben links Platz, wenn JPad als Home-Bildschirm-App in einem Fenster läuft, das kleiner
     * als der Bildschirm ist.
     */
    private watchWindowControls() {
        const isIPad = navigator.maxTouchPoints > 1 && /iPad|Macintosh/.test(navigator.userAgent);
        const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
        const update = () => {
            // Vollbild = Fenstergröße entspricht dem Bildschirm (in einer der beiden Ausrichtungen)
            const big = Math.max(screen.width, screen.height), small = Math.min(screen.width, screen.height);
            const near = (x: number, y: number) => Math.abs(x - y) <= 40;
            const w = window.innerWidth, h = window.innerHeight;
            const fullscreen = (near(w, big) && near(h, small)) || (near(w, small) && near(h, big));
            const isWindowed = !fullscreen;
            document.documentElement.classList.toggle("ipad-window-controls", isIPad && standalone && isWindowed);
        };
        update();
        window.addEventListener("resize", update);
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

        // Fehlermarkierungen werden erst NACH dem Kompilieren gesetzt. Deshalb auch die
        // Fehleranzahl in den Dateireitern hier aktualisieren (nicht nur bei „kompiliert“),
        // sonst zeigen die Reiter den Stand des vorherigen Durchlaufs.
        let markerTimer: any;
        monaco.editor.onDidChangeMarkers(() => {
            this.editor.updateDiagnostics();
            clearTimeout(markerTimer);
            markerTimer = setTimeout(() => {
                this.renderProblems();
                this.renderFileTabs();
            }, 30);
        });

        // Programmzeiger und Exception-Markierung aus dem (unsichtbaren) Monaco-Editor übernehmen
        this.main.getMainEditor().onDidChangeModelDecorations(() => this.updateProgramPointer());
    }

    /** Die Variablenanzeige (Debugger) der Online-IDE in die Fläche „Variablen“ umziehen. */
    private setupVariablesView() {
        const host = this.el.variables;
        new ThemeManager(<HTMLDivElement>host).switchTheme(this.effectiveTheme());
        const dbg = this.main.$debuggerDiv?.[0];
        const alt = this.main.$alternativeDebuggerDiv?.[0];
        if (alt) {
            alt.innerHTML = `<div class="jp-empty">${icon("variables")}
                <p>Hier siehst du die Variablen und ihre Werte, während dein Programm Schritt für Schritt läuft.</p>
                <p class="jp-hint">Tippe oben auf „Schritt“. Jeder weitere Tipp führt die nächste Zeile aus;
                die aktuelle Zeile ist im Code gelb markiert.</p></div>`;
            host.appendChild(alt);
        }
        if (dbg) host.appendChild(dbg);
    }

    private updateProgramPointer() {
        const model = this.main.getMainEditor().getModel();
        if (!model || !this.editor || model != this.editor.getFile()?.getMonacoModel()) {
            this.editor?.setLineMarks([]);
            return;
        }
        const marks: { line: number, kind: "pointer" | "exception" }[] = [];
        const breakpoints: { line: number, active: boolean }[] = [];
        for (const d of model.getAllDecorations()) {
            const cls = d.options.className || "";
            const margin = d.options.marginClassName || "";
            if (cls.indexOf("jo_revealProgramPointer") >= 0) marks.push({ line: d.range.startLineNumber, kind: "pointer" });
            else if (cls.indexOf("jo_revealExceptionPosition") >= 0) marks.push({ line: d.range.startLineNumber, kind: "exception" });
            if (margin == "jo_margin_breakpoint" || margin == "jo_margin_breakpoint_inactive") {
                breakpoints.push({ line: d.range.startLineNumber, active: margin == "jo_margin_breakpoint" });
            }
        }
        this.editor.setLineMarks(marks);
        this.editor.setBreakpoints(breakpoints);
    }

    /**
     * Haltepunkte verwaltet der BreakpointManager der Online-IDE (als Markierungen im Monaco-Modell).
     * Läuft das Programm bis zu einer solchen Zeile, hält der Interpreter vor ihr an – wie beim
     * schrittweisen Ausführen.
     */
    toggleBreakpoint(line: number) {
        const bm = this.main.getInterpreter().breakpointManager;
        if (!bm) return;
        const file = this.editor.getFile();
        if (file && this.main.getActiveFile() != file) this.main.setFileActive(file);
        bm.toggleBreakpoint(line);
        this.updateProgramPointer();
        const isSet = this.hasBreakpointAt(line);
        this.toast(isSet ? `Haltepunkt in Zeile ${line} gesetzt. Das Programm hält vor dieser Zeile an.` : `Haltepunkt in Zeile ${line} entfernt.`, "breakpoint");
    }

    private hasBreakpointAt(line: number): boolean {
        const model = this.main.getMainEditor().getModel();
        return !!model?.getAllDecorations().some(d => (d.options.marginClassName || "").startsWith("jo_margin_breakpoint") && d.range.startLineNumber == line);
    }

    private onCompiled() {
        this.diagram?.onCompiled();
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

        // Einzelschritt: bewusst KEIN Wechsel zur Code-Ansicht – in der Reiter-Ansicht (iPad hoch, iPhone)
        // soll man Schritt für Schritt Variablen, Diagramm oder Ausgabe verfolgen können
        this.el.stepInto.addEventListener("pointerdown", () => {
            if (!this.el.stepInto.classList.contains("jo_active")) {
                if (this.errorCount > 0) {
                    this.toast("Das Programm enthält noch Fehler.", "problems");
                    this.setView("problems");
                }
                return;
            }
            this.main.flush();
            if (this.root.dataset.layout != "tabs" && this.sideView == "problems") this.setSideView("variables");
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

        this.main.getInterpreter().eventManager.on("stateChanged", (old: SchedulerState, state: SchedulerState) => {
            this.root.dataset.runstate = SchedulerState[state];
            // An einem Haltepunkt angehalten: bewusst kein Wechsel zur Code-Ansicht (s. o.)
            void old;
        });
        this.root.dataset.runstate = "stopped";
    }

    // =====================================================================
    // Ansichten
    // =====================================================================

    setView(view: View) {
        this.view = view;
        if (view != "code") this.sideView = view;
        this.root.dataset.view = view;
        this.root.dataset.side = this.sideView;
        const diagramVisible = this.sideView == "diagram" &&
            (this.root.dataset.layout == "split" ? !/^edit-/.test(this.root.dataset.cols ?? "") : view == "diagram");
        this.diagram?.setVisible(diagramVisible);
        this.root.querySelectorAll<HTMLElement>(".jp-bottomnav [data-view]").forEach(b =>
            b.setAttribute("aria-current", String(b.dataset.view == view)));
        this.root.querySelectorAll<HTMLElement>(".jp-side-switch [data-side]").forEach(b =>
            b.setAttribute("aria-selected", String(b.dataset.side == this.sideView)));
        if (view != "code") this.editor?.view.contentDOM.blur();
        // Grafikbereich der Online-IDE über Größenänderung informieren
        setTimeout(() => jQuery('.jo_graphics').trigger('sizeChanged'), 50);
    }

    setSideView(side: SideView) {
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
        return monaco.editor.getModelMarkers({ resource: model.uri }).filter(m => m.severity >= monaco.MarkerSeverity.Error && !isHelperMarker(m));
    }

    renderFileTabs() {
        const container = this.el.fileTabs;
        if (!this.main) return;
        const active = this.main.getActiveFile();
        container.innerHTML = "";
        for (const file of this.main.getFiles()) {
            const errors = this.errorsOf(file).length;
            const b = document.createElement("button");
            const fileName = file.name.replace(/\.java$/, "");
            b.dataset.tip = file == active ? `Datei „${fileName}“ – antippen für Umbenennen, Formatieren, Löschen` : `Datei „${fileName}“ öffnen`;
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
        container.querySelector(".is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    private validateClassName(name: string, except?: GUIFile): string | null {
        if (!/^[A-Za-zÄÖÜäöü_][A-Za-z0-9ÄÖÜäöüß_]*$/.test(name)) {
            return "Ein Dateiname beginnt mit einem Buchstaben und enthält nur Buchstaben, Ziffern und _ (keine Leerzeichen).";
        }
        if (this.main.getFiles().some(f => f != except && f.name.toLowerCase() == (name + ".java").toLowerCase())) {
            return `Es gibt schon eine Datei „${name}“.`;
        }
        return null;
    }

    /** Legt eine neue Datei mit dem Text aus der Zwischenablage an. */
    async pasteAsNewFile() {
        const ok = await this.dialogs.confirm({
            title: "Kopierten Text der Zwischenablage in neue Datei einsetzen?",
            text: "JPad legt eine neue Datei an und setzt dort den Text ein, der gerade in der Zwischenablage liegt.",
            confirm: "Einsetzen"
        });
        if (!ok) return;
        let text: string | null = null;
        try {
            text = await navigator.clipboard.readText();
        } catch (e) {
            // Browser erlaubt kein direktes Lesen: Text von Hand in ein Feld einsetzen lassen
            text = await this.dialogs.pasteArea({
                title: "Text hier einsetzen",
                text: "JPad darf die Zwischenablage nicht direkt lesen. Halte den Finger in das Feld und wähle „Einsetzen“.",
                confirm: "Einsetzen"
            });
        }
        if (text == null) return;
        text = text.replace(/\r\n?/g, "\n");
        if (text.trim().length == 0) {
            this.toast("Die Zwischenablage ist leer. Kopiere zuerst Code, zum Beispiel aus einem Lernkurs.", "info", 5000);
            return;
        }
        const name = this.nameForPastedCode(text);
        const file = this.main.createFile(name + ".java", text.endsWith("\n") ? text : text + "\n");
        this.main.setFileActive(file);
        this.setView("code");
        this.toast(`Neue Datei „${name}“ mit dem Text aus der Zwischenablage angelegt.`, "pastePlus", 4000);
    }

    /** Name der neuen Datei: erste Klasse im eingefügten Text, sonst „Eingefuegt“; bei Bedarf mit Nummer. */
    private nameForPastedCode(text: string): string {
        const m = text.match(/\b(?:class|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        const base = m ? m[1] : "Eingefuegt";
        if (!this.validateClassName(base)) return base;
        let i = 2;
        while (this.validateClassName(base + i)) i++;
        return base + i;
    }

    /** Neue, leere Datei (ohne Klassengerüst). */
    async newFile() {
        const name = await this.dialogs.prompt({
            title: "Neue Datei",
            label: "Wie soll Deine Datei heißen?",
            placeholder: "z. B. Auto",
            confirm: "Anlegen",
            validate: (v) => this.validateClassName(v.trim()),
            capitalize: true
        });
        if (!name) return;
        const n = name.trim();
        const file = this.main.createFile(n + ".java", "");
        this.main.setFileActive(file);
        this.setView("code");
        setTimeout(() => { this.editor.revealLine(1, 1, true); this.editor.focus(); }, 50);
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

    /** JPadBlox: Namen aller Klassen, Interfaces und Enums des geöffneten Projekts */
    projectTypes(): string[] {
        const names = new Set<string>();
        for (const file of this.main.getFiles()) {
            const text = file.getMonacoModel()?.getValue() ?? "";
            const re = /\b(?:class|interface|enum)\s+([A-Za-z_\u00C0-\u024F][\w\u00C0-\u024F]*)/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(text))) names.add(m[1]);
        }
        return [...names].sort((a, b) => a.localeCompare(b, "de"));
    }

    /**
     * JPadBlox: Nach jedem Baustein formatieren. Die Änderungen gehen direkt in den Editor (statt
     * über das Modell), damit Cursor und Platzhalter an ihrer Stelle bleiben.
     */
    async formatAfterBlock() {
        try {
            const r = await this.bridge.formatChanges();
            const view = this.editor.view;
            if (!r || view.state.doc.toString() != r.text) return;   // inzwischen weitergetippt
            // Der Formatierer hängt manchmal Leerzeichen ans Zeilenende (z. B. hinter „;“ am Dateiende) – weglassen
            const changes = r.changes.filter(c => !(c.from == c.to && /^[ \t]+$/.test(c.insert) &&
                (c.to == r.text.length || r.text[c.to] == "\n")));
            if (changes.length) view.dispatch({ changes, userEvent: "input.format" });
        } catch (e) {
            console.warn("JPadBlox: Formatieren nach Baustein fehlgeschlagen", e);
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
                if (m.severity < monaco.MarkerSeverity.Warning || isHelperMarker(m)) continue;
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
            b.dataset.tip = "Antippen, um zu dieser Stelle im Code zu springen";
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
        this.alignBulbSoon();
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
                <button class="jp-projectitem-open" data-tip="${isCurrent ? "Geöffnetes Projekt" : `Projekt „${escapeHtml(p.name)}“ öffnen`}">${icon(isCurrent ? "check" : "folder")}
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

    // =====================================================================
    // Lernpfad
    // =====================================================================

    /**
     * Zeigt den eingebetteten Lernpfad im Reiter „Lernpfad“ an (oder blendet den Reiter aus).
     * Der Lernpfad läuft in einem abgeschotteten iframe: Skripte und Links funktionieren,
     * Zugriff auf JPad und die gespeicherten Projekte hat er nicht.
     */
    showLernpfad(html: string | null) {
        this.lernpfadHtml = html;
        const host = this.el.lernpfad;
        host.innerHTML = "";
        if (html) {
            this.root.dataset.lernpfad = "1";
            const frame = document.createElement("iframe");
            frame.className = "jp-lernpfad-frame";
            frame.title = "Lernpfad";
            frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals");
            frame.setAttribute("referrerpolicy", "no-referrer");
            // Kopieren-Knöpfe im Lernpfad sollen Code in die Zwischenablage legen dürfen
            frame.setAttribute("allow", "clipboard-write; fullscreen");
            frame.srcdoc = this.withStorageShim(html);
            host.appendChild(frame);
        } else {
            delete this.root.dataset.lernpfad;
            if (this.sideView == "lernpfad") {
                this.sideView = "output";
                this.setView(this.view == "lernpfad" ? "output" : this.view);
            }
        }
    }

    /**
     * Link mit Lernpfad oder Projekt: jpad…/?lernpfad=<Adresse> bzw. ?projekt=<Adresse>
     * (beides kombinierbar, Adressen auch relativ zu JPad). Beim ersten Aufruf entsteht ein neues
     * Projekt; ruft man denselben Link erneut auf, öffnet sich dieses Projekt mit dem Stand des Schülers.
     * Danach verschwindet der Parameter aus der Adresszeile, damit Neuladen nichts doppelt anlegt.
     */
    private async openFromLink(): Promise<{ error?: string, info?: string } | undefined> {
        const params = new URLSearchParams(location.search);
        const raw = { projekt: params.get("projekt"), lernpfad: params.get("lernpfad") };
        if (!raw.projekt && !raw.lernpfad) return undefined;
        const clean = () => {
            params.delete("projekt");
            params.delete("lernpfad");
            const q = params.toString();
            try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash); } catch (e) { }
        };
        try {
            const abs = (u: string | null) => u ? new URL(u.trim(), location.href).href : null;
            const projekt = abs(raw.projekt), lernpfad = abs(raw.lernpfad);
            const source = [projekt, lernpfad].filter(s => s).join(" + ");
            const existing = this.store.list().find(p => p.source == source);
            if (existing) {
                this.store.setCurrentId(existing.id);
                clean();
                return { info: `„${existing.name}“ geöffnet – mit deinem bisherigen Stand.` };
            }
            const boot = this.root.querySelector(".jp-boot");
            if (boot) boot.textContent = "Lernpfad wird geladen …";
            const { loadLinkedProject } = await import("./Lernpfad.js");
            const linked = await loadLinkedProject(projekt, lernpfad);
            const p = this.store.createInfo(linked.name);
            this.store.update(p.id, { source });
            await this.store.writeFiles(p.id, linked.files.length > 0 ? linked.files : STARTER_FILES);
            if (linked.spritesheetBase64) {
                try { await this.store.writeSpritesheet(p.id, base64ToBytes(linked.spritesheetBase64)); }
                catch (e) { console.error("Spritesheet der Projektdatei ist beschädigt", e); }
            }
            if (linked.lernpfadHtml) await this.store.writeLernpfad(p.id, linked.lernpfadHtml);
            this.store.setCurrentId(p.id);
            clean();
            return { info: `„${p.name}“ geöffnet.` + (linked.note ? " " + linked.note : "") };
        } catch (e: any) {
            clean();
            return { error: e?.message || String(e) };
        }
    }

    /**
     * Startansicht bei Projekten mit Lernpfad: Bausteine schmal, Ansicht rechts breit (nicht volle Breite).
     * „Verkleinern“ führt zurück zur Ansicht von vorher.
     */
    private showLernpfadLayout() {
        const v = this.getViewState();
        if (v.mode == "infoWide" && !v.blocksWide) return;
        const before = v.mode == "infoWide" || v.mode == "infoFull" ? v.before : { mode: v.mode, blocksWide: v.blocksWide };
        this.setViewState({ mode: "infoWide", blocksWide: false, before: before ?? { mode: "normal", blocksWide: false } });
        this.applyLayout();
    }

    private lernpfadStateKey() {
        return "jpad.lernpfad." + this.project.id;
    }

    /**
     * Im abgeschotteten iframe ist localStorage gesperrt. Damit z. B. der Fortschritt des
     * Lernpfads erhalten bleibt, bekommt die Seite einen Ersatz, der seine Daten per
     * postMessage an JPad schickt (gespeichert je Projekt).
     */
    private withStorageShim(html: string): string {
        let state = "{}";
        try { state = localStorage.getItem(this.lernpfadStateKey()) || "{}"; } catch (e) { }
        if (!this.lernpfadMessageHandler) {
            this.lernpfadMessageHandler = (ev: MessageEvent) => {
                const frame = this.el.lernpfad.querySelector("iframe");
                if (!frame || ev.source != frame.contentWindow || ev.data?.type != "jpad-lernpfad-storage") return;
                try { localStorage.setItem(this.lernpfadStateKey(), JSON.stringify(ev.data.state)); } catch (e) { }
            };
            window.addEventListener("message", this.lernpfadMessageHandler);
        }
        const shim = `<script>(function(){var ok=false;try{ok=!!window.localStorage;}catch(e){}if(ok)return;`
            + `var d=${state.replace(/</g, "\\u003c")};function save(){parent.postMessage({type:"jpad-lernpfad-storage",state:d},"*");}`
            + `var s={getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null;},`
            + `setItem:function(k,v){d[String(k)]=String(v);save();},removeItem:function(k){delete d[String(k)];save();},`
            + `clear:function(){d={};save();},key:function(i){return Object.keys(d)[i]||null;}};`
            + `Object.defineProperty(s,"length",{get:function(){return Object.keys(d).length;}});`
            + `try{Object.defineProperty(window,"localStorage",{value:s,configurable:true});}catch(e){}})();<\/script>`;
        // möglichst früh einfügen, damit die Skripte des Lernpfads den Ersatz schon vorfinden
        const m = html.match(/<head[^>]*>/i) || html.match(/<html[^>]*>/i);
        return m ? html.replace(m[0], m[0] + shim) : shim + html;
    }

    async embedLernpfad(file: File) {
        try {
            const { readLernpfadFile } = await import("./Lernpfad.js");
            const html = await readLernpfadFile(file);
            if (this.lernpfadHtml && !await this.dialogs.confirm({
                title: "Lernpfad ersetzen?",
                text: "Dieses Projekt hat schon einen Lernpfad. Er wird durch die neue Datei ersetzt.",
                confirm: "Ersetzen"
            })) return;
            await this.store.writeLernpfad(this.project.id, html);
            this.showLernpfad(html);
            this.markModified();
            this.closeDrawer();
            this.setSideView("lernpfad");
            this.showLernpfadLayout();
            this.toast(`Lernpfad „${file.name}“ eingebettet. Er wird mit dem Projekt als Datei gesichert.`, "check", 4000);
        } catch (e: any) {
            this.dialogs.alert({ title: "Lernpfad lässt sich nicht einbetten", text: e?.message || String(e) });
        }
    }

    async removeLernpfad() {
        const ok = await this.dialogs.confirm({
            title: "Lernpfad entfernen?",
            text: "Der Lernpfad wird aus diesem Projekt entfernt. Der Code bleibt erhalten.",
            confirm: "Entfernen"
        });
        if (!ok) return;
        await this.store.writeLernpfad(this.project.id, null);
        this.showLernpfad(null);
        this.markModified();
        this.renderSettings();
        this.toast("Lernpfad entfernt.", "check");
    }

    /**
     * Meldet die eigenen Sprites des Projekts bei Compiler und Grafik an (Code von Martin Pabst)
     * und kompiliert neu, damit SpriteLibrary.<Name> sofort bekannt ist.
     */
    async applyUserSprites(zip: Uint8Array | null) {
        try {
            await new SpritesheetData().initializeSpritesheetForWorkspace(this.main.getCurrentWorkspace(), this.main, zip ?? undefined);
        } catch (e) {
            console.error("Eigene Sprites konnten nicht geladen werden", e);
        }
        this.main.getCompiler()?.triggerCompile();
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
        try {
            const zip = await this.store.readSpritesheet(this.project.id);
            if (zip) exported.spritesheetBase64 = bytesToBase64(zip);
        } catch (e) { console.error(e); }
        if (this.lernpfadHtml) (exported as any).lernpfadHtml = this.lernpfadHtml;
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
            const { name, files, spritesheetBase64, lernpfadHtml } = ProjectStore.parseImport(text, file.name);
            const p = this.store.createInfo(name);
            p.exported = p.modified;
            this.store.update(p.id, { exported: p.modified });
            await this.store.writeFiles(p.id, files);
            if (spritesheetBase64) {
                try { await this.store.writeSpritesheet(p.id, base64ToBytes(spritesheetBase64)); }
                catch (e) { console.error("Spritesheet der Projektdatei ist beschädigt", e); }
            }
            if (lernpfadHtml) await this.store.writeLernpfad(p.id, lernpfadHtml);
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

    /** Spaltenaufteilung im Querformat (siehe applyLayout), im Browser gemerkt */
    getViewState(): ViewState {
        try {
            const v = JSON.parse(localStorage.getItem("jpadblox.view") || "null");
            const modes = ["normal", "editorWide", "editorFull", "infoWide", "infoFull"];
            if (v && modes.includes(v.mode)) return { mode: v.mode, blocksWide: !!v.blocksWide, before: v.before };
        } catch (e) { }
        return { mode: "normal", blocksWide: false };
    }

    setViewState(v: ViewState) {
        try { localStorage.setItem("jpadblox.view", JSON.stringify(v)); } catch (e) { }
    }

    getThemeChoice(): ThemeChoice {
        try { return <ThemeChoice>(localStorage.getItem("jpad.theme") || "auto"); } catch (e) { return "auto"; }
    }

    // ----- Spaß-Themes: Standard → Bonbon (Einhorn) → Hacker → Standard -----

    getSkin(): Skin {
        try {
            const s = localStorage.getItem("jpadblox.skin");
            return s == "candy" || s == "hacker" ? s : "default";
        } catch (e) { return "default"; }
    }

    nextSkin() {
        const order: Skin[] = ["default", "candy", "hacker"];
        const next = order[(order.indexOf(this.getSkin()) + 1) % order.length];
        try { localStorage.setItem("jpadblox.skin", next); } catch (e) { }
        this.applyTheme(this.getThemeChoice());
        this.renderSkinButton();
        this.alignBulbSoon();
    }

    /** Das Symbol zeigt, was beim nächsten Tippen kommt. */
    renderSkinButton() {
        const btn = this.el.skinBtn;
        if (!btn) return;
        const s = this.getSkin();
        const [iconName, label] =
            s == "default" ? ["unicorn", "Bonbon-Theme: rosa und himmelblau"] :
            s == "candy" ? ["hacker", "Hacker-Theme: dunkel, Neon, spitze Ecken"] :
            ["skinReset", "Zurück zum normalen Aussehen"];
        btn.innerHTML = icon(iconName);
        btn.setAttribute("aria-label", label);
        btn.title = label;
        btn.dataset.tip = label;
    }

    effectiveTheme(): "light" | "dark" {
        const skin = this.getSkin();
        if (skin == "candy") return "light";
        if (skin == "hacker") return "dark";
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
        const skin = this.getSkin();
        if (skin == "default") delete document.documentElement.dataset.skin;
        else {
            document.documentElement.dataset.skin = skin;
            loadSkinFonts();
        }
        const eff = this.effectiveTheme();
        document.documentElement.dataset.effective = eff;
        const ide = this.root.querySelector<HTMLDivElement>(".jp-ide");
        if (ide) new ThemeManager(ide).switchTheme(eff);
        if (this.el.variables) new ThemeManager(<HTMLDivElement>this.el.variables).switchTheme(eff);
        const meta = document.querySelectorAll('meta[name="theme-color"]');
        meta.forEach(m => m.setAttribute("content", skin == "candy" ? "#FFE3F1" : skin == "hacker" ? "#020604" : eff == "dark" ? "#151922" : "#F3F5F9"));
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
        this.el.lernpfadRemoveBtn.hidden = !this.lernpfadHtml;
        this.el.lernpfadAddBtn.querySelector("span")!.textContent = this.lernpfadHtml ? "Lernpfad ersetzen" : "Lernpfad einbetten";
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
    /**
     * Kopiert den Quelltext in die Zwischenablage – alle Dateien nacheinander
     * (Reihenfolge wie die Reiter) oder nur die geöffnete Datei.
     */
    async copyCode(all: boolean) {
        this.main.flush();
        const files = all ? this.main.getFiles() : [this.main.getActiveFile()].filter(f => f != null) as GUIFile[];
        if (files.length == 0) return;
        const text = files.map(f => f.getText().replace(/\s+$/, "")).join("\n\n") + "\n";
        const ok = await copyToClipboard(text);
        const hint = "Füge den Code woanders wieder ein (z.B. bei einer Abgabe in einem Lernkurs).";
        if (!ok) {
            this.toast("Kopieren hat nicht geklappt. Markiere den Code im Editor und kopiere ihn von Hand.", "info", 5000);
        } else if (all) {
            this.toast("Code aller Dateien in die Zwischenablage kopiert. " + hint, "copyAll", 5000);
        } else {
            this.toast(`Code der Datei „${files[0].name.replace(/\.java$/, "")}“ in die Zwischenablage kopiert. ` + hint, "copyFile", 5000);
        }
    }

    toast(text: string, iconName: string = "info", duration: number = 3200) {
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
        this.toastTimer = setTimeout(() => t!.classList.remove("is-visible"), duration);
    }
}

/** Zwischenablage mit Rückfall für ältere Browser (z. B. ohne Clipboard-API im http-Betrieb). */
async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) { /* weiter mit dem Rückfall */ }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.fontSize = "16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { }
    ta.remove();
    return ok;
}
