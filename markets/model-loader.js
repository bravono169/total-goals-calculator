/* The personal bookmark supplies a fragment. Browsers omit fragments from HTTP requests. */
(function (root) {
  'use strict';
  const storageKey = 'football.markets.personal-model-key.v1';

  function bytesFromBase64(value) {
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  }

  async function loadPersonalMarketModel() {
    if (!root.crypto?.subtle) throw new Error('请使用 HTTPS 在系统浏览器打开个人分析链接。');
    const params = new URLSearchParams(location.hash.slice(1));
    let saved = '';
    try { saved = localStorage.getItem(storageKey) || ''; } catch { /* Private browsing can disable storage. */ }
    const key = params.has('k') ? params.get('k') : saved;
    if (!key) throw new Error('首次使用请打开交付给你的个人分析链接，以在这台设备上启用历史样本。');
    if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('个人链接不完整，请重新打开完整链接。');

    const response = await fetch('./personal-model.enc.json', {cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw new Error('历史参数文件未能加载，请检查网络后刷新。');
    const bundle = await response.json();
    if (bundle.version !== 1) throw new Error('页面版本已更新，请刷新后再试。');
    const cryptoKey = await crypto.subtle.importKey('raw', bytesFromBase64(key), 'AES-GCM', false, ['decrypt']);
    let clear;
    try {
      clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytesFromBase64(bundle.iv)}, cryptoKey, bytesFromBase64(bundle.data));
    } catch {
      throw new Error('个人链接与当前样本参数不匹配，请重新打开完整的个人链接。');
    }
    const model = JSON.parse(new TextDecoder().decode(clear));
    if (model.version !== 1 || !model.models || !model.meta) throw new Error('历史样本版本无法识别，请刷新后再试。');
    try { localStorage.setItem(storageKey, key); } catch { /* The full bookmark still works without storage. */ }
    return model;
  }
  root.loadPersonalMarketModel = loadPersonalMarketModel;
})(window);
