import jQuery from "jquery";
import { MainEmbedded } from "../client/embedded/MainEmbedded.js";
import { GUIFile } from "../client/workspace/File.js";
import { CompilerFile } from "../compiler/common/module/CompilerFile.js";
import { IPosition } from "../compiler/common/range/Position.js";
import { IRange, Range } from "../compiler/common/range/Range.js";
import { Executable } from "../compiler/common/Executable.js";
import type { JOScript } from "../client/embedded/EmbeddedStarter.js";

/**
 * Die IDE-Logik von JPad.
 *
 * Wir erben von MainEmbedded (Embedded-IDE von Martin Pabst) und übernehmen damit
 * Compiler, Interpreter, Ausgabe, Grafik und das automatische Speichern in der IndexedDB
 * unverändert. Der Monaco-Editor läuft weiterhin, ist aber unsichtbar: Der Compiler
 * und seine Sprachdienste arbeiten mit Monaco-Modellen. Sichtbar ist der Touch-Editor
 * (CodeMirror), der mit diesen Modellen synchron gehalten wird.
 */
export class JPadMain extends MainEmbedded {

    onActiveFileChanged: ((file: GUIFile) => void) | undefined;
    onShowPosition: ((file: GUIFile, position: IPosition, setCursor: boolean) => void) | undefined;
    onCompiled: (() => void) | undefined;
    onFilesChanged: (() => void) | undefined;

    constructor($outerDiv: JQuery<HTMLElement>, scriptId: string) {
        $outerDiv.attr("data-java-online", JSON.stringify({
            id: scriptId,
            withFileList: false,
            withBottomPanel: false,
            withClassDiagram: false,
            withConsole: false,
            withPCode: false,
            withErrorList: false,
            speed: "max",
            libraries: [],
            cacheUserEdits: true,
            settings: {
                // Die Online-IDE ergänzt fehlende Semikolons automatisch in allen Zeilen außer der
                // Cursorzeile von Monaco. Da Monaco in JPad unsichtbar ist und seinen Cursor nicht
                // mitbewegt, kämen die Semikolons sofort beim Tippen – oft an falscher Stelle.
                // Außerdem sollen Schüler das Semikolon selbst setzen.
                "editor.autoSemicolons": false
            }
        }).split('"').join("'"));
        super($outerDiv);
    }

    async init(scriptList: JOScript[]) {
        await super.init(scriptList);
        // Vom Code-Reset-Knopf der Embedded-IDE brauchen wir nichts.
        this.$resetButton?.remove();
        this.onFilesChanged?.();
    }

    getActiveFile(): GUIFile | undefined {
        return this.lastActiveFile;
    }

    setFileActive(file: GUIFile) {
        if (!file) return;
        super.setFileActive(file);
        this.onActiveFileChanged?.(file);
    }

    // Embedded-IDE: Code-Reset-Knopf. In JPad gibt es keinen „Ausgangszustand“.
    considerShowingCodeResetButton() { }
    showResetButton() { }

    showFile(file?: CompilerFile): void {
        if (!file || !(file instanceof GUIFile)) return;
        if (file != this.lastActiveFile) this.setFileActive(file);
    }

    showProgramPosition(file?: CompilerFile, positionOrRange?: IPosition | IRange, setCursor: boolean = true) {
        this.showFile(file);
        if (!positionOrRange) return;
        if (positionOrRange["startLineNumber"]) positionOrRange = Range.getStartPosition(<IRange>positionOrRange);
        const target = <GUIFile>(file || this.lastActiveFile);
        if (target) this.onShowPosition?.(target, <IPosition>positionOrRange, setCursor);
        // Bewusst KEIN Fokus auf den (unsichtbaren) Monaco-Editor: Auf dem iPad würde
        // sonst die Bildschirmtastatur aufgehen.
    }

    markFilesAsStartable(files: GUIFile[], active: boolean) { }

    onCompilationFinished(executable: Executable | undefined): void {
        this.interpreter.setExecutable(executable);
        this.onCompiled?.();
    }

    drawClassDiagrams(onlyUpdateIdentifiers: boolean) { }

    hideDebugger() { }
    showDebugger() { }

    adjustWidthToWorld(): void { }

    // ---------- Dateiverwaltung für die JPad-Oberfläche ----------

    getFiles(): GUIFile[] {
        return <GUIFile[]>this.currentWorkspace?.getFiles() || [];
    }

    createFile(name: string, text: string): GUIFile {
        const file = this.addFile({ title: name, text: text });
        file.setSaved(false);
        this.getCompiler().setFiles(this.getFiles());
        this.getCompiler().triggerCompile();
        this.saveScripts();
        this.onFilesChanged?.();
        return file;
    }

    deleteFile(file: GUIFile) {
        const files = this.getFiles();
        const index = files.indexOf(file);
        this.removeFile(file);
        if (this.lastActiveFile == file) this.lastActiveFile = undefined;
        this.getCompiler().setFiles(this.getFiles());
        const remaining = this.getFiles();
        remaining.forEach(f => f.setSaved(false)); // erzwingt Neuschreiben der Dateiliste
        this.saveScripts();
        if (remaining.length > 0) {
            this.setFileActive(remaining[Math.min(index, remaining.length - 1)]);
        }
        this.onFilesChanged?.();
    }

    renameFile(file: GUIFile, newName: string) {
        file.name = newName;
        this.getFiles().forEach(f => f.setSaved(false));
        this.saveScripts();
        this.getCompiler().triggerCompile();
        this.onFilesChanged?.();
    }

    /** Schreibt ausstehende Änderungen sofort in die IndexedDB. */
    flush() {
        try { this.saveScripts(); } catch (e) { console.error(e); }
    }

    getOuterElement(): HTMLElement {
        return jQuery(".joe_javaOnlineDiv")[0];
    }
}
