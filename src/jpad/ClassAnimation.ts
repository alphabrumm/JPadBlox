/**
 * JPadBlox: Animierte Skizze „Aus der Klasse werden Objekte“ für den Dialog des Bausteins class.
 *
 * Eine Klassenkarte Schaf (Attribute name, alter; Konstruktor Schaf(String n, Integer a); Methode maeh()).
 * Ein Finger drückt auf den Konstruktor, in die Becher „String n“ und „Integer a“ fallen die Werte,
 * der Konstruktor vibriert und spuckt eine Objektkarte aus, darüber erscheint ein Schaf.
 * Zweimal: Dolli (7) und Helga (5). Dann beginnt alles von vorn.
 * Stil wie die Methoden-Skizze: leicht handgezeichnet, Handschrift, ruhiges Tempo.
 */

type Round = { v: string, name: string, alter: string, wool: string };

const ROUNDS: Round[] = [
    { v: "s1", name: "Dolli", alter: "7", wool: "#F7F4EA" },
    { v: "s2", name: "Helga", alter: "5", wool: "#8D4F2C" },
];

const BLUE = "#3157F5";
const ORANGE = "#E8590C";
const TYPE = "#0B7480";

const CSS = `
.jp-canim { color: var(--ink, #2B3140); position: relative; }
.jp-canim svg { display: block; width: 100%; height: auto; }
.jp-canim .hand { font-family: "Chalkboard SE", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive; fill: currentColor; }
.jp-canim .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; fill: currentColor; }
.jp-canim .anim { transform-box: fill-box; }

/* Finger */
.jp-canim .finger { opacity: 0; transform: translate(70px, 60px); transition: transform .9s cubic-bezier(.3,.7,.3,1), opacity .4s; }
.jp-canim.point .finger { opacity: 1; transform: translate(0, 0); }
.jp-canim.press .finger { transform: translate(-3px, 5px) scale(.94); }
.jp-canim .ctor-row { transition: fill .3s; }
.jp-canim.press .ctor-row { fill: color-mix(in srgb, ${ORANGE} 22%, transparent); }

/* Werte fallen in die Becher */
.jp-canim .val { opacity: 0; }
.jp-canim.drop1 .val1, .jp-canim.drop2 .val2 { animation: jp-canim-drop .9s cubic-bezier(.4,0,.7,1) forwards; }
@keyframes jp-canim-drop { 0% { opacity: 0; transform: translateY(-46px); } 25% { opacity: 1; } 100% { opacity: 1; transform: translateY(0); } }
.jp-canim.feed .val { animation: jp-canim-feed .9s ease-in forwards; }
@keyframes jp-canim-feed { 0% { opacity: 1; transform: translate(0, 0); } 100% { opacity: 0; transform: translate(0, -96px) scale(.5); } }
.jp-canim .feed-arrow { opacity: 0; transition: opacity .4s; }
.jp-canim.feed .feed-arrow { opacity: 1; }

/* Konstruktor vibriert */
.jp-canim.shake .card { animation: jp-canim-shake .5s linear 2; }
@keyframes jp-canim-shake {
    0%, 100% { transform: translate(0, 0); } 20% { transform: translate(-3px, 1px); } 40% { transform: translate(3px, -1px); }
    60% { transform: translate(-2px, -1px); } 80% { transform: translate(2px, 1px); }
}

/* Objektkarten und Schafe */
.jp-canim .obj { opacity: 0; }
.jp-canim .obj.out { animation: jp-canim-out 1.1s cubic-bezier(.3,.8,.4,1.1) forwards; }
@keyframes jp-canim-out { 0% { opacity: 0; transform: translate(-150px, -20px) scale(.35); } 30% { opacity: 1; } 100% { opacity: 1; transform: none; } }
.jp-canim .sheep { opacity: 0; transform-origin: 50% 100%; }
.jp-canim .sheep.out { animation: jp-canim-pop .7s cubic-bezier(.3,1.6,.5,1) forwards; }
@keyframes jp-canim-pop { 0% { opacity: 0; transform: translateY(-20px) scale(.3); } 100% { opacity: 1; transform: none; } }

.jp-canim .fade { transition: opacity .4s; }
.jp-canim.resetting .fade, .jp-canim.resetting .obj, .jp-canim.resetting .sheep { opacity: 0 !important; animation: none !important; transition: opacity .4s; }
@media (prefers-reduced-motion: reduce) { .jp-canim.shake .card { animation: none; } }
`;

function sheep(x: number, y: number, wool: string): string {
    // kleines Schaf, Form wie in den Lernpfaden
    const puffs = [[34, 40, 14], [50, 32, 15], [68, 34, 14], [80, 46, 12], [26, 54, 12], [44, 56, 15], [62, 56, 15], [78, 58, 11]];
    return `<g transform="translate(${x} ${y}) scale(.62)">
      <g fill="#3B3434"><rect x="34" y="62" width="7" height="20" rx="2"/><rect x="48" y="64" width="7" height="18" rx="2"/><rect x="62" y="64" width="7" height="18" rx="2"/><rect x="74" y="62" width="7" height="20" rx="2"/></g>
      ${puffs.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${wool}" stroke="currentColor" stroke-width="1.6"/>`).join("")}
      <ellipse cx="18" cy="42" rx="12" ry="14" fill="#3B3434"/>
      <ellipse cx="9" cy="33" rx="6" ry="3.5" transform="rotate(-25 9 33)" fill="#3B3434"/>
      <ellipse cx="27" cy="31" rx="6" ry="3.5" transform="rotate(25 27 31)" fill="#3B3434"/>
      <circle cx="13" cy="41" r="2.4" fill="#fff"/><circle cx="22" cy="41" r="2.4" fill="#fff"/>
    </g>`;
}

function objCard(i: number, r: Round): string {
    const x = i == 0 ? 300 : 460;
    return `
    <g class="obj anim" data-obj="${i}">
      <rect x="${x}" y="226" width="146" height="78" rx="8" fill="var(--surface, #fff)" stroke="currentColor" stroke-width="2.2"/>
      <path d="M${x} 252 L${x + 146} 252" stroke="currentColor" stroke-width="1.6"/>
      <text class="mono" x="${x + 73}" y="244" text-anchor="middle" font-size="13" font-weight="700" text-decoration="underline" style="fill:${TYPE}">${r.v} : Schaf</text>
      <text class="mono" x="${x + 10}" y="272" font-size="12.5">name = <tspan style="fill:${ORANGE}">"${r.name}"</tspan></text>
      <text class="mono" x="${x + 10}" y="292" font-size="12.5">alter = <tspan style="fill:${ORANGE}">${r.alter}</tspan></text>
    </g>
    <g class="sheep anim" data-sheep="${i}">${sheep(x + 40, 150, r.wool)}<text class="hand" x="${x + 73}" y="216" text-anchor="middle" font-size="14" font-weight="700">${r.name}</text></g>`;
}

function svgMarkup(): string {
    return `
<svg viewBox="0 0 620 360" role="img" aria-label="Animierte Skizze: Aus der Klasse Schaf entstehen mit dem Konstruktor zwei Objekte, Dolli und Helga.">
  <defs>
    <filter id="jp-canim-wobble" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="1" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <marker id="jp-canim-arrow" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M1.5 1.5 L10 6 L1.5 10.5" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <text class="hand fade" data-ref="title" x="310" y="26" text-anchor="middle" font-size="18" font-weight="700"></text>

  <!-- Klassenkarte -->
  <g class="card anim" filter="url(#jp-canim-wobble)">
    <rect x="20" y="48" width="230" height="166" rx="6" fill="var(--surface, #fff)" stroke="${TYPE}" stroke-width="2.6"/>
    <path d="M20 80 L250 80 M20 128 L250 128" stroke="${TYPE}" stroke-width="2"/>
    <rect x="20" y="48" width="230" height="32" rx="6" fill="color-mix(in srgb, ${TYPE} 14%, transparent)"/>
    <text class="mono" x="135" y="70" text-anchor="middle" font-size="16" font-weight="700" style="fill:${TYPE}">Schaf</text>
    <text class="mono" x="32" y="100" font-size="13">name: String</text>
    <text class="mono" x="32" y="119" font-size="13">alter: Integer</text>
    <rect class="ctor-row" x="22" y="134" width="226" height="28" rx="4" fill="transparent"/>
    <text class="mono" x="32" y="153" font-size="13" font-weight="700">Schaf(String n, Integer a)</text>
    <text class="mono" x="32" y="186" font-size="13">maeh()</text>
    <text class="hand" x="135" y="236" text-anchor="middle" font-size="13" opacity=".75">Klasse = Bauplan</text>
  </g>

  <!-- Becher für die Parameter -->
  <g style="color:${BLUE}" filter="url(#jp-canim-wobble)">
    <path d="M30 262 L118 262 L110 330 L38 330 Z" fill="#E7EDFF" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
    <text class="hand" x="74" y="318" text-anchor="middle" font-size="14" font-weight="700">String n</text>
    <path d="M148 262 L236 262 L228 330 L156 330 Z" fill="#E7EDFF" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
    <text class="hand" x="192" y="318" text-anchor="middle" font-size="14" font-weight="700">Integer a</text>
  </g>
  <g class="val val1 anim">
    <rect x="40" y="272" width="68" height="26" rx="6" fill="#fff" stroke="${ORANGE}" stroke-width="2"/>
    <text class="hand" data-ref="val1" x="74" y="290" text-anchor="middle" font-size="14" font-weight="700" style="fill:${ORANGE}"></text>
  </g>
  <g class="val val2 anim">
    <rect x="172" y="272" width="40" height="26" rx="6" fill="#fff" stroke="${ORANGE}" stroke-width="2"/>
    <text class="hand" data-ref="val2" x="192" y="290" text-anchor="middle" font-size="14" font-weight="700" style="fill:${ORANGE}"></text>
  </g>
  <path class="feed-arrow" d="M74 258 C 74 236, 96 212, 110 168" fill="none" stroke="${BLUE}" stroke-width="2.2" stroke-dasharray="5 4" marker-end="url(#jp-canim-arrow)"/>
  <path class="feed-arrow" d="M192 258 C 192 236, 176 212, 164 168" fill="none" stroke="${BLUE}" stroke-width="2.2" stroke-dasharray="5 4" marker-end="url(#jp-canim-arrow)"/>

  <!-- Weide: Objekte -->
  <text class="hand" x="456" y="64" text-anchor="middle" font-size="13" opacity=".75">Objekte</text>
  <path d="M290 74 L612 74" stroke="currentColor" stroke-width="1" stroke-dasharray="4 5" opacity=".35"/>
  ${ROUNDS.map((r, i) => objCard(i, r)).join("")}

  <!-- Finger, der auf den Konstruktor drückt -->
  <g class="finger anim">
    <path d="M232 150 c 0 -8 10 -8 10 0 l 0 18 c 2 -6 10 -5 10 1 c 2 -5 10 -4 10 2 c 2 -4 9 -3 9 3 l 0 18 c 0 12 -8 20 -20 20 l -6 0 c -10 0 -14 -6 -18 -12 l -10 -16 c -3 -5 3 -10 8 -5 l 7 7 Z"
          fill="#F3D2B8" stroke="currentColor" stroke-width="2" stroke-linejoin="round" filter="url(#jp-canim-wobble)"/>
  </g>

  <text class="mono fade" data-ref="call" x="310" y="352" text-anchor="middle" font-size="14"></text>
</svg>`;
}

let cssInjected = false;

/** Erzeugt die Animation; sie läuft, solange das Element im Dokument hängt. */
export function createClassAnimation(): HTMLElement {
    if (!cssInjected) {
        const st = document.createElement("style");
        st.textContent = CSS;
        document.head.appendChild(st);
        cssInjected = true;
    }
    const root = document.createElement("div");
    root.className = "jp-canim";
    root.innerHTML = svgMarkup();
    const ref = (n: string) => root.querySelector<SVGTextElement>(`[data-ref="${n}"]`)!;
    const obj = (i: number) => root.querySelector(`[data-obj="${i}"]`)!;
    const shp = (i: number) => root.querySelector(`[data-sheep="${i}"]`)!;

    let timers: any[] = [];
    const later = (ms: number, f: () => void) => timers.push(setTimeout(() => { if (root.isConnected) f(); else clear(); }, ms));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const STATES = ["point", "press", "drop1", "drop2", "feed", "shake"];

    const round = (i: number, t: number): number => {
        const r = ROUNDS[i];
        later(t, () => {
            root.classList.remove(...STATES);
            ref("title").textContent = `${i + 1}. Objekt: Konstruktor aufrufen`;
            ref("call").innerHTML = `Schaf ${r.v} = new <tspan font-weight="700">Schaf</tspan>(<tspan style="fill:${ORANGE}">"${r.name}"</tspan>, <tspan style="fill:${ORANGE}">${r.alter}</tspan>);`;
            ref("val1").textContent = `"${r.name}"`;
            ref("val2").textContent = r.alter;
        });
        later(t + 600, () => root.classList.add("point"));
        later(t + 1800, () => root.classList.add("press"));
        later(t + 2800, () => root.classList.add("drop1"));
        later(t + 4200, () => root.classList.add("drop2"));
        later(t + 5800, () => { root.classList.add("feed"); });
        later(t + 6600, () => { root.classList.add("shake"); root.classList.remove("point", "press"); });
        later(t + 7800, () => { obj(i).classList.add("out"); shp(i).classList.add("out"); ref("title").textContent = `${r.name} ist entstanden – ein eigenes Objekt`; });
        return t + 12000;
    };

    const play = () => {
        clear();
        root.classList.add("resetting");
        root.querySelectorAll(".out").forEach(e => e.classList.remove("out"));
        root.classList.remove(...STATES);
        later(500, () => root.classList.remove("resetting"));
        let t = 700;
        t = round(0, t);
        t = round(1, t);
        later(t - 3000, () => {
            root.classList.remove(...STATES);
            ref("title").textContent = "Ein Bauplan, zwei Schafe mit eigenen Werten";
        });
        later(t + 2000, play);
    };

    const start = () => root.isConnected ? play() : requestAnimationFrame(start);
    requestAnimationFrame(start);
    return root;
}
