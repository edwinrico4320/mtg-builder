(function () {
  function $(id) { return document.getElementById(id); }
  const encoder = new TextEncoder();

  function registerModule() {
    if (typeof BuilderModules !== 'undefined') {
      BuilderModules.register('Rules Library Generator', '1.0.0');
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  function ruleAnchor(ruleNumber) {
    return `rule-${String(ruleNumber).replace(/\./g, '-').toLowerCase()}`;
  }

  function textScale(size) {
    if (size === 'compact') return {body: '14px', h1: '28px', h2: '22px', h3: '18px'};
    if (size === 'large') return {body: '18px', h1: '34px', h2: '28px', h3: '22px'};
    return {body: '16px', h1: '30px', h2: '24px', h3: '20px'};
  }

  function resolveUrl(path, base) {
    return new URL(path, base || window.location.href).href;
  }

  async function loadSource(sourcePath) {
    const sourceUrl = resolveUrl(sourcePath);
    if (/\.json(?:$|[?#])/i.test(sourceUrl)) {
      const configResponse = await fetch(sourceUrl);
      if (!configResponse.ok) throw new Error(`Could not load rules manifest (${configResponse.status}).`);
      const config = await configResponse.json();
      if (!config.source) throw new Error('Rules manifest is missing the "source" filename.');
      const textUrl = resolveUrl(config.source, sourceUrl);
      const textResponse = await fetch(textUrl);
      if (!textResponse.ok) throw new Error(`Could not load rules text (${textResponse.status}).`);
      return {
        text: await textResponse.text(),
        title: config.title || '',
        sourceLabel: config.source,
        publisher: config.publisher || '',
        sourcePage: config.sourcePage || ''
      };
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Could not load rules text (${response.status}).`);
    return {text: await response.text(), title: '', sourceLabel: sourcePath, publisher: '', sourcePage: ''};
  }

  function parseRules(text, configuredTitle) {
    const clean = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const lines = clean.split('\n').map(line => line.trimEnd());
    const title = configuredTitle || (lines[0] || 'Magic: The Gathering Comprehensive Rules').trim();
    const effectiveMatch = clean.match(/These rules are effective as of ([^.]+)\./i);
    const effectiveDate = effectiveMatch ? effectiveMatch[1].trim() : '';
    const contentsIndex = lines.findIndex(line => line.trim() === 'Contents');
    const introStart = Math.min(lines.length, 3);
    const introEnd = contentsIndex >= 0 ? contentsIndex : Math.min(lines.length, 20);
    const introLines = lines.slice(introStart, introEnd).filter(line => line.trim());

    let bodyStart = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '1. Game Concepts') {
        bodyStart = i;
        break;
      }
    }
    if (bodyStart < 0) throw new Error('Could not find the start of section 1 in the rules text.');

    const body = lines.slice(bodyStart);
    const starts = [];
    body.forEach((line, index) => {
      const trimmed = line.trim();
      if (/^[1-9]\.\s+.+/.test(trimmed) || trimmed === 'Glossary' || trimmed === 'Credits') {
        starts.push({index, title: trimmed});
      }
    });

    const chapters = [{
      title: 'Introduction',
      slug: '000-introduction',
      lines: introLines
    }];

    starts.forEach((start, i) => {
      const next = starts[i + 1] ? starts[i + 1].index : body.length;
      const prefixMatch = start.title.match(/^([1-9])\./);
      const prefix = prefixMatch ? `${prefixMatch[1]}00` : (start.title === 'Glossary' ? '950' : '990');
      chapters.push({
        title: start.title,
        slug: `${prefix}-${slugify(start.title.replace(/^[1-9]\.\s*/, ''))}`,
        lines: body.slice(start.index, next)
      });
    });

    return {title, effectiveDate, chapters};
  }

  function chapterForRule(ruleNumber) {
    const first = String(ruleNumber).charAt(0);
    const map = {
      '1': '100-game-concepts.html',
      '2': '200-parts-of-a-card.html',
      '3': '300-card-types.html',
      '4': '400-zones.html',
      '5': '500-turn-structure.html',
      '6': '600-spells-abilities-and-effects.html',
      '7': '700-additional-rules.html',
      '8': '800-multiplayer-rules.html',
      '9': '900-casual-variants.html'
    };
    return map[first] || '';
  }

  function linkRuleReferences(html, linkMode) {
    return html.replace(/\brule (\d{3}(?:\.\d+[a-z]?)?)/gi, function (match, number) {
      const anchor = ruleAnchor(number);
      if (linkMode === 'all') return `<a href="#${anchor}">${match}</a>`;
      const chapter = chapterForRule(number);
      return chapter ? `<a href="${chapter}#${anchor}">${match}</a>` : match;
    });
  }

  function renderLines(chapter, linkMode) {
    const isGlossary = chapter.title === 'Glossary';
    const lines = chapter.lines;
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      if (/^[1-9]\.\s+/.test(trimmed) || trimmed === 'Glossary' || trimmed === 'Credits' || trimmed === 'Introduction') {
        result.push(`<h2>${escapeHtml(trimmed)}</h2>`);
        continue;
      }

      const sectionMatch = trimmed.match(/^(\d{3})\.\s+(.+)$/);
      if (sectionMatch) {
        result.push(`<h3 id="${ruleAnchor(sectionMatch[1])}">${escapeHtml(trimmed)}</h3>`);
        continue;
      }

      const ruleMatch = trimmed.match(/^(\d{3}\.\d+[a-z]?)\.?\s+(.+)$/);
      if (ruleMatch) {
        const linked = linkRuleReferences(escapeHtml(ruleMatch[2]), linkMode);
        result.push(`<p class="rule" id="${ruleAnchor(ruleMatch[1])}"><strong>${escapeHtml(ruleMatch[1])}.</strong> ${linked}</p>`);
        continue;
      }

      if (/^Example:/i.test(trimmed)) {
        result.push(`<div class="example">${linkRuleReferences(escapeHtml(trimmed), linkMode)}</div>`);
        continue;
      }

      if (isGlossary && trimmed.length <= 80 && !/[.!?;:]$/.test(trimmed)) {
        result.push(`<h3 id="term-${slugify(trimmed)}">${escapeHtml(trimmed)}</h3>`);
        continue;
      }

      result.push(`<p>${linkRuleReferences(escapeHtml(trimmed), linkMode)}</p>`);
    }

    return result.join('\n');
  }

  function styles(size) {
    const scale = textScale(size);
    return `
body{font-family:Arial,sans-serif;font-size:${scale.body};line-height:1.45;margin:0;background:#f3f0e8;color:#202020;}
a{color:#163c65;} .page{max-width:1200px;margin:auto;padding:16px;}
.header{text-align:center;background:#ebe2cf;border:1px solid #b9ac8e;padding:16px;margin-bottom:14px;}
.header h1{font-size:${scale.h1};margin:0 0 6px;} .meta{color:#555;font-size:.9em;}
.layout{display:block;} .nav{background:#f8f5ed;border:1px solid #c6baa0;padding:12px;margin-bottom:14px;max-height:38vh;overflow:auto;}
.nav a{display:inline-block;width:calc(50% - 12px);box-sizing:border-box;padding:5px 7px;vertical-align:top;text-decoration:none;}
.content{background:#fffdf8;border:1px solid #c8bea8;padding:16px;} h2{font-size:${scale.h2};border-bottom:1px solid #cbb999;padding-bottom:5px;}
h3{font-size:${scale.h3};margin-top:1.4em;} .rule{padding-left:1.2em;text-indent:-1.2em;scroll-margin-top:10px;}
.example{background:#f4ecdd;border-left:4px solid #b99a68;padding:9px 11px;margin:8px 0;font-style:italic;}
.chapter-links{display:flex;justify-content:space-between;gap:8px;margin:12px 0;}.chapter-links a{padding:7px 10px;background:#f5efe3;border:1px solid #c8baa0;text-decoration:none;}
@media (min-width:901px) and (orientation:landscape){.layout{display:flex;gap:16px;align-items:flex-start}.nav{width:250px;flex:0 0 250px;position:sticky;top:10px;max-height:calc(100vh - 20px);margin:0}.nav a{display:block;width:auto}.content{flex:1;min-width:0}}
@media (max-width:480px){.page{padding:8px}.content{padding:11px}.nav a{display:block;width:100%}.chapter-links{display:block}.chapter-links a{display:block;margin:6px 0}}
@media print{.nav,.chapter-links{display:none}.content{border:0}.page{max-width:none;padding:0}}
`;
  }

  function shell(title, effectiveDate, body, nav, size, extraMeta) {
    return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${styles(size)}</style></head>
<body><div class="page"><header class="header"><h1>${escapeHtml(title)}</h1>
<div class="meta">${effectiveDate ? `Effective ${escapeHtml(effectiveDate)} · ` : ''}${escapeHtml(extraMeta || 'Offline Rules Library')}</div></header>
<div class="layout">${nav ? `<nav class="nav">${nav}</nav>` : ''}<main class="content">${body}</main></div></div></body></html>`;
  }

  function chapterNav(chapters, prefix) {
    return `<strong>Chapters</strong>${chapters.map(ch => `<a href="${prefix || ''}${ch.slug}.html">${escapeHtml(ch.title)}</a>`).join('')}`;
  }

  function buildSinglePage(parsed, size) {
    const nav = `<strong>Sections</strong>${parsed.chapters.map(ch => `<a href="#chapter-${ch.slug}">${escapeHtml(ch.title)}</a>`).join('')}`;
    const body = parsed.chapters.map(ch => `<section id="chapter-${ch.slug}">${renderLines(ch, 'all')}</section>`).join('\n');
    return shell(parsed.title, parsed.effectiveDate, body, nav, size, 'Complete single-page reference');
  }

  function buildIndex(parsed, size, includeSingle) {
    const list = parsed.chapters.map(ch => `<li><a href="${ch.slug}.html">${escapeHtml(ch.title)}</a></li>`).join('');
    const allLink = includeSingle ? '<p><a href="all-rules.html"><strong>Open complete single-page reference</strong></a></p>' : '';
    const body = `<h2>Rules Chapters</h2><p>This package is organized into smaller chapter files for faster loading on restricted devices.</p>${allLink}<ol>${list}</ol>`;
    return shell(parsed.title, parsed.effectiveDate, body, '', size, 'Chapter index');
  }

  function buildChapterPage(parsed, chapter, index, size) {
    const previous = parsed.chapters[index - 1];
    const next = parsed.chapters[index + 1];
    const links = `<div class="chapter-links"><span>${previous ? `<a href="${previous.slug}.html">← ${escapeHtml(previous.title)}</a>` : ''}</span><a href="index.html">Chapter Index</a><span>${next ? `<a href="${next.slug}.html">${escapeHtml(next.title)} →</a>` : ''}</span></div>`;
    const body = `${links}${renderLines(chapter, 'chapters')}${links}`;
    return shell(parsed.title, parsed.effectiveDate, body, chapterNav(parsed.chapters), size, chapter.title);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  async function buildRulesLibrary() {
    const status = $('rulesBuildStatus');
    const button = $('buildRulesLibraryBtn');
    const sourcePath = (($('rulesSourcePath') || {}).value || './data/rules/index.json').trim();
    const mode = (($('rulesOutputMode') || {}).value) || 'hybrid';
    const size = (($('rulesTextSize') || {}).value) || 'comfortable';

    button.disabled = true;
    try {
      status.innerHTML = `Loading ${escapeHtml(sourcePath)}...`;
      const source = await loadSource(sourcePath);
      status.innerHTML = 'Parsing rules and building chapter navigation...';
      const parsed = parseRules(source.text, source.title);

      if (mode === 'single') {
        const html = buildSinglePage(parsed, size);
        downloadBlob(new Blob([html], {type: 'text/html;charset=utf-8'}), 'mtg-comprehensive-rules.html');
        status.innerHTML = `<strong>Rules library built successfully.</strong><br><strong>Output:</strong> Single HTML page<br><strong>Chapters detected:</strong> ${parsed.chapters.length}<br><strong>File size:</strong> ${formatBytes(encoder.encode(html).length)}${parsed.effectiveDate ? `<br><strong>Effective date:</strong> ${escapeHtml(parsed.effectiveDate)}` : ''}`;
        return;
      }

      if (typeof SimpleZip === 'undefined') throw new Error('ZIP module is not loaded.');
      const includeSingle = mode === 'hybrid';
      const files = [{name: 'index.html', content: buildIndex(parsed, size, includeSingle)}];
      parsed.chapters.forEach((chapter, index) => {
        files.push({name: `${chapter.slug}.html`, content: buildChapterPage(parsed, chapter, index, size)});
      });
      if (includeSingle) files.push({name: 'all-rules.html', content: buildSinglePage(parsed, size)});
      files.push({name: 'SOURCE.txt', content: `Source file: ${source.sourceLabel || sourcePath}\nEffective date: ${parsed.effectiveDate || 'Not detected'}\nGenerated by MTG Builder Rules Library Generator 1.0.0\n`});

      const zip = SimpleZip.create(files);
      downloadBlob(zip, includeSingle ? 'mtg-rules-library-hybrid.zip' : 'mtg-rules-library-chapters.zip');
      status.innerHTML = `<strong>Rules library built successfully.</strong><br><strong>Output:</strong> ${includeSingle ? 'Hybrid ZIP' : 'Chapter ZIP'}<br><strong>Files generated:</strong> ${files.length}<br><strong>Chapters detected:</strong> ${parsed.chapters.length}<br><strong>Package size:</strong> ${formatBytes(zip.size)}${parsed.effectiveDate ? `<br><strong>Effective date:</strong> ${escapeHtml(parsed.effectiveDate)}` : ''}`;
    } catch (error) {
      console.error(error);
      status.innerHTML = `<strong>Rules build failed:</strong> ${escapeHtml(error && error.message ? error.message : String(error))}`;
    } finally {
      button.disabled = false;
    }
  }

  function init() {
    registerModule();
    const button = $('buildRulesLibraryBtn');
    if (button) button.addEventListener('click', buildRulesLibrary);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
