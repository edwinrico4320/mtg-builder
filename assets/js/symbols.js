
(function () {
  const COLOR_MAP = {
    W: { bg: '#f7f2db', text: '#1a1a1a' },
    U: { bg: '#c9e7f5', text: '#0f2d45' },
    B: { bg: '#c9c2bf', text: '#111111' },
    R: { bg: '#f4c6b5', text: '#5b1e12' },
    G: { bg: '#d1e7cf', text: '#16351d' },
    C: { bg: '#ece8df', text: '#2b2b2b' },
    S: { bg: '#e8f3f7', text: '#38505c' },
    E: { bg: '#d9f7e8', text: '#0b4b2a' },
    T: { bg: '#ece8df', text: '#2b2b2b' },
    Q: { bg: '#ece8df', text: '#2b2b2b' },
    X: { bg: '#ece8df', text: '#2b2b2b' },
    Y: { bg: '#ece8df', text: '#2b2b2b' },
    Z: { bg: '#ece8df', text: '#2b2b2b' },
    P: { bg: '#ece8df', text: '#2b2b2b' },
    DEFAULT: { bg: '#ece8df', text: '#2b2b2b' },
    TWO: { bg: '#e9e1d0', text: '#2b2b2b' }
  };

  const RARITY_STYLES = {
    common: { bg: '#d7d7d7', border: '#7c7c7c', text: '#252525', label: 'C' },
    uncommon: { bg: '#cfe0ea', border: '#6b8694', text: '#17313f', label: 'U' },
    rare: { bg: '#f3deb2', border: '#b0812c', text: '#6a4710', label: 'R' },
    mythic: { bg: '#f1ccb0', border: '#c45f1d', text: '#6f2800', label: 'M' },
    special: { bg: '#ddd5f5', border: '#7055ac', text: '#331f5f', label: 'S' },
    bonus: { bg: '#d5f0ea', border: '#2b8f75', text: '#0b4c3c', label: 'B' },
    default: { bg: '#ece8df', border: '#777', text: '#222', label: '?' }
  };

  function xmlEscape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function htmlEscape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function encodeSvg(svg) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function colorFor(code) {
    return COLOR_MAP[String(code || '').toUpperCase()] || COLOR_MAP.DEFAULT;
  }

  function manaLabel(key) {
    const normalized = String(key || '').toUpperCase();
    if (normalized === 'T') return '↷';
    if (normalized === 'Q') return 'Q';
    if (normalized === 'E') return '⚡';
    if (normalized === 'S') return '❄';
    return normalized;
  }

  function symbolSvg(key) {
    const normalized = String(key || '').toUpperCase().trim();
    const stroke = '#444';
    const isNumeric = /^\d+$/.test(normalized);
    let fontSize = 18;
    let label = manaLabel(normalized);
    let fill = colorFor(normalized).bg;
    let textColor = colorFor(normalized).text;
    let defs = '';
    if (normalized.includes('/')) {
      const parts = normalized.split('/');
      if (parts.length === 2) {
        if (parts[1] === 'P') {
          const c = colorFor(parts[0]);
          fill = c.bg;
          textColor = c.text;
          label = 'Φ';
          fontSize = 20;
        } else {
          const leftCode = parts[0] === '2' ? 'TWO' : parts[0];
          const rightCode = parts[1] === '2' ? 'TWO' : parts[1];
          const left = colorFor(leftCode);
          const right = colorFor(rightCode);
          defs = '<defs><linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0%" stop-color="' + left.bg + '"/><stop offset="49.9%" stop-color="' + left.bg + '"/><stop offset="50.1%" stop-color="' + right.bg + '"/><stop offset="100%" stop-color="' + right.bg + '"/></linearGradient></defs>';
          fill = 'url(#g)';
          textColor = '#1f1f1f';
          label = normalized === 'H' ? 'H' : normalized.replace('/', '⁄');
          fontSize = label.length >= 3 ? 11 : 13;
        }
      }
    } else if (isNumeric) {
      fill = COLOR_MAP.TWO.bg;
      textColor = COLOR_MAP.TWO.text;
      fontSize = normalized.length >= 2 ? 13 : 18;
      label = normalized;
    } else if (/^[WUBRGCXYZSTEQ]$/.test(normalized)) {
      fontSize = ['T','Q','E','S'].includes(normalized) ? 18 : 18;
    } else if (normalized === 'CHAOS') {
      fill = '#f2e4c8';
      label = '☼';
      fontSize = 18;
    } else if (normalized === '∞') {
      label = '∞';
      fontSize = 18;
    } else {
      fontSize = label.length >= 3 ? 12 : 14;
    }
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
${defs}
<circle cx="14" cy="14" r="12.5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
<text x="14" y="14" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="${textColor}">${xmlEscape(label)}</text>
</svg>`;
    return svg;
  }

  function raritySvg(rarity) {
    const normalized = String(rarity || '').toLowerCase();
    const s = RARITY_STYLES[normalized] || RARITY_STYLES.default;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
<circle cx="11" cy="11" r="9.5" fill="${s.bg}" stroke="${s.border}" stroke-width="1.5"/>
<text x="11" y="11" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" fill="${s.text}">${xmlEscape(s.label)}</text>
</svg>`;
    return svg;
  }

  const cache = new Map();
  const rarityCache = new Map();

  function symbolDataUri(key) {
    const normalized = String(key || '').toUpperCase().trim();
    if (!cache.has(normalized)) cache.set(normalized, encodeSvg(symbolSvg(normalized)));
    return cache.get(normalized);
  }

  function rarityDataUri(rarity) {
    const normalized = String(rarity || '').toLowerCase().trim();
    if (!rarityCache.has(normalized)) rarityCache.set(normalized, encodeSvg(raritySvg(normalized)));
    return rarityCache.get(normalized);
  }

  function manaToHtml(text, embedded) {
    const raw = htmlEscape(text || '');
    if (!embedded) return raw;
    return raw.replace(/\{([^}]+)\}/g, function (_, sym) {
      const key = String(sym || '').toUpperCase();
      const src = symbolDataUri(key);
      return '<img class="mana" alt="{' + htmlEscape(key) + '}" src="' + src + '">';
    });
  }

  function renderRarityIcon(rarity) {
    const normalized = String(rarity || '').trim();
    if (!normalized) return '';
    const src = rarityDataUri(normalized);
    return '<span class="rarity-icon-wrap" title="' + htmlEscape(normalized) + '"><img class="rarity-icon" alt="' + htmlEscape(normalized) + '" src="' + src + '"></span>';
  }

  const basicKeys = ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','W','U','B','R','G','C','X','Y','Z','T','Q','S','E'];
  const basicMap = {};
  basicKeys.forEach(function (key) { basicMap[key] = symbolDataUri(key); });

  window.MTG_SYMBOLS = basicMap;
  window.MTGSymbolRenderer = {
    symbolDataUri,
    rarityDataUri,
    manaToHtml,
    renderRarityIcon,
    htmlEscape
  };
})();
