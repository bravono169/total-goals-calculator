/* Official three-way handicap estimates from two recorded pre-match SP vectors. */
(function (root) {
  'use strict';
  const tolerance = 1e-9;
  const unavailable = reason => ({
    supported: false, mode: null, reason, probabilities: null, observed: null, sampleN: 0,
    marketMean: null, marginCounts: null, observedMargins: null
  });

  function market(prices) {
    if (!Array.isArray(prices) || prices.length !== 3 ||
        !prices.every(value => Number.isFinite(value) && value > 1)) return null;
    const weights = prices.map(v => 1 / v);
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }

  function analyze(model, openLine, openOdds, nowLine, nowOdds) {
    const op = market(openOdds);
    const now = market(nowOdds);
    if (!op || !now || !Number.isInteger(openLine) || !Number.isInteger(nowLine) ||
        Math.abs(openLine) > 5 || Math.abs(nowLine) > 5) {
      return unavailable('两档官方盘口和三项十进制 SP 均须有效。');
    }
    if (openLine !== nowLine) {
      return unavailable('两档官方让球数不同，目前缺少同类换线样本。');
    }
    const fit = model?.lines?.[String(nowLine)];
    if (model?.version !== 1 || !fit) {
      return unavailable('该整数盘的双时点官方 SP 训练样本不足。');
    }
    const level = [Math.log(now[0] / now[2]), Math.log(now[1] / now[2])];
    const x = [...level, ...level.map((l, i) => l - Math.log(op[i] / op[2]))];
    if (!x.every((v, i) => Number.isFinite(v) && v >= fit.min[i] - tolerance && v <= fit.max[i] + tolerance)) {
      return unavailable('官方 SP 水平或两档变化幅度超出该整数盘的历史训练范围。');
    }
    const z = x.map((v, i) => (v - fit.center[i]) / fit.scale[i]);
    const ordered = fit.cells.map((cell, i) => ({
      cell, i, distance: Math.sqrt(cell.center.reduce((s, c, j) => s + (c - z[j]) ** 2, 0))
    })).sort((a, b) => a.distance - b.distance || a.i - b.i);
    if (ordered[0].distance > fit.radius + tolerance) {
      return unavailable('两档官方 SP 的组合与该整数盘已验证的报价相距过远。');
    }
    const design = [1, ...z];
    const logit = now.map((p, i) => design.reduce((s, v, j) => s + v * fit.paired[j][i], Math.log(p)));
    const max = Math.max(...logit);
    const exp = logit.map(v => Math.exp(v - max));
    const total = exp.reduce((a, b) => a + b, 0);
    const probabilities = exp.map(v => v / total);
    const marginCounts = Array(13).fill(0);
    const sum = [0, 0, 0];
    let sampleN = 0;
    for (const {cell} of ordered) {
      sampleN += cell.n;
      cell.margins.forEach((n, i) => { marginCounts[i] += n; });
      cell.marketSum.forEach((s, i) => { sum[i] += s; });
      if (sampleN >= model.minGroup) break;
    }
    const observedMargins = marginCounts.map(v => v / sampleN);
    const observed = [0, 0, 0];
    observedMargins.forEach((p, i) => { observed[1 - Math.sign(i - 6 + nowLine)] += p; });
    return {supported:true, mode:'paired', reason:'', probabilities, observed, sampleN,
      marketMean:sum.map(v => v / sampleN), marginCounts, observedMargins};
  }

  root.HhadHistory = {analyze};
})(globalThis);
