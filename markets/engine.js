/* Net goal difference and all handicaps are signed from the home team's perspective. */
(function (root) {
  'use strict';

  function implied(odds) {
    if (!Array.isArray(odds) || odds.length !== 3 ||
        !odds.every(value => Number.isFinite(value) && value > 1)) {
      throw new Error('每组三项赔率都须填写大于 1 的十进制数。');
    }
    const weights = odds.map(value => 1 / value);
    const total = weights.reduce((sum, value) => sum + value);
    return weights.map(value => value / total);
  }

  function checkLine(line, scale) {
    if (!Number.isFinite(line) || Math.abs(line) > 5 || !Number.isInteger(line * scale)) {
      throw new Error(scale === 1 ? '官方让球数须为 −5 至 +5 的整数。' : '亚盘须为 −5 至 +5 之间的四分之一球刻度。');
    }
  }

  function asianQuote(quote) {
    if (!quote) throw new Error('请填写亚盘初盘和即时盘。');
    checkLine(quote.line, 4);
    if (![quote.home, quote.away].every(water => Number.isFinite(water) && water > 0 && 1 + water > 1)) {
      throw new Error('主客队香港盘水位均须为有效正数。');
    }
    return {line: quote.line, home: 1 + quote.home, away: 1 + quote.away};
  }

  function settle(margins, officialLine, ahLine) {
    checkLine(officialLine, 1);
    checkLine(ahLine, 4);
    if (!Array.isArray(margins) || margins.length !== 13 ||
        !margins.every(p => Number.isFinite(p) && p >= 0) ||
        Math.abs(margins.reduce((sum, p) => sum + p, 0) - 1) > 1e-7) {
      throw new Error('历史净胜球分布校验失败。');
    }
    // Extreme buckets are <= -6 and >= 6, so every supported line settles exactly.
    const official = [0, 0, 0];
    const wdl = [0, 0, 0];
    const home = [0, 0, 0, 0, 0];
    const low = Math.floor(2 * ahLine) / 2;
    const high = Math.ceil(2 * ahLine) / 2;
    margins.forEach((p, i) => {
      const diff = i - 6;
      wdl[1 - Math.sign(diff)] += p;
      official[1 - Math.sign(diff + officialLine)] += p;
      const combined = Math.sign(diff + low) + Math.sign(diff + high);
      home[2 - combined] += p;
    });
    const away = [...home].reverse();
    return {wdl, histOfficial: official, ah: {
      home, away, favorable: [home[0] + home[1], away[0] + away[1]]
    }};
  }

  function analyze(model, input) {
    const openWdl = implied(input.euroOpen);
    const marketWdl = implied(input.euroNow);
    const official = implied(input.official);
    checkLine(input.officialLine, 1);
    const earlyAh = asianQuote(input.ahOpen);
    const currentAh = asianQuote(input.ahNow);
    const forecast = root.HistoryMargin.predict(model, {
      earlyWdl: input.euroOpen, currentWdl: input.euroNow, earlyAh, currentAh
    });
    const active = forecast && forecast.supported && Array.isArray(forecast.margins);
    const warnings = forecast?.warnings || [];
    const full = forecast?.mode === 'full';
    const info = {
      n: active ? (full ? model.meta.fullTrainN : model.meta.euroTrainN) : 0,
      scope: active ? (full ? '欧赔与亚盘历史模型' : '仅欧赔历史模型') : '即时欧赔隐含概率',
      warning: warnings.join(' '), mode: active ? forecast.mode : 'market'
    };
    if (!active) {
      if (!info.warning) info.warning = '这组赔率超出历史样本支持范围，胜平负展示即时欧赔折算值。';
      return {wdl: marketWdl, marketWdl, openWdl, official, histOfficial: null, ah: null, info};
    }
    const mapped = settle(forecast.margins, input.officialLine, currentAh.line);
    return {...mapped, marketWdl, openWdl, official, info};
  }

  root.MatchMarkets = {analyze, settle};
})(typeof globalThis === 'undefined' ? window : globalThis);
