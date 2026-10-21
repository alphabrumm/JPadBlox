import { icon } from "./Icons.js";
import { escapeHtml } from "./LanguageBridge.js";

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
        validate?: (name: string) => string | null
    }): Promise<{ type: string, name: string } | null> {
        const options = o.groups.filter(g => g.items.length > 0).map(g =>
            `<optgroup label="${escapeHtml(g.label)}">${g.items.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}</optgroup>`
        ).join("");
        return this.open(`
            <h2 class="jp-sheet-title">${escapeHtml(o.title)}</h2>
            <form class="jp-form">
                <label class="jp-field">
                    <span>Datentyp</span>
                    <select class="jp-select" data-ref="type">${options}</select>
                </label>
                <label class="jp-field">
                    <span>${escapeHtml(o.nameLabel)}</span>
                    <input type="text" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="done">
                </label>
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">${escapeHtml(o.confirm)}</button>
                </div>
            </form>`, (sheet, close) => {
            const select = sheet.querySelector("select")!;
            const input = sheet.querySelector("input")!;
            const error = sheet.querySelector<HTMLElement>(".jp-field-error")!;
            setTimeout(() => input.focus(), 60);
            input.addEventListener("input", () => error.textContent = "");
            sheet.querySelector("form")!.addEventListener("submit", (e) => {
                e.preventDefault();
                const msg = o.validate?.(input.value);
                if (msg) { error.textContent = msg; input.focus(); return; }
                close({ type: select.value, name: input.value.trim() });
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
     * Weitere Parameter lassen sich mit „+ weiterer Parameter“ ergänzen; Zeilen ohne Namen zählen nicht.
     */
    method(o: { groups: { label: string, items: string[] }[], validate: (name: string) => string | null }):
        Promise<{ name: string, returnType: string, params: { type: string, name: string }[] } | null> {
        const typeOptions = o.groups.filter(g => g.items.length > 0).map(g =>
            `<optgroup label="${escapeHtml(g.label)}">${g.items.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}</optgroup>`
        ).join("");
        const paramRow = `<div class="jp-param-row">
                <select class="jp-select" aria-label="Datentyp des Parameters">${typeOptions}</select>
                <input type="text" placeholder="Parametername" aria-label="Name des Parameters" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off">
            </div>`;
        return this.open(`
            <h2 class="jp-sheet-title">Baue Deine neue Methode</h2>
            <form class="jp-form">
                <label class="jp-field">
                    <span>Name der Methode</span>
                    <input type="text" data-name autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="next">
                </label>
                <label class="jp-field">
                    <span>Soll die Methode Daten zurückgeben? Datentyp wählen oder leer lassen</span>
                    <select class="jp-select" data-return><option value="void">void</option>${typeOptions}</select>
                </label>
                <div class="jp-field">
                    <span>Willst Du der Methode Daten mitgeben?</span>
                    <div class="jp-param-rows">${paramRow}</div>
                    <button type="button" class="jp-btn jp-btn-small" data-addparam>+ weiterer Parameter</button>
                </div>
                <p class="jp-field-error" aria-live="polite"></p>
                <div class="jp-sheet-buttons">
                    <button type="button" class="jp-btn" data-cancel>Abbrechen</button>
                    <button type="submit" class="jp-btn jp-btn-primary">Einfügen</button>
                </div>
            </form>`, (sheet, close) => {
            const nameInput = sheet.querySelector<HTMLInputElement>("[data-name]")!;
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
                    if (params.some(p => p.name == input.value.trim())) { error.textContent = `Der Parametername „${input.value.trim()}“ kommt doppelt vor.`; input.focus(); return; }
                    params.push({ type: row.querySelector("select")!.value, name: input.value.trim() });
                }
                close({ name: nameInput.value.trim(), returnType: sheet.querySelector<HTMLSelectElement>("[data-return]")!.value, params });
            });
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
