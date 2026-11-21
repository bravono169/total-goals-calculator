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
  const wdlNames = ['主胜', '平局', '客胜'];
  const officialNames = ['让胜', '让平', '让负'];
  const form = byId('quotes');
  const fieldNames = new Map();
  let model;
  let loadError = '';
  let exampleActive = false;

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
  line(byId('official-line'), 'off-line', '官方主队让球数', 1);
  threeWay(byId('official-fields'), officialNames, [['of', '官方', '竞彩官方']]);
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
    const values = {
      eo0:'2.02', eo1:'3.35', eo2:'3.85', en0:'1.92', en1:'3.45', en2:'4.15',
      'off-line':'-1', of0:'3.90', of1:'3.45', of2:'1.73',
      'ao-line':'-0.25', 'ao-home':'0.82', 'ao-away':'1.04',
      'an-line':'-0.5', 'an-home':'0.95', 'an-away':'0.93'
    };
    Object.entries(values).forEach(([id, value]) => { byId(id).value = value; });
    resetState(true);
    exampleActive = true;
    if (model) status('示例已填入，点击「开始分析」查看这组演示报价。');
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
    return {euroOpen: triple('eo'), euroNow: triple('en'), officialLine: numbers['off-line'], official: triple('of'),
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
      values.forEach(p => tr.append(make('td', pct(p))));
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

  function render(result, inputs) {
    const {wdl, marketWdl, openWdl, official, histOfficial, ah, info} = result;
    const output = byId('output');
    const first = item('胜平负方向');
    first.append(lead(wdl, wdlNames), make('p', drawNote(wdl), 'caption'));
    const reference = drawReference(wdl[1], info?.mode);
    if (reference) first.append(make('p', reference, 'draw-reference'));
    const rows = ranked(wdl).map(i => ({label:wdlNames[i], values:[wdl[i], openWdl[i], marketWdl[i]], highlight:i === 1}));
    first.append(table('胜平负估计及欧赔对照', ['赛果', '方向概率', '初盘隐含', '即时隐含'], rows));
    if (info?.scope) first.append(make('p', info.scope + (info.n > 0 ? ' · ' + Number(info.n).toLocaleString('zh-CN') + ' 场' : ''), 'caption'));
    const second = item('官方让球胜平负方向');
    const main = histOfficial || official;
    second.append(lead(main, officialNames), make('p', '主队盘口 ' + signed(inputs.officialLine) + ' 球，按' +
      (histOfficial ? '历史净胜球估计排序。' : '官方 SP 隐含概率排序，本场历史估计超出样本范围。'), 'caption'));
    if (histOfficial) {
      const topNames = probabilities => officialNames.filter((_, i) =>
        Math.max(...probabilities) - probabilities[i] < 1e-12).join('、');
      const marketTop = topNames(official);
      const agree = topNames(histOfficial) === marketTop;
      const prefix = agree ? '官方 SP 同样看好' : '两个首选有分歧，官方 SP 更看好';
      second.append(make('p', prefix + marketTop + '（' + pct(Math.max(...official)) + '）。', agree ? 'caption' : 'warning'));
    }
    const orows = ranked(main).map(i => ({label:officialNames[i], values:[histOfficial?.[i], official[i]], highlight:i === 1}));
    second.append(table('让球方向及官方赔率对照', ['赛果', '历史估计', '官方隐含'], orows));
    second.append(make('p', '官方 SP 与赛果的可靠配对数量不足以单独校准。', 'caption'));
    const third = item('亚洲让球盘方向');
    if (ah && Array.isArray(ah.favorable)) {
      third.append(lead(ah.favorable, ['主队', '客队']), make('p', '即时主队盘口 ' + signed(inputs.ahNow.line) + ' 球，方向按赢全或赢半的合计概率排序。', 'caption'));
      const arows = ['赢全', '赢半', '走盘', '输半', '输全'].map((label, i) => ({label, values:[ah.home[i], ah.away[i]], highlight:i === 2}));
      third.append(table('即时亚盘五种结算概率', ['结算', '主队', '客队'], arows));
    } else {
      third.append(make('p', '这组输入缺少足够的历史支持，亚盘方向暂缺。', 'caption'));
    }
    output.replaceChildren(first, second, third);
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
