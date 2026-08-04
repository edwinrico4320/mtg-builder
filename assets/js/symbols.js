
(function () {
  const COLOR_MAP = {
    // Tuned to be closer to recognizable Magic mana-symbol colors and more distinct
    W: { bg: '#F4E7B7', text: '#5B4A16', stroke: '#8C7A3B', hi: '#FFF7DA', lo: '#E1CF93' },
    U: { bg: '#78B8D8', text: '#0E3550', stroke: '#285B77', hi: '#A9D7EC', lo: '#4C93B8' },
    B: { bg: '#8D817D', text: '#111111', stroke: '#4E4541', hi: '#B5AAA5', lo: '#675D59' },
    R: { bg: '#D97A57', text: '#4C170B', stroke: '#8A3A1E', hi: '#F0A584', lo: '#B95A37' },
    G: { bg: '#3F7F4C', text: '#F4F4EA', stroke: '#214E2B', hi: '#5FA168', lo: '#2E6338' },
    C: { bg: '#C8BCA8', text: '#2E2A24', stroke: '#7B7367', hi: '#E0D8CB', lo: '#ACA18D' },
    S: { bg: '#C9E5EE', text: '#2E4B57', stroke: '#6E97A6', hi: '#EAF7FB', lo: '#A9CFDB' },
    E: { bg: '#A4E7C1', text: '#0E4A2A', stroke: '#338058', hi: '#C9F6DA', lo: '#73C79A' },
    T: { bg: '#D8D2C7', text: '#2B2B2B', stroke: '#7D766A', hi: '#F0ECE5', lo: '#BBB3A4' },
    Q: { bg: '#D8D2C7', text: '#2B2B2B', stroke: '#7D766A', hi: '#F0ECE5', lo: '#BBB3A4' },
    X: { bg: '#D8D2C7', text: '#2B2B2B', stroke: '#7D766A', hi: '#F0ECE5', lo: '#BBB3A4' },
    Y: { bg: '#D8D2C7', text: '#2B2B2B', stroke: '#7D766A', hi: '#F0ECE5', lo: '#BBB3A4' },
    Z: { bg: '#D8D2C7', text: '#2B2B2B', stroke: '#7D766A', hi: '#F0ECE5', lo: '#BBB3A4' },
    P: { bg: '#D8D2C7', text: '#2B2B2B', stroke: '#7D766A', hi: '#F0ECE5', lo: '#BBB3A4' },
    DEFAULT: { bg: '#D8D2C7', text: '#2B2B2B', stroke: '#7D766A', hi: '#F0ECE5', lo: '#BBB3A4' },
    TWO: { bg: '#CFC4B2', text: '#2D2A24', stroke: '#817564', hi: '#E7DED0', lo: '#B6A993' }
  };

  const RARITY_STYLES = {
    common: { bg: '#d7d7d7', border: '#7c7c7c', text: '#252525', label: 'C' },
    uncommon: { bg: '#cfe0ea', border: '#6b8694', text: '#17313f', label: 'U' },
    rare: { bg: '#ecd39b', border: '#a4741d', text: '#62420a', label: 'R' },
    mythic: { bg: '#e9b48e', border: '#bb5614', text: '#672400', label: 'M' },
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
    // encodeURIComponent intentionally leaves ! ' ( ) * unescaped. Parentheses
    // can collide with reminder-text parsing if a data URI is ever processed as
    // text, so encode those remaining characters as well.
    const encoded = encodeURIComponent(svg).replace(/[!'()*]/g, function (char) {
      return '%' + char.charCodeAt(0).toString(16).toUpperCase();
    });
    return 'data:image/svg+xml;charset=UTF-8,' + encoded;
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
    const isNumeric = /^\d+$/.test(normalized);
    let fontSize = 18;
    let label = manaLabel(normalized);
    let baseColor = colorFor(normalized);
    let fill = baseColor.bg;
    let textColor = baseColor.text;
    let strokeColor = baseColor.stroke || '#444';
    let defs = '';
    if (normalized.includes('/')) {
      const parts = normalized.split('/');
      if (parts.length === 2) {
        if (parts[1] === 'P') {
          const c = colorFor(parts[0]);
          baseColor = c;
          fill = c.bg;
          textColor = c.text;
          strokeColor = c.stroke || '#444';
          label = 'Φ';
          fontSize = 20;
        } else {
          const leftCode = parts[0] === '2' ? 'TWO' : parts[0];
          const rightCode = parts[1] === '2' ? 'TWO' : parts[1];
          const left = colorFor(leftCode);
          const right = colorFor(rightCode);
          defs = '<defs><linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0%" stop-color="' + left.hi + '"/><stop offset="49.9%" stop-color="' + left.lo + '"/><stop offset="50.1%" stop-color="' + right.hi + '"/><stop offset="100%" stop-color="' + right.lo + '"/></linearGradient></defs>';
          fill = 'url(#g)';
          textColor = '#1f1f1f';
          strokeColor = '#4f4a42';
          label = normalized === 'H' ? 'H' : normalized.replace('/', '⁄');
          fontSize = label.length >= 3 ? 11 : 13;
        }
      }
    } else if (isNumeric) {
      baseColor = COLOR_MAP.TWO;
      fill = COLOR_MAP.TWO.bg;
      textColor = COLOR_MAP.TWO.text;
      strokeColor = COLOR_MAP.TWO.stroke || '#444';
      fontSize = normalized.length >= 2 ? 13 : 18;
      label = normalized;
    } else if (/^[WUBRGCXYZSTEQ]$/.test(normalized)) {
      fontSize = ['T','Q','E','S'].includes(normalized) ? 18 : 18;
    } else if (normalized === 'CHAOS') {
      fill = '#f2e4c8';
      label = '☼';
      fontSize = 18;
      strokeColor = '#8b6e40';
    } else if (normalized === '∞') {
      label = '∞';
      fontSize = 18;
    } else {
      fontSize = label.length >= 3 ? 12 : 14;
    }
    if (!defs) {
      defs = '<defs><radialGradient id="g" cx="32%" cy="28%" r="68%"><stop offset="0%" stop-color="' + (baseColor.hi || baseColor.bg) + '"/><stop offset="72%" stop-color="' + (baseColor.bg || '#ddd') + '"/><stop offset="100%" stop-color="' + (baseColor.lo || baseColor.bg) + '"/></radialGradient></defs>';
      fill = 'url(#g)';
    }
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
${defs}
<circle cx="14" cy="14" r="12.5" fill="${fill}" stroke="${strokeColor}" stroke-width="1.6"/>
<ellipse cx="10.5" cy="8.5" rx="6.2" ry="4.1" fill="#ffffff" fill-opacity="0.18"/>
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
