// Historical goal-difference estimator for the local personal parameter file.
(() => {
  'use strict';
  const tolerance = 1e-9;
  const goodPrice = x => typeof x === 'number' && Number.isFinite(x) && x > 1;
  const goodTriple = a => Array.isArray(a) && a.length === 3 && a.every(goodPrice);
  const goodAsian = a => a && typeof a.line === 'number' && Number.isInteger(a.line * 4)
    && Math.abs(a.line) <= 5 && goodPrice(a.home) && goodPrice(a.away);
  const inBounds = (x, low, high) => Number.isFinite(x) && x >= low - tolerance && x <= high + tolerance;
  const inside = (values, lows, highs) => values.every((v, i) => inBounds(v, lows[i], highs[i]));
  const noEstimate = warnings => ({supported:false, margins:null, wd:null, mode:null, warnings});

  function features(raw, mode) {
    const [h, d, a, hc, dc, ac, line, home, away, lineC, homeC, awayC] = raw;
    const strength = Math.log(a / h), strengthC = Math.log(ac / hc);
    const draw = (Math.log(h) + Math.log(a)) / 2 - Math.log(d);
    const drawC = (Math.log(hc) + Math.log(ac)) / 2 - Math.log(dc);
    const values = [strengthC, drawC, strength - strengthC, draw - drawC, strengthC ** 2];
    if (mode === 'full') {
      const water = Math.log(away / home), waterC = Math.log(awayC / homeC);
      values.push(lineC, waterC, line - lineC, water - waterC);
    }
    return values;
  }

  function supported(raw, feature, fit, mode) {
    if (!inside(raw, fit.rawMin, fit.rawMax) || !inside(feature, fit.featureMin, fit.featureMax)) return false;
    if (mode !== 'full') return true;
    return [[6, 2, 0], [9, 5, 3]].every(([i, a, h]) => {
      const [slope, intercept, min, max] = fit.agreement[String(i)];
      return inBounds(raw[i] - slope * Math.log(raw[a] / raw[h]) - intercept, min, max);
    });
  }

  function probabilities(x, weights, base) {
    const logits = weights[0].map((_, j) =>
      x.reduce((sum, v, i) => sum + v * weights[i][j], base ? base[j] : 0));
    const max = Math.max(...logits);
    const exp = logits.map(v => Math.exp(v - max));
    const sum = exp.reduce((a,b) => a + b, 0);
    return exp.map(v => v / sum);
  }

  function observedCohort(cohorts, mode, line, x) {
    const data = mode === 'full' ? cohorts?.full?.[String(Math.round(line * 4))] : cohorts?.euro;
    if (!data) return null;
    const neighbors = data.centers.map(g => ({
      group: g, distance: Math.sqrt(g.x.reduce((s, v, i) => s + (v - x[i]) ** 2, 0))
    })).sort((a, b) => a.distance - b.distance);
    if (!neighbors.length || neighbors[0].distance > data.radius + tolerance) return null;
    const counts = Array(13).fill(0);
    let n = 0;
    for (const {group} of neighbors) {
      n += group.n;
      group.counts.forEach((v, i) => { counts[i] += v; });
      if (n >= cohorts.minN) break;
    }
    return n >= cohorts.minN ? {n, margins: counts.map(v => v / n)} : null;
  }

  function predict(model, input) {
    if (model?.version !== 1 || !model.models?.full || !model.models?.euro) {
      return noEstimate(['个人样本参数未加载。']);
    }
    const {earlyWdl, currentWdl, earlyAh, currentAh} = input || {};
    if (!goodTriple(earlyWdl) || !goodTriple(currentWdl)) return noEstimate(['请填写两组有效的胜平负十进制赔率。']);
    const euro = [...earlyWdl, ...currentWdl];
    const warnings = [];
    const both = goodAsian(earlyAh) && goodAsian(currentAh);
    const full = both ? [...euro, earlyAh.line, earlyAh.home, earlyAh.away, currentAh.line, currentAh.home, currentAh.away] : [];
    if (!both && (earlyAh || currentAh)) warnings.push('亚盘的两组数据不完整或超出支持盘线，历史估计采用双时点欧赔。');

    for (const mode of both ? ['full', 'euro'] : ['euro']) {
      const fit = model.models[mode];
      const raw = mode === 'full' ? full : euro;
      const feature = features(raw, mode);
      if (!supported(raw, feature, fit, mode)) {
        warnings.push(mode === 'full'
          ? '欧亚盘口组合超出历史训练范围，尝试以双时点欧赔估计。'
          : '欧赔水平或报价变动超出历史训练范围，本场缺少可验证的历史估计。');
        continue;
      }
      const x = [1, ...feature.map((v,i) => (v - fit.center[i]) / fit.scale[i])];
      const wd = probabilities(x, fit.heads.wdl, currentWdl.map(v => -Math.log(v)));
      const home = probabilities(x, fit.heads.home).map(v => v * wd[0]);
      const away = probabilities(x, fit.heads.away).map(v => v * wd[2]);
      const margins = [...away.reverse(), wd[1], ...home];
      if (!margins.every(Number.isFinite)) return noEstimate(['参数与当前版本不匹配。']);
      if (mode === 'full') {
        const count = fit.lineCounts[String(Math.round(currentAh.line * 4))] || 0;
        if (count < 100) warnings.push('该即时让球线仅有 ' + count + ' 场训练记录，方向判断存在较大不确定性。');
      }
      const cohort = observedCohort(model.cohorts, mode, currentAh?.line, x.slice(1));
      return {supported:true, mode, warnings, wd, margins, cohort};
    }
    return noEstimate(warnings);
  }
  const api = {predict};
  globalThis.HistoryMargin = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
