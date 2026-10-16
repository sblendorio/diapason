/* piano-render.js — draws a piano keyboard (SVG) with given notes highlighted */
(function (global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const WHITE_W = 22;
  const WHITE_H = 96;
  const BLACK_W = 13;
  const BLACK_H = 58;

  const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function pc(midi) { return ((midi % 12) + 12) % 12; }
  function isWhite(midi) { return WHITE_PCS.indexOf(pc(midi)) >= 0; }

  function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        node.setAttribute(k, attrs[k]);
      }
    }
    return node;
  }

  // highlight: array of MIDI notes to light up. rootMidi (optional) is the key
  // painted with the distinct "root" color; defaults to the first note. Passing
  // it explicitly keeps the root highlighted correctly when the chord is voiced
  // as an inversion (where the root is no longer the lowest note).
  // nameByPc (optional) maps a pitch class to the correctly-spelled note name
  // for the current chord (e.g. {10: "Bb"}); lit keys use it instead of the
  // default sharp names, so accidentals are shown per music theory.
  function render(highlight, rootMidi, nameByPc, differentPcs = []) {
    const set = new Set(highlight);
    const different = new Set(differentPcs);
    const root = (typeof rootMidi === "number") ? rootMidi : highlight[0];

    function label(m) {
      const p = pc(m);
      return (nameByPc && nameByPc[p]) ? nameByPc[p] : PITCH_NAMES[p];
    }

    const min = Math.min.apply(null, highlight);
    const max = Math.max.apply(null, highlight);
    // Expand to whole octaves (C .. B) so the keyboard looks complete.
    const low = min - pc(min);
    const high = max + (11 - pc(max));

    // Count white keys for total width.
    const whites = [];
    for (let m = low; m <= high; m++) {
      if (isWhite(m)) whites.push(m);
    }
    const totalW = whites.length * WHITE_W;

    const svg = el("svg", {
      viewBox: "0 0 " + totalW + " " + WHITE_H,
      role: "img",
      "aria-label": different.size ? "piano keyboard with differing chord tones outlined" :
        "piano keyboard with chord notes highlighted",
    });

    // White keys first.
    whites.forEach(function (m, i) {
      const lit = set.has(m);
      const changed = lit && different.has(pc(m));
      svg.appendChild(el("rect", {
        x: i * WHITE_W, y: 0, width: WHITE_W, height: WHITE_H, rx: 2,
        fill: lit ? (m === root ? "#c5a577" : "#a9c5aa") : "#f1eee6",
        stroke: changed ? "#aa5a35" : "#38443a", "stroke-width": changed ? 3 : 1,
      }));
      if (lit) {
        const t = el("text", {
          x: i * WHITE_W + WHITE_W / 2, y: WHITE_H - 7,
          "text-anchor": "middle", "font-size": 9,
          fill: "#26312d", "font-weight": "700",
        });
        t.textContent = label(m);
        svg.appendChild(t);
      }
    });

    // Black keys overlaid on top.
    let whiteCount = 0;
    for (let m = low; m <= high; m++) {
      if (isWhite(m)) { whiteCount++; continue; }
      const x = whiteCount * WHITE_W - BLACK_W / 2;
      const lit = set.has(m);
      const changed = lit && different.has(pc(m));
      svg.appendChild(el("rect", {
        x: x, y: 0, width: BLACK_W, height: BLACK_H, rx: 2,
        fill: lit ? (m === root ? "#9e7f55" : "#6d9275") : "#27322d",
        stroke: changed ? "#e6a27e" : "#1b251e", "stroke-width": changed ? 2.5 : 1,
      }));
      if (lit) {
        const t = el("text", {
          x: x + BLACK_W / 2, y: BLACK_H - 6,
          "text-anchor": "middle", "font-size": 7.5,
          fill: "#f8f5eb", "font-weight": "700",
        });
        t.textContent = label(m);
        svg.appendChild(t);
      }
    }

    return svg;
  }

  global.DiapasonPiano = { render: render };
})(window);
