import { icon } from "./Icons.js";
import { escapeHtml } from "./LanguageBridge.js";
import { createMethodAnimation } from "./MethodAnimation.js";
import { createClassAnimation } from "./ClassAnimation.js";

type PromptOptions = {
    title: string;
    label: string;
    value?: string;
    placeholder?: string;
    confirm: string;
    validate?: (value: string) => string | null;
    capitalize?: boolean;
};

type ConfirmOptions = { title: string, text: string, confirm: string, danger?: boolean };

export type ActionItem = { id: string, label: string, icon: string, danger?: boolean, disabled?: boolean };

/**
 * Dialoge als Bottom-Sheets (Handy) bzw. zentrierte Karten (Tablet).
 * Ersetzen prompt()/confirm(), die auf dem iPad unpassend aussehen.
 */
/** Konstruktor eines Datentyps für den Variablen-Dialog */
export type VarCtor = { params: { type: string, name: string }[] };
export type VariableResult = {
    type: string, name: string, array: boolean, count?: number,
    declOnly: boolean, value?: string, ctor?: VarCtor
};

/** Einfaches Syntax-Highlighting für die Vorschau einer Java-Zeile (Farben wie im Editor) */
export function highlightJava(code: string): string {
    const KW = new Set(["new", "true", "false", "null", "this", "class", "void", "return", "if", "else", "while", "for"]);
    const re = /("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_ÄÖÜäöüß][\wÄÖÜäöüß]*)|(\s+)|([^\sA-Za-z_\d"']+)/g;
    let out = "", m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        if (m[1]) out += `<span class="pv-str">${escapeHtml(m[1])}</span>`;
        else if (m[2]) out += `<span class="pv-num">${m[2]}</span>`;
        else if (m[3]) {
            const w = m[3];
            out += KW.has(w) ? `<span class="pv-kw">${w}</span>` : /^[A-ZÄÖÜ]/.test(w) ? `<span class="pv-ty">${w}</span>` : w;
        } else out += escapeHtml(m[0]);
    }
    return out;
}

export class Dialogs {

    constructor(private root: HTMLElement) { }

    private open(inner: string, onReady: (sheet: HTMLElement, close: (v: any) => void) => void): Promise<any> {
        return new Promise(resolve => {
            const layer = document.createElement("div");
            layer.className = "jp-sheet-layer";
            layer.innerHTML = `<div class="jp-sheet" role="dialog" aria-modal="true">${inner}</div>`;
            this.root.appendChild(layer);
            const sheet = <HTMLElement>layer.firstElementChild;
            requestAnimationFrame(() => layer.classList.add("is-open"));

            let closed = false;
            const close = (v: any) => {
                if (closed) return;
                closed = true;
                layer.classList.remove("is-open");
                document.removeEventListener("keydown", onKey);
                setTimeout(() => layer.remove(), 200);
                resolve(v);
            };
            const onKey = (e: KeyboardEvent) => { if (e.key == "Escape") close(null); };
            document.addEventListener("keydown", onKey);
            layer.addEventListener("click", (e) => { if (e.target == layer) close(null); });
            sheet.querySelectorAll<HTMLElement>("[data-cancel]").forEach(b => b.addEventListener("click", () => close(null)));
            onReady(sheet, close);
        });
    }

    prompt(o: PromptOptions): Promise<string | null> {
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(o.title)}</h2>
            <form class="jp-form">
                <label class="jp-field">
                    <span>${escapeHtml(o.label)}</span>
                    <input type="text" value="${escapeHtml(o.value || "")}" placeholder="${escapeHtml(o.placeholder || "")}"
                        autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="${o.capitalize ? "words" : "sentences"}" enterkeyhint="done">
                </label>
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">${escapeHtml(o.confirm)}</button>
                </div>
            </form>`, (sheet, close) => {
            const input = sheet.querySelector("input")!;
            const error = sheet.querySelector<HTMLElement>(".jp-field-error")!;
            const form = sheet.querySelector("form")!;
            setTimeout(() => { input.focus(); input.select(); }, 60);
            input.addEventListener("input", () => error.textContent = "");
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const msg = o.validate?.(input.value);
                if (msg) { error.textContent = msg; input.focus(); return; }
                close(input.value);
            });
        });
    }

    /**
     * JPadBlox: Attribut bzw. Variable anlegen – Datentyp aus einer Liste wählen, Namen eingeben.
     * Liefert { type, name } oder null bei Abbruch.
     */
    declaration(o: {
        title: string, groups: { label: string, items: string[] }[], nameLabel: string, confirm: string,
        validate?: (name: string) => string | null,
        /** JPadBlox (Array): zusätzliches Feld für eine natürliche Zahl > 0 */
        countLabel?: string,
        /** JPadBlox: Häkchen „Array“ neben dem Datentyp; ist es gesetzt, erscheint das Feld für die Anzahl */
        arrayOption?: boolean,
        /** JPadBlox: Vorschau der Anweisung über den Knöpfen */
        build?: (r: { type: string, name: string, count?: number, array?: boolean }) => string
    }): Promise<{ type: string, name: string, count?: number, array?: boolean } | null> {
        const countLabel = o.countLabel ?? (o.arrayOption ? "Wie viele Elemente sollen maximal Platz haben?" : undefined);
        const options = o.groups.filter(g => g.items.length > 0).map(g =>
            `<optgroup label="${escapeHtml(g.label)}">${g.items.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}</optgroup>`
        ).join("");
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(o.title)}</h2>
            <form class="jp-form">
                <div class="jp-type-row">
                    <label class="jp-field">
                        <span>Datentyp</span>
                        <select class="jp-select" data-ref="type">${options}</select>
                    </label>
                    ${o.arrayOption ? `<label class="jp-array-check">
                        <input type="checkbox" data-isarray>
                        <span>Array</span>
                    </label>` : ""}
                </div>
                <label class="jp-field">
                    <span>${escapeHtml(o.nameLabel)}</span>
                    <input type="text" data-ident autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="${o.countLabel ? "next" : "done"}">
                </label>
                ${countLabel ? `<label class="jp-field jp-count-field" ${o.arrayOption ? "hidden" : ""}>
                    <span>${escapeHtml(countLabel)}</span>
                    <input type="text" data-count inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done">
                </label>` : ""}
                ${o.build ? `<div class="jp-preview" aria-live="polite"><span class="jp-preview-label">Vorschau</span><code data-preview></code></div>` : ""}
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">${escapeHtml(o.confirm)}</button>
                </div>
            </form>`, (sheet, close) => {
            const select = sheet.querySelector("select")!;
            const input = sheet.querySelector<HTMLInputElement>("[data-ident]")!;
            const countInput = sheet.querySelector<HTMLInputElement>("[data-count]");
            const isArray = sheet.querySelector<HTMLInputElement>("[data-isarray]");
            const error = sheet.querySelector<HTMLElement>(".jp-field-error")!;
            // Häkchen „Array anlegen“: Feld für die Anzahl ein-/ausblenden
            isArray?.addEventListener("change", () => {
                const field = sheet.querySelector<HTMLElement>(".jp-count-field")!;
                field.hidden = !isArray.checked;
                error.textContent = "";
                if (isArray.checked) setTimeout(() => countInput?.focus(), 30);
            });
            setTimeout(() => input.focus(), 60);
            input.addEventListener("input", () => error.textContent = "");
            // JPadBlox: Vorschau der Anweisung
            const preview = sheet.querySelector<HTMLElement>("[data-preview]");
            const refreshPreview = () => {
                if (!preview || !o.build) return;
                const c = parseInt(countInput?.value.trim() ?? "");
                preview.innerHTML = highlightJava(o.build({ type: select.value, name: input.value.trim(), array: isArray ? isArray.checked : undefined, count: isFinite(c) && c > 0 ? c : undefined }));
            };
            select.addEventListener("change", refreshPreview);
            isArray?.addEventListener("change", refreshPreview);
            input.addEventListener("input", refreshPreview);
            countInput?.addEventListener("input", refreshPreview);
            refreshPreview();
            sheet.querySelector("form")!.addEventListener("submit", (e) => {
                e.preventDefault();
                const msg = o.validate?.(input.value);
                if (msg) { error.textContent = msg; input.focus(); return; }
                let count: number | undefined;
                const wantCount = countInput && (!isArray || isArray.checked);
                if (wantCount && countInput) {
                    const t = countInput.value.trim();
                    if (!/^[0-9]+$/.test(t) || parseInt(t) <= 0) {
                        error.textContent = "Bitte eine ganze Zahl größer als 0 eingeben.";
                        countInput.focus();
                        return;
                    }
                    count = parseInt(t);
                }
                close({ type: select.value, name: input.value.trim(), count, array: isArray ? isArray.checked : undefined });
            });
        });
    }

    /**
     * JPadBlox: Umbenennen – Symbol aus einer Liste wählen (gruppiert), neuen Namen eingeben.
     * Liefert { id, name } oder null.
     */
    rename(o: {
        groups: { label: string, items: { id: string, label: string, name: string }[] }[],
        validate: (id: string, name: string) => string | null,
        /** vorausgewählter Eintrag (Symbol am Cursor) */
        selectedId?: string
    }): Promise<{ id: string, name: string } | null> {
        const options = o.groups.filter(g => g.items.length > 0).map(g =>
            `<optgroup label="${escapeHtml(g.label)}">${g.items.map(i =>
                `<option value="${escapeHtml(i.id)}" data-name="${escapeHtml(i.name)}">${escapeHtml(i.label)}</option>`).join("")}</optgroup>`
        ).join("");
        return this.open(`
            <h2 class="jp-sheet-title">Umbenennen</h2>
            <p class="jp-sheet-text">Welche Variable, Methode oder Klasse soll einen neuen Namen bekommen? JPad ändert den Namen überall im Projekt.</p>
            <form class="jp-form">
                <label class="jp-field">
                    <span>Was umbenennen?</span>
                    <select class="jp-select" data-ref="symbol">${options}</select>
                </label>
                <label class="jp-field">
                    <span>Neuer Name</span>
                    <input type="text" data-ident autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="done">
                </label>
                <p class="jp-hint jp-rename-hint">Tipp: Namen von Variablen und Methoden beginnen mit einem Kleinbuchstaben (z. B. <code>alter</code>, <code>bellen</code>), Namen von Klassen mit einem Großbuchstaben (z. B. <code>Hund</code>).</p>
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">Umbenennen</button>
                </div>
            </form>`, (sheet, close) => {
            const select = sheet.querySelector("select")!;
            const input = sheet.querySelector<HTMLInputElement>("[data-ident]")!;
            const error = sheet.querySelector<HTMLElement>(".jp-field-error")!;
            const fill = () => {
                input.value = select.selectedOptions[0]?.dataset.name ?? "";
                error.textContent = "";
            };
            select.addEventListener("change", () => { fill(); input.focus(); input.select(); });
            if (o.selectedId && Array.from(select.options).some(op => op.value == o.selectedId)) select.value = o.selectedId;
            fill();
            setTimeout(() => { input.focus(); input.select(); }, 60);
            input.addEventListener("input", () => error.textContent = "");
            sheet.querySelector("form")!.addEventListener("submit", (e) => {
                e.preventDefault();
                const msg = o.validate(select.value, input.value);
                if (msg) { error.textContent = msg; input.focus(); return; }
                close({ id: select.value, name: input.value.trim() });
            });
        });
    }

    /**
     * JPadBlox: Baustein „Variable“. Datentyp wählen, Namen eingeben und
     * - bei Grundtypen einen Wert, der zugewiesen wird (leer = nur Deklaration),
     * - bei anderen Datentypen einen der verfügbaren Konstruktoren (oder „nur Deklaration“),
     * - oder per Häkchen ein Array anlegen.
     * Über den Knöpfen steht die Vorschau der Anweisung, die eingefügt wird (build liefert sie).
     */
    variable(o: {
        groups: { label: string, items: string[] }[],
        basicTypes: string[],
        constructors: (type: string) => VarCtor[],
        build: (r: VariableResult) => string,
        validate: (name: string) => string | null
    }): Promise<VariableResult | null> {
        const options = o.groups.filter(g => g.items.length > 0).map(g =>
            `<optgroup label="${escapeHtml(g.label)}">${g.items.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}</optgroup>`
        ).join("");
        const PLACEHOLDER: Record<string, string> = { String: "z. B. Bello", Integer: "z. B. 3", Double: "z. B. 12.5", Boolean: "true oder false", Character: "z. B. A" };
        return this.open(`
            <h2 class="jp-sheet-title">Variable anlegen</h2>
            <form class="jp-form">
                <div class="jp-type-row jp-type-row-var">
                    <label class="jp-field">
                        <span>Datentyp</span>
                        <select class="jp-select" data-ref="type">${options}</select>
                    </label>
                    <div class="jp-type-checks">
                        <label class="jp-array-check"><input type="checkbox" data-isarray><span>Array</span></label>
                        <label class="jp-array-check"><input type="checkbox" data-declonly><span>Nur Deklaration</span></label>
                    </div>
                </div>
                <label class="jp-field">
                    <span>So soll Deine Variable heißen:</span>
                    <input type="text" data-ident autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="next">
                </label>
                <label class="jp-field" data-value-field>
                    <span>Wert, der zugewiesen wird</span>
                    <input type="text" data-value autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="done">
                </label>
                <label class="jp-field" data-ctor-field hidden>
                    <span>Verfügbare Konstruktoren</span>
                    <select class="jp-select" data-ctor></select>
                </label>
                <label class="jp-field jp-count-field" hidden>
                    <span>Wie viele Elemente sollen maximal Platz haben?</span>
                    <input type="text" data-count inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done">
                </label>
                <div class="jp-preview" aria-live="polite"><span class="jp-preview-label">Vorschau</span><code data-preview></code></div>
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">Einfügen</button>
                </div>
            </form>`, (sheet, close) => {
            const q = <T extends HTMLElement>(s: string) => sheet.querySelector<T>(s)!;
            const type = q<HTMLSelectElement>("[data-ref=type]"), name = q<HTMLInputElement>("[data-ident]");
            const isArray = q<HTMLInputElement>("[data-isarray]"), declOnly = q<HTMLInputElement>("[data-declonly]");
            const valueField = q<HTMLElement>("[data-value-field]");
            const value = q<HTMLInputElement>("[data-value]"), ctorField = q<HTMLElement>("[data-ctor-field]");
            const ctor = q<HTMLSelectElement>("[data-ctor]"), countField = q<HTMLElement>(".jp-count-field");
            const count = q<HTMLInputElement>("[data-count]"), preview = q<HTMLElement>("[data-preview]");
            const error = q<HTMLElement>(".jp-field-error");
            let ctors: VarCtor[] = [];
            const current = (): VariableResult => {
                const basic = o.basicTypes.includes(type.value);
                const c = parseInt(count.value.trim());
                const only = declOnly.checked;
                return {
                    type: type.value, name: name.value.trim(), array: isArray.checked,
                    count: isArray.checked && !only && isFinite(c) && c > 0 ? c : undefined,
                    declOnly: only,
                    value: !isArray.checked && basic && !only ? value.value : undefined,
                    ctor: !isArray.checked && !basic && !only ? ctors[ctor.selectedIndex] : undefined
                };
            };
            const refresh = () => {
                const basic = o.basicTypes.includes(type.value);
                // Felder für Wert, Konstruktor bzw. Anzahl entfallen bei „nur Deklaration“
                valueField.hidden = !basic || isArray.checked || declOnly.checked;
                ctorField.hidden = basic || isArray.checked || declOnly.checked;
                countField.hidden = !isArray.checked || declOnly.checked;
                value.placeholder = PLACEHOLDER[type.value] ?? "";
                preview.innerHTML = highlightJava(o.build(current()));
                error.textContent = "";
            };
            const fillCtors = () => {
                ctors = o.basicTypes.includes(type.value) ? [] : o.constructors(type.value);
                ctor.innerHTML = ctors.map((c, i) => `<option value="${i}">${escapeHtml(`new ${type.value}(${c.params.map(p => p.type + " " + p.name).join(", ")})`)}</option>`).join("");
            };
            type.addEventListener("change", () => { fillCtors(); refresh(); });
            for (const el of [isArray, declOnly, ctor]) el.addEventListener("change", refresh);
            for (const el of [name, value, count]) el.addEventListener("input", refresh);
            fillCtors();
            refresh();
            setTimeout(() => name.focus(), 60);
            sheet.querySelector("form")!.addEventListener("submit", (e) => {
                e.preventDefault();
                const msg = o.validate(name.value);
                if (msg) { error.textContent = msg; name.focus(); return; }
                const r = current();
                if (r.array && !r.declOnly && !r.count) { error.textContent = "Bitte eine ganze Zahl größer als 0 eingeben."; count.focus(); return; }
                close(r);
            });
        });
    }

    /** JPadBlox: Auswahl mehrerer Einträge (Häkchen). Liefert die ids der gewählten Einträge oder null. */
    choose(o: { title: string, text: string, items: { id: string, label: string, note?: string, checked?: boolean }[], confirm: string }): Promise<string[] | null> {
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(o.title)}</h2>
            <p class="jp-sheet-text">${escapeHtml(o.text)}</p>
            <form class="jp-form">
                <div class="jp-checklist">
                    ${o.items.map(i => `<label class="jp-check">
                        <input type="checkbox" value="${escapeHtml(i.id)}" ${i.checked ? "checked" : ""}>
                        <span class="jp-check-label">${escapeHtml(i.label)}</span>
                        ${i.note ? `<span class="jp-check-note">${escapeHtml(i.note)}</span>` : ""}
                    </label>`).join("")}
                </div>
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">${escapeHtml(o.confirm)}</button>
                </div>
            </form>`, (sheet, close) => {
            const error = sheet.querySelector<HTMLElement>(".jp-field-error")!;
            sheet.querySelector("form")!.addEventListener("submit", (e) => {
                e.preventDefault();
                const ids = [...sheet.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")].map(c => c.value);
                if (ids.length == 0) { error.textContent = "Bitte mindestens ein Attribut auswählen."; return; }
                close(ids);
            });
        });
    }

    /**
     * JPadBlox: „Baue Deine neue Methode“ – Name, Rückgabetyp (void oder Datentyp) und Parameter.
     * Parameter kommen einzeln mit „+ Parameter hinzufügen“ dazu (anfangs keiner); Zeilen ohne Namen zählen nicht.
     */
    method(o: { groups: { label: string, items: string[] }[], validate: (name: string) => string | null }):
        Promise<{ name: string, returnType: string, params: { type: string, name: string }[] } | null> {
        const typeOptions = o.groups.filter(g => g.items.length > 0).map(g =>
            `<optgroup label="${escapeHtml(g.label)}">${g.items.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}</optgroup>`
        ).join("");
        const paramRow = `<div class="jp-param-row">
                <select class="jp-select" aria-label="Datentyp des Parameters">${typeOptions}</select>
                <input type="text" placeholder="So heißt der Parameter" aria-label="So heißt der Parameter" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off">
            </div>`;
        return this.open(`
            <div class="jp-method-split">
            <div class="jp-method-input">
            <div class="jp-method-head">
                <h2 class="jp-sheet-title">Baue Deine neue Methode</h2>
                <button type="button" class="jp-btn jp-btn-small jp-method-toggle" data-togglesketch></button>
            </div>
            <form class="jp-form">
                <label class="jp-field">
                    <span>So soll Deine Methode heißen:</span>
                    <input type="text" data-ident autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="next">
                </label>
                <label class="jp-field">
                    <span>Soll die Methode Daten zurückgeben? Datentyp wählen oder leer lassen</span>
                    <select class="jp-select" data-return><option value="void">void</option>${typeOptions}</select>
                </label>
                <div class="jp-field">
                    <span>Willst Du der Methode Daten mitgeben?</span>
                    <div class="jp-param-rows"></div>
                    <button type="button" class="jp-btn jp-btn-small" data-addparam>+ Parameter hinzufügen</button>
                </div>
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">Einfügen</button>
                </div>
            </form>
            </div>
            <div class="jp-method-anim"></div>
            </div>`, (sheet, close) => {
            // JPadBlox: rechts (bzw. auf schmalen Bildschirmen darunter) die animierte Skizze
            sheet.classList.add("is-method");
            // Skizze ein-/ausblenden; die Wahl wird im Browser gemerkt
            const host = sheet.querySelector<HTMLElement>(".jp-method-anim")!;
            const toggle = sheet.querySelector<HTMLElement>("[data-togglesketch]")!;
            const readShow = () => { try { return localStorage.getItem("jpadblox.methodSketch") != "0"; } catch (e) { return true; } };
            const applySketch = (show: boolean) => {
                sheet.classList.toggle("sketch-hidden", !show);
                toggle.textContent = show ? "Skizze ausblenden" : "Skizze einblenden";
                toggle.setAttribute("aria-expanded", String(show));
                toggle.dataset.tip = show ? "Die erklärende Skizze ausblenden – die Einstellung wird gemerkt" : "Die erklärende Skizze zu Parametern und Rückgabe wieder einblenden";
                host.replaceChildren(...(show ? [createMethodAnimation()] : []));
            };
            applySketch(readShow());
            toggle.addEventListener("click", () => {
                const show = sheet.classList.contains("sketch-hidden");
                try { localStorage.setItem("jpadblox.methodSketch", show ? "1" : "0"); } catch (e) { }
                applySketch(show);
            });
            const nameInput = sheet.querySelector<HTMLInputElement>("[data-ident]")!;
            const error = sheet.querySelector<HTMLElement>(".jp-field-error")!;
            const rows = sheet.querySelector<HTMLElement>(".jp-param-rows")!;
            setTimeout(() => nameInput.focus(), 60);
            sheet.addEventListener("input", () => error.textContent = "");
            sheet.querySelector("[data-addparam]")!.addEventListener("click", () => {
                rows.insertAdjacentHTML("beforeend", paramRow);
                rows.querySelector<HTMLInputElement>(".jp-param-row:last-child input")?.focus();
            });
            sheet.querySelector("form")!.addEventListener("submit", (e) => {
                e.preventDefault();
                const msg = o.validate(nameInput.value);
                if (msg) { error.textContent = msg; nameInput.focus(); return; }
                const params: { type: string, name: string }[] = [];
                for (const row of rows.querySelectorAll<HTMLElement>(".jp-param-row")) {
                    const input = row.querySelector("input")!;
                    if (input.value.trim() == "") continue;
                    const pm = o.validate(input.value);
                    if (pm) { error.textContent = "Parameter: " + pm; input.focus(); return; }
                    if (params.some(p => p.name == input.value.trim())) { error.textContent = `Der Parameter „${input.value.trim()}“ kommt doppelt vor.`; input.focus(); return; }
                    params.push({ type: row.querySelector("select")!.value, name: input.value.trim() });
                }
                close({ name: nameInput.value.trim(), returnType: sheet.querySelector<HTMLSelectElement>("[data-return]")!.value, params });
            });
        });
    }

    /**
     * JPadBlox: Dialog des Bausteins class – Name der Klasse, rechts (ausblendbar) die Skizze
     * „Aus der Klasse werden Objekte“. Liefert den Namen oder null.
     */
    className(o: { validate: (name: string, where: "file" | "here") => string | null }): Promise<{ name: string, where: "file" | "here" } | null> {
        return this.open(`
            <div class="jp-method-split">
            <div class="jp-method-input">
            <div class="jp-method-head">
                <h2 class="jp-sheet-title">Neue Klasse</h2>
                <button type="button" class="jp-btn jp-btn-small jp-method-toggle" data-togglesketch></button>
            </div>
            <p class="jp-sheet-text">Eine Klasse ist ein Bauplan für viele gleichartige Objekte!</p>
            <form class="jp-form">
                <label class="jp-field">
                    <span>Wie soll deine Klasse heißen?</span>
                    <input type="text" data-ident autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="words" enterkeyhint="done">
                </label>
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-choice-list">
                    <button type="button" class="jp-choice" data-where="file">
                        <b>Klasse als Datei anlegen</b>
                        <span>Ein neuer Reiter mit dem Namen der Klasse, darin das Klassengerüst. So hat jede Klasse ihre eigene Datei.</span>
                    </button>
                    <button type="button" class="jp-choice" data-where="here">
                        <b>Klasse hier einfügen</b>
                        <span>Das Klassengerüst kommt in die geöffnete Datei – an die Cursorstelle oder unter den vorhandenen Code.</span>
                    </button>
                </div>
                <div class="jp-sheet-buttons"><button type="button" class="jp-btn" data-cancel>Abbrechen</button></div>
            </form>
            </div>
            <div class="jp-method-anim"></div>
            </div>`, (sheet, close) => {
            sheet.classList.add("is-method");
            this.sketchToggle(sheet, "jpadblox.classSketch", createClassAnimation);
            const input = sheet.querySelector<HTMLInputElement>("[data-ident]")!;
            const error = sheet.querySelector<HTMLElement>(".jp-field-error")!;
            setTimeout(() => input.focus(), 60);
            input.addEventListener("input", () => error.textContent = "");
            const choose = (where: "file" | "here") => {
                const msg = o.validate(input.value, where);
                if (msg) { error.textContent = msg; input.focus(); return; }
                close({ name: input.value.trim(), where });
            };
            sheet.querySelectorAll<HTMLElement>("[data-where]").forEach(b =>
                b.addEventListener("click", () => choose(b.dataset.where as "file" | "here")));
            // Enter in das Namensfeld: als Datei anlegen
            sheet.querySelector("form")!.addEventListener("submit", (e) => { e.preventDefault(); choose("file"); });
        });
    }

    /**
     * JPadBlox: Dialog des Bausteins Konstruktor – leerer Konstruktor oder Konstruktor für die Attribute,
     * rechts (ausblendbar) dieselbe Skizze wie bei class. Liefert "empty", "attrs" oder null.
     */
    constructorChoice(): Promise<"empty" | "attrs" | null> {
        return this.open(`
            <div class="jp-method-split">
            <div class="jp-method-input">
            <div class="jp-method-head">
                <h2 class="jp-sheet-title">Neuer Konstruktor</h2>
                <button type="button" class="jp-btn jp-btn-small jp-method-toggle" data-togglesketch></button>
            </div>
            <div class="jp-sheet-text jp-ctor-text">
                <p>Der Konstruktor ist die Methode, die beim Bauen eines neuen Objekts ausgeführt wird.</p>
                <ul>
                    <li>Der Konstruktor hat <b><i>keinen</i></b> <b>Rückgabetyp</b></li>
                    <li>Der Konstruktor hat den <b>gleichen Namen wie seine Klasse</b></li>
                    <li>Der Konstruktor wird durch das <b>Schlüsselwort</b> <b><i>new</i></b> aufgerufen</li>
                </ul>
            </div>
            <div class="jp-choice-list">
                <button type="button" class="jp-choice" data-choice="empty">
                    <b>Leerer Konstruktor</b>
                    <span>Ohne Parameter, z. B. <code>Schaf() { }</code>. Der Cursor steht danach im Rumpf.</span>
                </button>
                <button type="button" class="jp-choice" data-choice="attrs">
                    <b>Konstruktor für Attributbelegung</b>
                    <span>Ein Parameter je Attribut, z. B. <code>Schaf(String name, Integer alter)</code> mit <code>this.name = name;</code></span>
                </button>
            </div>
            <div class="jp-sheet-buttons"><button type="button" class="jp-btn" data-cancel>Abbrechen</button></div>
            </div>
            <div class="jp-method-anim"></div>
            </div>`, (sheet, close) => {
            sheet.classList.add("is-method");
            this.sketchToggle(sheet, "jpadblox.ctorSketch", createClassAnimation);
            sheet.querySelectorAll<HTMLElement>("[data-choice]").forEach(b => b.addEventListener("click", () => close(b.dataset.choice)));
        });
    }

    /** Skizze im Dialog ein-/ausblenden; die Wahl wird im Browser unter key gemerkt */
    private sketchToggle(sheet: HTMLElement, key: string, create: () => HTMLElement) {
        const host = sheet.querySelector<HTMLElement>(".jp-method-anim")!;
        const toggle = sheet.querySelector<HTMLElement>("[data-togglesketch]")!;
        const readShow = () => { try { return localStorage.getItem(key) != "0"; } catch (e) { return true; } };
        const apply = (show: boolean) => {
            sheet.classList.toggle("sketch-hidden", !show);
            toggle.textContent = show ? "Skizze ausblenden" : "Skizze einblenden";
            toggle.setAttribute("aria-expanded", String(show));
            toggle.dataset.tip = show ? "Die erklärende Skizze ausblenden – die Einstellung wird gemerkt" : "Die erklärende Skizze wieder einblenden";
            host.replaceChildren(...(show ? [create()] : []));
        };
        apply(readShow());
        toggle.addEventListener("click", () => {
            const show = sheet.classList.contains("sketch-hidden");
            try { localStorage.setItem(key, show ? "1" : "0"); } catch (e) { }
            apply(show);
        });
    }

    confirm(o: ConfirmOptions): Promise<boolean> {
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(o.title)}</h2>
            <p class="jp-sheet-text">${escapeHtml(o.text)}</p>
            <div class="jp-sheet-buttons">
                <button class="jp-btn" data-cancel>Abbrechen</button>
                <button class="jp-btn ${o.danger ? "jp-btn-danger" : "jp-btn-primary"}" data-ok>${escapeHtml(o.confirm)}</button>
            </div>`, (sheet, close) => {
            const ok = sheet.querySelector<HTMLElement>("[data-ok]")!;
            ok.addEventListener("click", () => close(true));
            setTimeout(() => ok.focus(), 60);
        }).then(v => v === true);
    }

    /** Mehrzeiliges Feld, in das man selbst einsetzt (Rückfall, wenn die Zwischenablage nicht lesbar ist). */
    pasteArea(o: { title: string, text: string, confirm: string }): Promise<string | null> {
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(o.title)}</h2>
            <p class="jp-sheet-text">${escapeHtml(o.text)}</p>
            <form class="jp-form">
                <textarea class="jp-paste-area" rows="8" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">${escapeHtml(o.confirm)}</button>
                </div>
            </form>`, (sheet, close) => {
            const ta = sheet.querySelector("textarea")!;
            setTimeout(() => ta.focus(), 60);
            sheet.querySelector("form")!.addEventListener("submit", (e) => { e.preventDefault(); close(ta.value); });
        });
    }

    alert(o: { title: string, text: string }): Promise<void> {
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(o.title)}</h2>
            <p class="jp-sheet-text">${escapeHtml(o.text)}</p>
            <div class="jp-sheet-buttons"><button class="jp-btn jp-btn-primary" data-cancel>OK</button></div>`, () => { });
    }

    actions(title: string, items: ActionItem[]): Promise<string | null> {
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(title)}</h2>
            <div class="jp-action-list">
                ${items.map(i => `<button class="jp-action${i.danger ? " is-danger" : ""}" data-id="${i.id}" ${i.disabled ? "disabled" : ""}>
                    ${icon(i.icon)}<span>${escapeHtml(i.label)}</span></button>`).join("")}
            </div>
            <div class="jp-sheet-buttons"><button class="jp-btn" data-cancel>Abbrechen</button></div>`, (sheet, close) => {
            sheet.querySelectorAll<HTMLElement>("[data-id]").forEach(b => b.addEventListener("click", () => close(b.dataset.id)));
        });
    }

    sheet(title: string, html: string): Promise<void> {
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(title)}</h2>
            <div class="jp-sheet-content">${html}</div>
            <div class="jp-sheet-buttons"><button class="jp-btn jp-btn-primary" data-cancel>Schließen</button></div>`, () => { });
    }
}
