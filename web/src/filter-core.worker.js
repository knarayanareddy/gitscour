// W4 §3.7 — filter/search/sort Web Worker. Thin transport shell around
// filter-core.mjs (the same module App.jsx uses synchronously as fallback).
//
// Init: main posts the parsed packed object once (structured clone); the
// worker unpacks its own LIGHT row projection — fields needed for filtering
// only — so the main thread never re-runs the pipeline while the worker is up.

import { unpackLight, filterOrdinals } from './filter-core.mjs';

let light = null;
let index = null;
let majors = null;

self.onmessage = (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === 'init') {
      light = unpackLight(msg.packed);
      majors = new Set(msg.majors || []);
      if (msg.index) index = msg.index;
      self.postMessage({ type: 'ready', rows: light.length });
      return;
    }
    if (msg.type === 'index') {
      index = msg.index;
      return;
    }
    if (msg.type === 'filter') {
      const ordinals = light
        ? filterOrdinals(light, index, msg.opts, majors)
        : [];
      self.postMessage({ type: 'result', reqId: msg.reqId, key: msg.key, ordinals });
      return;
    }
  } catch (err) {
    // A malformed request must never kill the worker silently: report and keep
    // serving (main thread falls back to the sync path on 'error' messages).
    self.postMessage({ type: 'error', reqId: msg.reqId, message: String((err && err.message) || err) });
  }
};
