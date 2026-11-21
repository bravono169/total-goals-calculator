'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const labels = ['0','1','2','3','4','5','6','7+'];
  const example = ['7.5','3.65','3.05','3.9','7','15','30','50'];
  const changedExample = ['10.00','4.15','3.20','3.70','6.00','12.00','21.00','30.00'];
  const percent = p => (p * 100).toFixed(2) + '%';
  const count = n => Number(n).toLocaleString('zh-CN');
  const points = p => (p > 0 ? '+' : '') + (p * 100).toFixed(2);
  const normal = text => text.normalize('NFKC').trim();
  const valid = value => /^\d+(?:\.\d*)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 1;
  const ordered = p => labels.map((_, i) => i).sort((a, b) => p[b] - p[a] || a - b);
  const element = (tag, text, css) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (css) node.className = css;
    return node;
  };
  const inputs = labels.map((name, i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.enterKeyHint = i === 7 ? 'done' : 'next';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '—';
    input.id = 'odds-' + i;
    input.setAttribute('aria-label', name + '球赔率');
    label.append(element('span', name + ' 球'), input);
    byId('grid').append(label);
    return input;
  });

  let model = null;
  let clubReference = null;
  let modelError = '';
  let pasteError = '';
  let isExample = false;
  let isChangedExample = false;

  function topTwo(probabilities) {
    const rank = ordered(probabilities);
    const cutoff = probabilities[rank[1]];
    const equal = rank.filter(i => Math.abs(probabilities[i] - cutoff) < 1e-12);
    const above = rank.filter(i => probabilities[i] - cutoff >= 1e-12);
    const ambiguous = above.length + equal.length > 2;
    const names = list => list.map(i => labels[i]).join('、') + ' 球';
    let title = names(rank.slice(0,2));
    if (ambiguous) {
      title = above.length ? names(above) + '；' + names(equal) + ' 中任选一项'
        : names(equal) + ' 中任两项';
    }
    return {rank, sum:probabilities[rank[0]] + cutoff, title, ambiguous, cutoff};
  }

  function showClub(market) {
    const group = clubReference && window.GoalHistory.clubGroup(clubReference, market);
    byId('club-panel').hidden = !group;
    if (!group) return;
    const pOver = market.slice(3).reduce((sum, p) => sum + p, 0);
    byId('club-note').textContent = '八项赔率折算的 3 球及以上概率为 ' + percent(pOver) +
      '。项目联赛库中，大小 2.5 球赔率对应大球概率落在 ' + percent(group.lo) + ' 至 ' +
      percent(group.hi) + ' 档的比赛共 ' + count(group.n) + ' 场。以下为独立参照，未参与上方八项估计。';
    const body = byId('club-frequencies');
    body.replaceChildren();
    for (let i = 0; i < 4; i++) {
      const row = body.insertRow();
      for (const j of [i, i + 4]) {
        const head = element('th', labels[j] + ' 球');
        head.scope = 'row';
        row.append(head, element('td', percent(group.probabilities[j])));
      }
    }
  }

  function showHistory(result) {
    const supported = result.supported && Array.isArray(result.probabilities);
    const market = result.market;
    const prices = topTwo(market);
    const predicted = supported ? topTwo(result.probabilities) : null;
    const noEdge = model.metrics.ci95[0] <= 0 && model.metrics.ci95[1] >= 0;
    byId('result-evidence').hidden = !supported || !noEdge;
    byId('result-evidence').textContent = '在 ' + count(model.metrics.n) + ' 场较晚比赛中，模型前两项命中 ' +
      percent(model.metrics.modelHits / model.metrics.n) + '，最低赔率两项命中 ' + percent(model.metrics.marketHits / model.metrics.n) +
      '。目前没有证据表明模型选两项更准。';
    byId('historical-lead').hidden = !supported;
    byId('reason').hidden = supported;
    byId('reason').textContent = supported ? '' : (result.reason || '这组赔率超出已检验的历史范围。') + ' 本场仅列赔率隐含概率。';
    let marketNote = '赔率最低的两项为 ' + prices.title + '，隐含概率合计 ' + percent(prices.sum) + '。';
    if (supported) {
      byId('leading-label').textContent = (isExample ? '演示报价 · ' : '') + '历史模型概率最高的两项';
      byId('winner').textContent = predicted.title;
      byId('leading-percent').textContent = '合计 ' + percent(predicted.sum);
      if (!prices.ambiguous && !predicted.ambiguous) {
        const pair = predicted.rank.slice(0,2);
        const agrees = prices.rank.slice(0,2).every(i => pair.includes(i));
        marketNote += agrees ? '两种方法选中相同的两项。' : '样本校正改变了前两项的组合。';
      }
    }
    byId('comparison').textContent = marketNote;
    byId('example-source').hidden = !isChangedExample;
    byId('example-source').textContent = isChangedExample
      ? '2026-01-03 萨索洛对帕尔马（体彩 2036604）。八项报价发布于 1 月 2 日 09:42。此场为检验期按比赛日期、编号排序后首场改选，两队最终 1 比 1，总进球 2 球，两种方法均命中。'
      : '';
    const body = byId('ranking');
    body.replaceChildren();
    const order = supported ? predicted.rank : prices.rank;
    order.forEach(i => {
      const row = body.insertRow();
      if (supported && result.probabilities[i] >= predicted.cutoff - 1e-12) row.className = 'top-row';
      const head = element('th', labels[i] + ' 球');
      head.scope = 'row';
      row.append(head, element('td', supported ? percent(result.probabilities[i]) : '—'),
        element('td', supported && Array.isArray(result.observed) ? percent(result.observed[i]) : '—'),
        element('td', percent(market[i])),
        element('td', supported ? points(result.probabilities[i] - market[i]) : '—', 'diff'));
    });
    byId('ranking-note').textContent = supported
      ? '按模型估计从高到低排列。分组实频取自 ' + count(result.sampleN) + ' 场相近八项赔率的实际赛果。¹差值为模型减赔率隐含，单位为百分点。'
      : '按赔率隐含概率排列。缺少适用的样本估计时，历史栏留空。';
    byId('announcement').textContent = supported ? '历史估计已更新，前两项为 ' + predicted.title + '。' : byId('reason').textContent;
    showClub(market);
  }

  function render() {
    const values = inputs.map(input => normal(input.value));
    const filled = values.filter(Boolean).length;
    const invalid = [];
    values.forEach((value,i) => {
      const bad = Boolean(value) && !valid(value);
      inputs[i].setAttribute('aria-invalid', String(bad));
      if (bad) invalid.push(labels[i]);
    });
    byId('count').textContent = '已填 ' + filled + ' / 8';
    byId('clear').disabled = !inputs.some(input => input.value);
    const error = pasteError || (invalid.length ? '请检查 ' + invalid.join('、') + ' 球赔率，每项须为大于 1 的十进制数。' : '');
    byId('error').textContent = error;
    byId('error').hidden = !error;
    let hint = '';
    if (error) hint = '修正输入后，这里会重新计算。';
    else if (filled < 8) hint = filled ? '再填 ' + (8 - filled) + ' 项赔率，即可查看历史估计。' : '填完八项赔率后，这里会显示历史估计。';
    else if (!model) hint = modelError || '正在载入历史统计…';
    if (!hint) {
      try {
        const result = window.GoalHistory.analyze(model, values.map(Number));
        showHistory(result);
      } catch {
        hint = '历史计算未能完成，请刷新后重试。';
      }
    }
    byId('computed').hidden = Boolean(hint);
    byId('empty').hidden = !hint;
    if (hint) {
      byId('empty').textContent = hint;
      byId('announcement').textContent = hint;
      byId('ranking').replaceChildren();
      byId('winner').textContent = '';
      byId('leading-percent').textContent = '';
      byId('club-panel').hidden = true;
    }
  }

  function load(values, sample, changed = false) {
    inputs.forEach((input, i) => { input.value = values[i] || ''; });
    isExample = sample;
    isChangedExample = changed;
    pasteError = '';
    render();
  }

  inputs.forEach((input, index) => {
    input.addEventListener('input', () => { isExample = false; isChangedExample = false; pasteError = ''; render(); });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      if (index < inputs.length - 1) inputs[index + 1].focus();
      else input.blur();
    });
    input.addEventListener('paste', event => {
      const raw = event.clipboardData?.getData('text');
      if (!raw) return;
      const values = normal(raw).split(/[\s,、;\/|]+/);
      if (values.length <= 1) return;
      event.preventDefault();
      if (values.length === 8) { load(values, false); return; }
      input.value = '';
      isExample = false;
      isChangedExample = false;
      pasteError = '识别到 ' + values.length + ' 项。请按 0 球至 7+ 球的顺序粘贴完整八项赔率。';
      render();
    });
  });
  byId('example').addEventListener('click', () => load(example, true));
  byId('changed-example').addEventListener('click', () => load(changedExample, true, true));
  byId('clear').addEventListener('click', () => { load([], false); inputs[0].focus(); });

  function describeModel() {
    const {meta, metrics} = model;
    byId('study-intro').textContent = meta.testFrom + ' 至 ' + meta.testTo + ' 有 ' + count(meta.testN) + ' 场较晚比赛，其中 ' +
      count(metrics.n) + ' 场处于样本支持范围。两种方法在这同一批比赛中各选两项，核对实际进球数是否落在其中。';
    const rows = byId('study-metrics');
    rows.replaceChildren();
    for (const [title, hits] of [['历史模型前两项',metrics.modelHits],['赔率最低两项',metrics.marketHits]]) {
      const row = element('div', '', 'study-row');
      row.append(element('span', title + ' · ' + count(hits) + ' 场命中'), element('strong', percent(hits / metrics.n)));
      rows.append(row);
    }
    rows.hidden = false;
    const [lo, hi] = metrics.ci95;
    const conclusion = lo <= 0 && hi >= 0 ? '这个区间跨过零，未显示模型有稳定的命中优势。' :
      hi < 0 ? '这批较晚比赛中模型的前两项命中率较低。' : '这批较晚比赛中模型的前两项命中率较高。';
    byId('validation-note').textContent = '命中率差 ' + points(metrics.difference) + ' 个百分点，配对差的 95% 区间为 ' +
      points(lo) + ' 至 ' + points(hi) + ' 个百分点。' + conclusion + '模型改选了 ' + count(metrics.changed) +
      ' 场的两项组合，其中仅模型命中 ' + count(metrics.modelOnly) + ' 场，仅赔率命中 ' + count(metrics.marketOnly) + ' 场。';
    byId('method').textContent = '训练期 ' + meta.trainFrom + ' 至 ' + meta.trainTo + '，共 ' + count(meta.trainN) +
      ' 场。按八项赔率的概率形状分为 ' + model.groups.length + ' 组，由近至远合并至至少 ' + count(model.minGroup) +
      ' 场。用各项实际次数与赔率预期次数的平滑比值校正本场概率，分组实频按真实赛果计数。回测并列时统一优先取进球数较小的一项。';
  }

  async function initialize() {
    try {
      if (!window.GoalHistory) throw new Error();
      const response = await fetch('./goal-history.json', {cache:'no-cache'});
      if (!response.ok) throw new Error();
      model = await response.json();
      describeModel();
    } catch {
      model = null;
      modelError = '历史样本统计未能加载，请检查网络后刷新。';
      byId('study-intro').textContent = modelError;
    }
    render();
    if (model && typeof window.GoalHistory.loadClubReference === 'function') {
      try { clubReference = await window.GoalHistory.loadClubReference(); } catch { clubReference = null; }
      if (clubReference) render();
    }
  }

  render();
  initialize();
})();
