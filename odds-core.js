/* Complete eight-outcome decimal-SP normalization. No model fitting or EV claims. */
(function (root) {
  'use strict';
  const labels = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  const groups = {
    '0–1球': [0, 1], '2–3球': [2, 3], '3–4球': [3, 4],
    '4–5球': [4, 5], '5球及以上': [5, 6, 7], '2–4球': [2, 3, 4],
    '0–3球': [0, 1, 2, 3]
  };
  function calculate(prices) {
    if (!Array.isArray(prices) || prices.length !== 8) {
      throw new Error('须提供0、1、2、3、4、5、6、7+全部八项赔率。');
    }
    const odds = prices.map((value, i) => {
      if (value === null || value === undefined || String(value).trim() === '') {
        throw new Error('缺少' + labels[i] + '球赔率；八项完整后才能计算。');
      }
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 1) {
        throw new Error(labels[i] + '球须为大于1的十进制赔率。');
      }
      return n;
    });
    const weights = odds.map(x => 1 / x);
    const bookSum = weights.reduce((a, b) => a + b, 0);
    const probabilities = weights.map(x => x / bookSum);
    const ranking = labels.map((_, i) => i).sort((a, b) => probabilities[b] - probabilities[a] || a - b);
    const sum = indices => indices.reduce((s, i) => s + probabilities[i], 0);
    const selection = indices => ({indices, labels: indices.map(i => labels[i]), probability: sum(indices)});
    const adjacent = size => {
      const candidates = Array.from({length: 9 - size}, (_, start) =>
        Array.from({length: size}, (__, j) => start + j));
      candidates.sort((a, b) => sum(b) - sum(a) || a[0] - b[0]);
      return selection(candidates[0]);
    };
    return {
      odds, weights, bookSum, normalizingMultiplier: 1 / bookSum,
      probabilities, ranking,
      maxSingleIndices: ranking.filter(i => Math.abs(probabilities[i] - probabilities[ranking[0]]) < 1e-12),
      tieAtTop2Boundary: Math.abs(probabilities[ranking[1]] - probabilities[ranking[2]]) < 1e-12,
      tieAtTop3Boundary: Math.abs(probabilities[ranking[2]] - probabilities[ranking[3]]) < 1e-12,
      top1: selection(ranking.slice(0, 1)),
      top2: selection(ranking.slice(0, 2)), top3: selection(ranking.slice(0, 3)),
      adjacent2: adjacent(2), adjacent3: adjacent(3),
      groups: Object.fromEntries(Object.entries(groups).map(([name, indices]) => [name, selection(indices)])),
      tailToZeroRatio: odds[0] / odds[7],
      interpretation: 'Market-implied probabilities under proportional normalization; not calibrated true probabilities.'
    };
  }
  const api = {labels, groups, calculate};
  root.TotalGoalOdds = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
