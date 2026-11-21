/* Retrospective calibration of eight mutually exclusive total-goal outcomes. */
(function (root) {
  'use strict';

  function analyze(model, odds) {
    if (model?.version !== 1 || !Array.isArray(model.groups)) throw new Error('样本文件版本不兼容。');
    const market = root.TotalGoalOdds.calculate(odds).probabilities;
    const x = market.map(Math.sqrt);
    const ordered = model.groups.map((group, index) => ({
      group, index, distance: Math.sqrt(group.center.reduce((s, v, i) => s + (v - x[i]) ** 2, 0))
    })).sort((a, b) => a.distance - b.distance || a.index - b.index);
    if (ordered[0].distance > model.radius + 1e-12) {
      return {supported: false, reason: '这组八项报价与训练样本相距过远。', market, probabilities: null, sampleN: 0};
    }
    const counts = Array(8).fill(0), expected = Array(8).fill(0);
    let sampleN = 0;
    for (const {group} of ordered) {
      sampleN += group.n;
      group.counts.forEach((n, i) => { counts[i] += n; expected[i] += group.expected[i]; });
      if (sampleN >= model.minGroup) break;
    }
    const adjusted = market.map((p, i) => {
      const anchor = model.prior * expected[i] / sampleN;
      return p * (counts[i] + anchor) / (expected[i] + anchor);
    });
    const sum = adjusted.reduce((a, b) => a + b, 0);
    return {supported: true, market, sampleN, counts, observed: counts.map(v => v / sampleN),
      probabilities: adjusted.map(value => value / sum)};
  }

  function clubGroup(reference, market) {
    if (!reference || reference.version !== 1) return null;
    const p = Number(market.slice(3).reduce((a, b) => a + b, 0).toFixed(12));
    const [lo, hi] = reference.meta.support;
    if (p < lo || p > hi) return null;
    const index = Math.min(19, Math.floor(Number((20 * p).toFixed(10))));
    return reference.bins.find(group => group.index === index) || null;
  }

  async function loadClubReference() {
    // The public eight-SP model remains available without this personal league comparison.
    try {
      const stored = 'football.markets.personal-model-key.v1';
      let saved = '';
      try { saved = localStorage.getItem(stored) || ''; } catch { /* Private browsing. */ }
      const key = new URLSearchParams(location.hash.slice(1)).get('k') || saved;
      if (!/^[A-Za-z0-9_-]{43}$/.test(key) || !root.crypto?.subtle) return null;
      const decode = encoded => Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const response = await fetch('./club-reference.enc.json', {credentials: 'omit', referrerPolicy: 'no-referrer'});
      if (!response.ok) return null;
      const bundle = await response.json();
      if (bundle.version !== 1) return null;
      const aes = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['decrypt']);
      const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(bundle.iv)}, aes, decode(bundle.data));
      const ref = JSON.parse(new TextDecoder().decode(clear));
      if (ref.version !== 1 || !ref.meta || !Array.isArray(ref.bins)) return null;
      try { localStorage.setItem(stored, key); } catch { /* The full personal link works without storage. */ }
      return ref;
    } catch { return null; }
  }
  root.GoalHistory = {analyze, clubGroup, loadClubReference};
})(globalThis);
