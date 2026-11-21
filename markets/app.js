'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const make = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const signed = n => n > 0 ? '+' + n : String(n);
  const pct = p => Number.isFinite(p) ? (p * 100).toFixed(2) + '%' : '—';
  const count = n => n.toLocaleString('zh-CN');
  const wdlNames = ['主胜', '平局', '客胜'];
  const officialNames = ['让胜', '让平', '让负'];
  const form = byId('quotes');
  const fieldNames = new Map();
  let model;
  let loadError = '';
  let officialError = '';
  let exampleActive = false;
  let selectedReplay = null;

  function field(id, title) {
    const input = make('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.id = id;
    input.spellcheck = false;
    input.placeholder = '—';
    input.setAttribute('aria-label', title);
    fieldNames.set(id, title);
    return input;
  }

  function threeWay(container, names, times) {
    container.append(make('span'));
    names.forEach(name => container.append(make('span', name, 'col')));
    for (const [prefix, short, title] of times) {
      container.append(make('span', short, 'row-title'));
      names.forEach((name, i) => container.append(field(prefix + i, title + name + '赔率')));
    }
  }

  function line(container, id, labelText, step, ariaLabel = labelText) {
    const wrapper = make('div', undefined, 'line-input');
    const label = make('label', labelText);
    label.htmlFor = id;
    const select = make('select');
    select.id = id;
    select.setAttribute('aria-label', ariaLabel);
    fieldNames.set(id, ariaLabel);
    select.append(new Option('选择盘口', ''));
    const values = [0];
    for (let n = step; n <= 5; n += step) values.push(-n, n);
    values.forEach(n => select.append(new Option(signed(n) + (n < 0 ? ' 主让' : n > 0 ? ' 主受' : ' 平手'), String(n))));
    wrapper.append(label, select);
    container.append(wrapper);
  }

  threeWay(byId('euro-fields'), wdlNames, [['eo', '初盘', '欧赔初盘'], ['en', '即时', '欧赔即时']]);
  [['fo', '初盘'], ['fn', '即时盘']].forEach(([prefix, time]) => {
    const slot = make('div', undefined, 'ah-fields');
    const row = make('div', undefined, 'official-row');
    line(row, prefix + '-line', '主队让球', 1, '官方' + time + '主队让球');
    officialNames.forEach((name,i) => {
      const label = make('label', name);
      label.append(field(prefix + i, '官方' + time + name + ' SP'));
      row.append(label);
    });
    slot.append(make('p', time, 'ah-title'), row);
    byId('official-fields').append(slot);
  });
  [['ao', '初盘'], ['an', '即时盘']].forEach(([prefix, time]) => {
    const slot = make('div', undefined, 'ah-fields');
    const row = make('div', undefined, 'ah-row');
    line(row, prefix + '-line', '主队盘口', .25, '亚盘' + time + '主队盘口');
    for (const [side, labelText] of [['home', '主队水位'], ['away', '客队水位']]) {
      const label = make('label', labelText);
      label.append(field(prefix + '-' + side, '亚盘' + time + labelText));
      row.append(label);
    }
    slot.append(make('p', time, 'ah-title'), row);
    byId('asian-fields').append(slot);
  });

  function status(message, error = false) {
    byId('form-status').textContent = message;
    byId('form-status').classList.toggle('error', error);
  }

  function hideResult(message) {
    byId('output').replaceChildren();
    byId('output').hidden = true;
    byId('empty').hidden = false;
    byId('empty').textContent = message;
    byId('sample-tag').hidden = true;
  }

  function resetState(changed) {
    hideResult(changed ? '赔率已更新，点击「开始分析」查看本组报价的结果。' : '填完三组赛前报价，点击「开始分析」查看方向和概率。');
    if (loadError) status(loadError, true);
    else if (model) status('');
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  }
  form.addEventListener('input', () => { exampleActive = false; resetState(true); });
  form.addEventListener('change', () => { exampleActive = false; resetState(true); });
  byId('clear').addEventListener('click', () => {
    form.reset();
    exampleActive = false;
    resetState(false);
    byId('eo0').focus();
  });
  byId('example').addEventListener('click', () => {
    selectedReplay = model?.example || null;
    const data = selectedReplay?.quotes || {
      euroOpen:[2.02,3.35,3.85], euroNow:[1.92,3.45,4.15],
      officialOpen:{line:-1,odds:[3.90,3.45,1.73]}, officialNow:{line:-1,odds:[3.70,3.45,1.77]},
      ahOpen:{line:-.25,home:.82,away:1.04}, ahNow:{line:-.5,home:.95,away:.93}
    };
    for (const [prefix, prices] of [['eo',data.euroOpen],['en',data.euroNow],['fo',data.officialOpen.odds],['fn',data.officialNow.odds]]) {
      prices.forEach((value, i) => { byId(prefix + i).value = value; });
    }
    for (const [prefix, quote] of [['fo',data.officialOpen],['fn',data.officialNow],['ao',data.ahOpen],['an',data.ahNow]]) {
      byId(prefix + '-line').value = String(quote.line);
      if (quote.home !== undefined) {
        byId(prefix + '-home').value = quote.home;
        byId(prefix + '-away').value = quote.away;
      }
    }
    resetState(true);
    exampleActive = true;
    if (model) status((selectedReplay?.title || '示例') + '报价已填入，点击「开始分析」查看结果。');
  });

  function readInputs() {
    const numbers = {};
    let firstError;
    for (const [id, title] of fieldNames) {
      const el = byId(id);
      const text = el.value.normalize('NFKC').trim();
      const n = Number(text);
      const isLine = el.tagName === 'SELECT';
      const water = id.endsWith('-home') || id.endsWith('-away');
      const valid = text && Number.isFinite(n) && (isLine || (/^\d*(?:\.\d*)?$/.test(text) && n > (water ? 0 : 1)));
      if (!valid) {
        el.setAttribute('aria-invalid', 'true');
        if (!firstError) firstError = {el, message: !text ? '请填写' + title + '。'
          : title + (water ? '须为大于 0 的净水位。' : '须为大于 1 的十进制赔率。')};
      } else {
        el.removeAttribute('aria-invalid');
        numbers[id] = n;
      }
    }
    if (firstError) {
      firstError.el.focus();
      throw new Error(firstError.message);
    }
    const triple = prefix => [0, 1, 2].map(i => numbers[prefix + i]);
    const asian = prefix => ({line: numbers[prefix + '-line'], home: numbers[prefix + '-home'], away: numbers[prefix + '-away']});
    const official = prefix => ({line:numbers[prefix + '-line'], odds:triple(prefix)});
    return {euroOpen: triple('eo'), euroNow: triple('en'), officialOpen: official('fo'), officialNow: official('fn'),
      ahOpen: asian('ao'), ahNow: asian('an')};
  }

  function ranked(probs) {
    return probs.map((_, i) => i).sort((i, j) => probs[j] - probs[i] || i - j);
  }

  function lead(probs, labels) {
    const max = Math.max(...probs);
    const names = labels.filter((_, i) => Math.abs(probs[i] - max) < 1e-12);
    const container = make('div', undefined, 'lead');
    container.append(make('strong', (names.length > 1 ? '并列 · ' : '') + names.join('、')),
      make('span', (names.length > 1 ? '各 ' : '') + pct(max)));
    return container;
  }

  function topNames(probs, labels) {
    return labels.filter((_, i) => Math.max(...probs) - probs[i] < 1e-12).join('、');
  }

  function table(caption, columns, rows) {
    const tbl = make('table');
    tbl.setAttribute('aria-label', caption);
    const head = tbl.createTHead().insertRow();
    columns.forEach(text => {
      const th = make('th', text);
      th.scope = 'col';
      head.append(th);
    });
    const body = tbl.createTBody();
    rows.forEach(({label, values, highlight}) => {
      const tr = body.insertRow();
      if (highlight) tr.className = 'draw';
      const th = make('th', label);
      th.scope = 'row';
      tr.append(th);
      values.forEach(value => tr.append(make('td', typeof value === 'string' ? value : pct(value))));
    });
    return tbl;
  }

  function item(title) {
    const block = make('section', undefined, 'item');
    block.append(make('h3', title));
    return block;
  }

  function drawNote(p) {
    const higher = p.filter(v => v - p[1] > 1e-12).length;
    const gap = (Math.max(...p) - p[1]) * 100;
    return '平局 ' + pct(p[1]) + (higher ? '，排第 ' + (higher + 1) + '，距首位 ' + gap.toFixed(2) + ' 个百分点。' : '，排在首位。');
  }

  function drawReference(probability, mode) {
    const bins = model.meta?.holdout?.[mode]?.drawCalibration;
    const bin = bins?.find(row => probability >= row.low && probability < row.high);
    if (!bin?.n) return '';
    const lower = Math.round(bin.low * 100);
    const upper = Math.round(bin.high * 100);
    const size = Number(bin.n).toLocaleString('zh-CN');
    const range = upper === 100 ? lower + '% 及以上' : lower + '% 至低于 ' + upper + '%';
    const lead = '本场平局估计落在 ' + range + ' 档。较晚检验期的同档比赛有 ' + size + ' 场';
    return lead + (bin.n < 30 ? '，样本较少。' : '，实际打平 ' + pct(bin.actual) + '。');
  }

  function ordinaryResult({wdl, marketWdl, openWdl, info, cohort, officialCross}) {
    const first = item('胜平负方向');
    first.append(lead(wdl, wdlNames), make('p', drawNote(wdl), 'caption'));
    const reference = drawReference(wdl[1], info?.mode);
    if (reference) first.append(make('p', reference, 'draw-reference'));
    const rows = ranked(wdl).map(i => ({label:wdlNames[i], values:[wdl[i], cohort?.wdl[i], openWdl[i], marketWdl[i]], highlight:i === 1}));
    first.append(table('胜平负估计与历史实频', ['赛果', '方向概率', '同组实频', '初盘隐含', '即时隐含'], rows));
    if (info?.scope) first.append(make('p', info.scope + (info.n > 0 ? '，拟合 ' + count(info.n) + ' 场。' : '。') +
      (cohort ? '同组实频来自 ' + count(cohort.n) + ' 场相近' + (cohort.mode === 'full' ? '欧亚' : '欧赔') + '报价的实际赛果。' : ''), 'caption'));
    if (officialCross?.wdl) {
      const p = officialCross.wdl;
      const same = topNames(p, wdlNames) === topNames(wdl, wdlNames);
      first.append(make('p', '官方 SP 相近的 ' + count(officialCross.n) + ' 场中，' +
        wdlNames.map((label, i) => label + ' ' + pct(p[i])).join('、') + '。实频最高为' +
        topNames(p, wdlNames) + (same ? '，与本场首选一致。' : '，与本场首选有分歧。'), same ? 'caption' : 'warning'));
    }
    return first;
  }

  function officialResult({official, officialOpenMarket, histOfficial, hhad}, inputs) {
    const opening = inputs.officialOpen.line, now = inputs.officialNow.line;
    const paired = hhad?.supported && Array.isArray(hhad.probabilities);
    const second = item('官方让球胜平负方向');
    const main = paired ? hhad.probabilities : (histOfficial || official);
    const method = paired ? '官方 SP 历史样本估计' : (histOfficial ? '欧亚模型净胜球估计' : '即时官方 SP 隐含概率');
    second.append(lead(main, officialNames), make('p', '即时主队盘口 ' + signed(now) + ' 球，按' +
      method + '排序。', 'caption'));
    const orows = ranked(main).map(i => ({label:officialNames[i], values:[main[i], hhad?.observed?.[i], official[i], histOfficial?.[i]], highlight:i === 1}));
    second.append(table('即时官方让球三项估计与历史实频', ['赛果','方向概率','同组实频','即时隐含','欧亚估计'], orows));
    if (paired) {
      second.append(make('p', '同组实频取自 ' + count(hhad.sampleN) + ' 场历史比赛，按即时官方让球数结算。', 'caption'));
      const m = model.hhad?.metrics;
      if (m?.n) {
        const evidence = '在 ' + count(m.n) + ' 场较晚比赛上，双档模型首选命中 ' +
          pct(m.modelHits / m.n) + '，直接选即时 SP 最低项命中 ' + pct(m.marketHits / m.n) + '。';
        const interval = m.ci95;
        second.append(make('p', evidence + (interval && interval[0] <= 0 && interval[1] >= 0
          ? '目前尚未证实双档模型首选命中率更高。' : ''), 'draw-reference'));
      }
    }
    if (officialError || hhad?.reason) second.append(make('p', officialError || hhad.reason, 'warning'));
    if (topNames(main, officialNames) !== topNames(official, officialNames)) {
      second.append(make('p', '样本首选与即时官方 SP 有分歧。即时 SP 更看好' + topNames(official, officialNames) + '（' + pct(Math.max(...official)) + '）。', 'warning'));
    }
    const sameLine = opening === now;
    const fmt = delta => (delta > 0 ? '+' : '') + (100 * delta).toFixed(2);
    const quoteRows = officialNames.map((label, i) => ({
      label, values:sameLine ? [officialOpenMarket[i], official[i], fmt(official[i] - officialOpenMarket[i])] : [officialOpenMarket[i], official[i]], highlight:i === 1
    }));
    const headers = ['赛果', '初盘 ' + signed(opening), '即时 ' + signed(now)];
    if (sameLine) headers.push('差值¹');
    second.append(make('h4', '两档官方 SP 的隐含概率'), table('两档官方 SP 的隐含概率', headers, quoteRows));
    const note = sameLine ? '¹即时减初盘，单位为百分点。' :
      '主队让球数已从 ' + signed(opening) + ' 改为 ' + signed(now) + '。同一项名称对应的净胜球条件已改变，两列按各自盘口解读。';
    second.append(make('p', note, sameLine ? 'caption' : 'warning'));
    if (sameLine && inputs.officialOpen.odds.every((price, i) => price === inputs.officialNow.odds[i])) {
      second.append(make('p', '两档 SP 完全相同。历史校准检验采用至少两次有独立发布时间的官方报价。仅凭两次读数相同，仍无法确认官方曾重新发布。', 'caption'));
    }
    return second;
  }

  function asianResult({ah, cohort, officialCross}, inputs) {
    const third = item('亚洲让球盘方向');
    if (ah && Array.isArray(ah.favorable)) {
      third.append(lead(ah.favorable, ['主队', '客队']), make('p', '即时主队盘口 ' + signed(inputs.ahNow.line) + ' 球，方向按赢全或赢半的合计概率排序。', 'caption'));
      const arows = ['赢全', '赢半', '走盘', '输半', '输全'].map((label, i) => ({label, values:[ah.home[i], cohort?.ahHome[i], ah.away[i], cohort?.ahAway[i]], highlight:i === 2}));
      third.append(table('即时亚盘五种结算概率与实频', ['结算', '主队估计', '主队实频', '客队估计', '客队实频'], arows));
      if (cohort) third.append(make('p', '实频来自 ' + count(cohort.n) + (cohort.mode === 'full'
        ? ' 场即时亚盘线相同、欧亚报价相近的历史比赛。'
        : ' 场欧赔相近的比赛，按本场即时亚盘重新结算。'), 'caption'));
    } else {
      third.append(make('p', '这组输入缺少足够的历史支持，亚盘方向暂缺。', 'caption'));
    }
    if (officialCross?.ah) {
      const [h, a] = officialCross.ah.favorable;
      const higher = topNames([h, a], ['主队', '客队']);
      const different = ah && topNames(ah.favorable, ['主队', '客队']) !== higher;
      third.append(make('p', '另取仅按官方 SP 分组的 ' + count(officialCross.n) + ' 场实际 90 分钟比分，假设均按本场即时亚盘结算，主队赢全或赢半 ' +
        pct(h) + '，客队 ' + pct(a) + '。' + (different ? '同组实频方向与欧亚估计有分歧。' : ''), different ? 'warning' : 'caption'));
    }
    return third;
  }

  function render(result, inputs) {
    const output = byId('output');
    output.replaceChildren(ordinaryResult(result), officialResult(result, inputs), asianResult(result, inputs));
    if (exampleActive && selectedReplay) {
      const e = selectedReplay;
      const detail = make('details', undefined, 'notes replay');
      const score = Array.isArray(e.score) ? e.score.join('∶') : e.score;
      detail.append(make('summary', e.title + ' · 历史报价回放'),
        make('p', '开球 ' + e.kickoff + '。官方初盘发布于 ' + e.openTime + '，即时档发布于 ' + e.nowTime +
          '。欧亚盘口使用同场较早报价与收盘报价。实际 90 分钟比分为 ' + score + '。'));
      output.prepend(detail);
    }
    const {info} = result;
    const warnings = Array.isArray(info?.warning) ? info.warning : [info?.warning];
    warnings.filter(Boolean).forEach(w => output.append(make('p', w, 'warning')));
    output.hidden = false;
    byId('empty').hidden = true;
    byId('sample-tag').hidden = !exampleActive;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!model) return;
    try {
      const input = readInputs();
      render(window.MatchMarkets.analyze(model, input), input);
      status('已按当前报价完成分析。');
      byId('result-heading').focus({preventScroll:true});
      if (window.matchMedia('(max-width: 799px)').matches) byId('result-heading').scrollIntoView({block:'start'});
    } catch (err) {
      hideResult('请核对输入后再次分析。');
      status(err.message, true);
    }
  });

  function describeModel(meta) {
    if (!meta) return;
    const n = value => Number(value).toLocaleString('zh-CN');
    if (meta.fullTrainN && meta.holdout?.full?.evaluated) {
      byId('study-note').textContent = '历史报价来自 Football-Data 的 Bet365 数据，涵盖 ' + meta.leagues.length
        + ' 项联赛。欧赔与亚盘组合使用 ' + n(meta.fullTrainN) + ' 场拟合，另在 ' + meta.testFrom
        + ' 至 ' + meta.testTo + ' 的 ' + n(meta.holdout.full.evaluated)
        + ' 场支持范围内比赛上检验。历史采样分为较早报价和收盘报价，与你填写的首个挂牌价或赛前即时价可能存在时间差。其他公司或赛事的适用性需另行检验。';
    }
    const metrics = meta.holdout?.full;
    if ([metrics?.wdlLogLoss, metrics?.marketLogLoss, metrics?.drawPred, metrics?.drawActual].every(Number.isFinite)) {
      byId('holdout-note').textContent = '时间检验集上，平均估算平局 ' + pct(metrics.drawPred) + '，实际平局 '
        + pct(metrics.drawActual) + '。胜平负对数损失为 ' + metrics.wdlLogLoss.toFixed(4)
        + '，同期欧赔基准 ' + metrics.marketLogLoss.toFixed(4) + '（越低越好）。';
    }
  }

  async function start() {
    try {
      if (!window.loadPersonalMarketModel || !window.MatchMarkets) throw new Error('页面组件加载失败，请刷新个人入口。');
      model = await window.loadPersonalMarketModel();
      try {
        if (!window.HhadHistory) throw new Error();
        const response = await fetch('./hhad-model.json', {cache:'no-cache'});
        if (!response.ok) throw new Error();
        const official = await response.json();
        if (!official.meta || !official.metrics) throw new Error();
        model.hhad = official;
        const {meta, metrics} = official;
        const gap = (100 * metrics.difference).toFixed(2);
        byId('official-study-note').textContent = '官方双档 SP 历史仅纳入同场有至少两个不同赛前发布时间的比赛，以较早的 ' +
          count(meta.usedTrainN ?? meta.trainN) + ' 场比赛拟合。' + meta.testFrom + ' 至 ' + meta.testTo + '，在 ' +
          count(meta.testN) + ' 场较晚比赛中有 ' + count(metrics.n) + ' 场满足检验条件。就这 ' + count(metrics.n) +
          ' 场而言，模型首选命中 ' + metrics.modelHits + ' 场，即时 SP 首选命中 ' + metrics.marketHits +
          ' 场，模型命中率减即时 SP 命中率为 ' + gap + ' 个百分点。' + (metrics.ablation?.n
          ? '只用即时 SP 拟合的对照模型首选命中 ' + pct(metrics.ablation.marketHits / metrics.ablation.n) + '。' : '') +
          '这批比赛的实际让平率为 ' + pct(metrics.drawActual) + '，模型平均估计为 ' + pct(metrics.drawPred) + '。' +
          '历史即时档采用开球前最后一次官方发布的报价，较早查询时可能仍会调价。';
      } catch {
        model.hhad = null;
        officialError = '官方双档历史参数未能加载。请刷新后重试。当前可查看官方隐含概率及欧亚模型对照。';
        byId('official-study-note').textContent = officialError;
      }
      describeModel(model.meta);
      byId('analyze').disabled = false;
      status('');
    } catch (err) {
      loadError = err.message;
      status(loadError, true);
      hideResult(loadError);
    }
  }
  start();
})();
