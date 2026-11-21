'use strict';

(() => {
  const byId = id => document.getElementById(id);
  if (!window.TotalGoalOdds) {
    byId('empty').textContent = '计算模块加载失败，请刷新页面重试。';
    byId('example').disabled = true;
    return;
  }
  const { labels, calculate } = window.TotalGoalOdds;
  const example = ['7.5', '3.65', '3.05', '3.9', '7', '15', '30', '50'];
  const percent = value => (value * 100).toFixed(2) + '%';
  const normal = value => value.normalize('NFKC').trim();
  const valid = value => /^\d+(\.\d*)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 1;
  const inputs = labels.map((name, index) => {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = name + ' 球';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.enterKeyHint = index === 7 ? 'done' : 'next';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '—';
    input.id = 'odds-' + index;
    input.setAttribute('aria-label', name + '球赔率');
    label.append(caption, input);
    byId('grid').append(label);
    return input;
  });
  let isExample = false;

  function setError(message) {
    byId('error').textContent = message;
    byId('error').hidden = !message;
  }

  function showRanking(result) {
    const first = result.ranking[0];
    const leaders = result.ranking.filter(i => result.odds[i] === result.odds[first]);
    const tied = leaders.length > 1;
    const names = leaders.map(i => labels[i]).join('、') + ' 球';
    const leadProbability = percent(result.probabilities[first]);
    byId('leading-label').textContent = (isExample ? '示例 · ' : '') + (tied ? '并列最可能的总进球数' : '最可能的总进球数');
    byId('winner').textContent = names;
    byId('leading-percent').textContent = (tied ? '各 ' : '') + leadProbability;

    let rank = 0;
    const rows = result.ranking.map((i, position) => {
      if (!position || result.odds[i] !== result.odds[result.ranking[position - 1]]) rank = position + 1;
      const row = document.createElement('li');
      if (rank === 1) row.className = 'first';
      const place = document.createElement('span');
      place.className = 'rank';
      place.textContent = String(rank).padStart(2, '0');
      const goals = document.createElement('span');
      goals.className = 'goals';
      goals.textContent = labels[i] + ' 球';
      const bar = document.createElement('span');
      bar.className = 'track';
      bar.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      fill.className = 'fill';
      fill.style.width = result.probabilities[i] * 100 + '%';
      bar.append(fill);
      const probability = document.createElement('span');
      probability.className = 'prob';
      probability.textContent = percent(result.probabilities[i]);
      row.append(place, goals, bar, probability);
      return row;
    });
    byId('ranking').replaceChildren(...rows);
    byId('announcement').textContent = '排名已更新，' + (tied ? '并列' : '') + '第一为 ' + names + '，' + byId('leading-percent').textContent + '。';
  }

  function render(pasteError = '') {
    const values = inputs.map(input => normal(input.value));
    const filled = values.filter(Boolean).length;
    const invalid = values.map((value, i) => {
      const bad = Boolean(value) && !valid(value);
      inputs[i].setAttribute('aria-invalid', String(bad));
      return bad ? labels[i] : null;
    }).filter(name => name !== null);
    byId('count').textContent = '已填 ' + filled + ' / 8';
    byId('clear').disabled = !inputs.some(input => input.value);
    setError(pasteError || (invalid.length ? '请检查 ' + invalid.join('、') + ' 球赔率，每项须为大于 1 的十进制数。' : ''));
    const complete = !pasteError && filled === 8 && !invalid.length;
    byId('computed').hidden = !complete;
    byId('empty').hidden = complete;
    if (complete) {
      showRanking(calculate(values));
    } else {
      const hint = pasteError || invalid.length ? '修正输入后，这里会重新计算排名。'
        : filled ? '再填 ' + (8 - filled) + ' 项赔率，即可查看排名。' : '填完八项赔率后，这里会显示进球数排名。';
      byId('empty').textContent = hint;
      byId('announcement').textContent = hint;
      byId('ranking').replaceChildren();
      byId('winner').textContent = '';
      byId('leading-percent').textContent = '';
    }
  }

  function load(values, sample) {
    inputs.forEach((input, index) => { input.value = values[index] || ''; });
    isExample = sample;
    render();
  }

  inputs.forEach((input, index) => {
    input.addEventListener('input', () => { isExample = false; render(); });
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
      if (values.length !== 8) {
        input.value = '';
        isExample = false;
        render('识别到 ' + values.length + ' 项。请按 0 球至 7+ 球的顺序粘贴完整八项赔率。');
        return;
      }
      load(values, false);
    });
  });
  byId('example').addEventListener('click', () => load(example, true));
  byId('clear').addEventListener('click', () => { load([], false); inputs[0].focus(); });
  render();
})();
