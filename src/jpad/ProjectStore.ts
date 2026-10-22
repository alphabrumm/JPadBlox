/**
 * Verwaltung der Projekte von JPad.
 *
 * - Die Projektliste (Name, Zeitstempel) liegt im localStorage.
 * - Der Quelltext liegt in derselben IndexedDB ("LearnJ" / "scripts"), die auch die
 *   Embedded-IDE von Martin Pabst verwendet. Pro Projekt gibt es einen Eintrag
 *   <scriptId> mit der Liste der Dateinamen und je Datei einen Eintrag <scriptId><Dateiname>.
 *   Dadurch übernimmt MainEmbedded das automatische Speichern unverändert.
 * - Exportiert wird im JSON-Format der Online-IDE (ExportedWorkspace). Solche Dateien
 *   lassen sich auch in der Online-IDE (online-ide.de) importieren und umgekehrt.
 */

import type { ExportedWorkspace } from "../client/workspace/WorkspaceImporterExporter.js";

export type ProjectInfo = {
    id: string;
    name: string;
    created: number;
    modified: number;
    /** Zeitpunkt des letzten Sicherns als Datei (0 = noch nie) */
    exported: number;
    /** Projekt kam über einen Link (?projekt=…/?lernpfad=…): derselbe Link öffnet es wieder */
    source?: string;
};

export type ProjectFile = { name: string, text: string };

const LIST_KEY = "jpad.projects";
const CURRENT_KEY = "jpad.current";

function lsGet(key: string): string | null {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function lsSet(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch (e) { /* privater Modus o. ä. */ }
}

/** Neue Projekte starten mit einer leeren Datei. */
export const STARTER_FILES: ProjectFile[] = [{
    name: "Hauptprogramm.java",
    text: ""
}];

export class ProjectStore {

    private db: IDBDatabase | undefined;

    async open(): Promise<void> {
        if (this.db) return;
        this.db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("LearnJ", 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore("scripts", { keyPath: "scriptId", autoIncrement: false });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ---------- Projektliste ----------

    list(): ProjectInfo[] {
        try {
            const list = JSON.parse(lsGet(LIST_KEY) || "[]") as ProjectInfo[];
            return list.sort((a, b) => b.modified - a.modified);
        } catch (e) {
            return [];
        }
    }

    private saveList(list: ProjectInfo[]) {
        lsSet(LIST_KEY, JSON.stringify(list));
    }

    get(id: string): ProjectInfo | undefined {
        return this.list().find(p => p.id == id);
    }

    update(id: string, changes: Partial<ProjectInfo>) {
        const list = this.list();
        const p = list.find(p => p.id == id);
        if (!p) return;
        Object.assign(p, changes);
        this.saveList(list);
    }

    getCurrentId(): string | null {
        return lsGet(CURRENT_KEY);
    }

    setCurrentId(id: string) {
        lsSet(CURRENT_KEY, id);
    }

    /** Liefert das aktuelle Projekt; legt beim allerersten Start eines an. */
    ensureCurrent(): ProjectInfo {
        let current = this.getCurrentId();
        let p = current ? this.get(current) : undefined;
        if (!p) {
            p = this.list()[0];
        }
        if (!p) {
            p = this.createInfo("Mein erstes Projekt");
        }
        this.setCurrentId(p.id);
        return p;
    }

    createInfo(name: string): ProjectInfo {
        const now = Date.now();
        const p: ProjectInfo = {
            id: now.toString(36) + Math.random().toString(36).substring(2, 6),
            name: this.uniqueName(name),
            created: now,
            modified: now,
            exported: 0
        };
        const list = this.list();
        list.push(p);
        this.saveList(list);
        return p;
    }

    uniqueName(name: string, exceptId?: string): string {
        const names = new Set(this.list().filter(p => p.id != exceptId).map(p => p.name));
        if (!names.has(name)) return name;
        let i = 2;
        while (names.has(`${name} (${i})`)) i++;
        return `${name} (${i})`;
    }

    static scriptIdFor(projectId: string) {
        return "jpad-" + projectId;
    }

    // ---------- Dateien in der IndexedDB ----------

    private request<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction("scripts", mode);
            const r = fn(tx.objectStore("scripts"));
            tx.oncomplete = () => resolve(r ? r.result : undefined);
            tx.onerror = () => reject(tx.error);
        });
    }

    async readFiles(projectId: string): Promise<ProjectFile[] | null> {
        await this.open();
        const sid = ProjectStore.scriptIdFor(projectId);
        const listEntry: any = await this.request("readonly", s => s.get(sid));
        if (!listEntry) return null;
        const names: string[] = JSON.parse(listEntry.script);
        const files: ProjectFile[] = [];
        for (const name of names) {
            const entry: any = await this.request("readonly", s => s.get(sid + name));
            if (entry) files.push({ name, text: entry.script });
        }
        return files;
    }

    async writeFiles(projectId: string, files: ProjectFile[]): Promise<void> {
        await this.open();
        const sid = ProjectStore.scriptIdFor(projectId);
        await this.request("readwrite", s => {
            for (const f of files) s.put({ scriptId: sid + f.name, script: f.text });
            s.put({ scriptId: sid, script: JSON.stringify(files.map(f => f.name)) });
        });
    }

    // ---------- Eigene Sprites (Zip im Format der Online-IDE) ----------

    async readSpritesheet(projectId: string): Promise<Uint8Array | null> {
        await this.open();
        const entry: any = await this.request("readonly", s => s.get(ProjectStore.scriptIdFor(projectId) + "-spritesheet"));
        return entry?.zip instanceof Uint8Array ? entry.zip : null;
    }

    async writeSpritesheet(projectId: string, zip: Uint8Array | null): Promise<void> {
        await this.open();
        const key = ProjectStore.scriptIdFor(projectId) + "-spritesheet";
        await this.request("readwrite", s => zip ? s.put({ scriptId: key, zip }) : s.delete(key));
    }

    // ---------- Eingebetteter Lernpfad (HTML) ----------

    async readLernpfad(projectId: string): Promise<string | null> {
        await this.open();
        const entry: any = await this.request("readonly", s => s.get(ProjectStore.scriptIdFor(projectId) + "-lernpfad"));
        return typeof entry?.html == "string" && entry.html.length > 0 ? entry.html : null;
    }

    async writeLernpfad(projectId: string, html: string | null): Promise<void> {
        await this.open();
        const key = ProjectStore.scriptIdFor(projectId) + "-lernpfad";
        await this.request("readwrite", s => html ? s.put({ scriptId: key, html }) : s.delete(key));
    }

    async deleteProject(projectId: string): Promise<void> {
        await this.open();
        const files = await this.readFiles(projectId);
        const sid = ProjectStore.scriptIdFor(projectId);
        await this.request("readwrite", s => {
            for (const f of files || []) s.delete(sid + f.name);
            s.delete(sid);
            s.delete(sid + "-classDiagram");
            s.delete(sid + "-spritesheet");
            s.delete(sid + "-lernpfad");
        });
        this.saveList(this.list().filter(p => p.id != projectId));
        if (this.getCurrentId() == projectId) {
            try { localStorage.removeItem(CURRENT_KEY); } catch (e) { }
        }
    }

    // ---------- Import / Export ----------

    static toExportedWorkspace(name: string, files: ProjectFile[]): ExportedWorkspace {
        return {
            name: name,
            id: 0,
            settings: { libraries: [], language: "Java" } as any,
            modules: files.map((f, i) => ({
                name: f.name,
                text: f.text,
                id: i,
                identical_to_repository_version: false,
                isFolder: false
            }))
        };
    }

    /** Liest eine Datei im Format der Online-IDE. Wirft eine Exception mit verständlicher Meldung. */
    static parseImport(text: string, filename: string): { name: string, files: ProjectFile[], spritesheetBase64?: string, lernpfadHtml?: string } {
        let data: any;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`„${filename}“ ist keine JPad- oder Online-IDE-Projektdatei.`);
        }
        if (Array.isArray(data)) data = data[0];
        if (!data || !Array.isArray(data.modules)) {
            throw new Error(`„${filename}“ enthält kein Projekt.`);
        }
        const files: ProjectFile[] = data.modules
            .filter((m: any) => !m.isFolder && typeof m.name == "string")
            .map((m: any) => ({ name: m.name.endsWith(".java") ? m.name : m.name + ".java", text: m.text || "" }));
        if (files.length == 0) {
            throw new Error(`„${filename}“ enthält keine Java-Dateien.`);
        }
        let name: string = data.name || filename.replace(/\.json$/i, "");
        const spritesheetBase64 = typeof data.spritesheetBase64 == "string" && data.spritesheetBase64.length > 0 ? data.spritesheetBase64 : undefined;
        // Eingebetteter Lernpfad (nur JPad; die Online-IDE ignoriert das Feld)
        const lernpfadHtml = typeof data.lernpfadHtml == "string" && data.lernpfadHtml.trim().length > 0 ? data.lernpfadHtml : undefined;
        return { name, files, spritesheetBase64, lernpfadHtml };
    }
}
