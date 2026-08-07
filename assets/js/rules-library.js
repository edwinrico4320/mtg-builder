(function () {
  function $(id) { return document.getElementById(id); }
  const encoder = new TextEncoder();
  const GENERATOR_VERSION = '1.2.0';
  const BUILD_MANIFEST_PATH = './data/output/build-manifest.json';

  function registerModule() {
    if (typeof BuilderModules !== 'undefined') {
      BuilderModules.register('Rules Library Generator', GENERATOR_VERSION);
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
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
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

  async function sha256(text) {
    const data = encoder.encode(String(text || ''));
    if (window.crypto && window.crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    let hash = 2166136261;
    for (const byte of data) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  async function loadSource(sourcePath) {
    const sourceUrl = resolveUrl(sourcePath);
    if (/\.json(?:$|[?#])/i.test(sourceUrl)) {
      const configResponse = await fetch(sourceUrl, {cache: 'no-store'});
      if (!configResponse.ok) throw new Error(`Could not load rules manifest (${configResponse.status}).`);
      const configText = await configResponse.text();
      const config = JSON.parse(configText);
      if (!config.source) throw new Error('Rules manifest is missing the "source" filename.');
      const textUrl = resolveUrl(config.source, sourceUrl);
      const textResponse = await fetch(textUrl, {cache: 'no-store'});
      if (!textResponse.ok) throw new Error(`Could not load rules text (${textResponse.status}).`);
      const text = await textResponse.text();
      return {
        text,
        configText,
        title: config.title || '',
        sourceLabel: config.source,
        publisher: config.publisher || '',
        sourcePage: config.sourcePage || '',
        sourcePath,
        sourceUrl,
        textUrl
      };
    }
    const response = await fetch(sourceUrl, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Could not load rules text (${response.status}).`);
    return {
      text: await response.text(),
      configText: '',
      title: '',
      sourceLabel: sourcePath,
      publisher: '',
      sourcePage: '',
      sourcePath,
      sourceUrl,
      textUrl: sourceUrl
    };
  }

  async function sourceFingerprint(source) {
    return sha256(JSON.stringify({
      sourcePath: source.sourcePath,
      configText: source.configText,
      text: source.text,
      title: source.title,
      publisher: source.publisher,
      sourcePage: source.sourcePage
    }));
  }

  async function profileFingerprint(mode, size) {
    return sha256(JSON.stringify({generatorVersion: GENERATOR_VERSION, mode, size, design: (window.OutputDesigner ? OutputDesigner.getFingerprintData() : null)}));
  }

  async function loadBuildManifest() {
    try {
      const response = await fetch(BUILD_MANIFEST_PATH, {cache: 'no-store'});
      if (!response.ok) throw new Error('manifest not found');
      const manifest = await response.json();
      return manifest && typeof manifest === 'object' ? manifest : {};
    } catch (error) {
      return {builderVersion: '8.3.2.2'};
    }
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

  function downloadText(filename, text) {
    downloadBlob(new Blob([text], {type: 'application/json;charset=utf-8'}), filename);
  }

  function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  const CHAPTER_DEFINITIONS = [
    {number: '1', title: 'Game Concepts', prefix: '100'},
    {number: '2', title: 'Parts of a Card', prefix: '200'},
    {number: '3', title: 'Card Types', prefix: '300'},
    {number: '4', title: 'Zones', prefix: '400'},
    {number: '5', title: 'Turn Structure', prefix: '500'},
    {number: '6', title: 'Spells, Abilities, and Effects', prefix: '600'},
    {number: '7', title: 'Additional Rules', prefix: '700'},
    {number: '8', title: 'Multiplayer Rules', prefix: '800'},
    {number: '9', title: 'Casual Variants', prefix: '900'},
    {number: '', title: 'Glossary', prefix: '950'},
    {number: '', title: 'Credits', prefix: '990'}
  ];

  function normalizedLine(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function nextNonEmptyIndex(lines, start) {
    for (let index = start; index < lines.length; index++) {
      if (normalizedLine(lines[index])) return index;
    }
    return -1;
  }

  function matchChapterAt(lines, index, definition) {
    const current = normalizedLine(lines[index]);
    if (!current) return null;

    if (!definition.number) {
      if (current === definition.title) {
        return {index, contentStart: index + 1, title: definition.title, prefix: definition.prefix};
      }
      return null;
    }

    const fullTitle = `${definition.number}. ${definition.title}`;
    if (current === fullTitle) {
      return {index, contentStart: index + 1, title: fullTitle, prefix: definition.prefix};
    }

    if (current === `${definition.number}.`) {
      const titleIndex = nextNonEmptyIndex(lines, index + 1);
      if (titleIndex >= 0 && normalizedLine(lines[titleIndex]) === definition.title) {
        return {index, contentStart: titleIndex + 1, title: fullTitle, prefix: definition.prefix};
      }
    }
    return null;
  }

  function findChapterMatches(lines, definition, startIndex) {
    const matches = [];
    for (let index = Math.max(0, startIndex || 0); index < lines.length; index++) {
      const match = matchChapterAt(lines, index, definition);
      if (match) matches.push(match);
    }
    return matches;
  }

  function chapterContainsRule(chapter, ruleNumber) {
    const escaped = String(ruleNumber).replace(/\./g, '\\.');
    const combined = new RegExp(`^${escaped}\\.?\\s+`);
    const numberOnly = new RegExp(`^${escaped}\\.?$`);
    return chapter.lines.some(line => combined.test(normalizedLine(line)) || numberOnly.test(normalizedLine(line)));
  }

  function validateParsedRules(chapters) {
    const expectedTitles = CHAPTER_DEFINITIONS.map(definition => definition.number ? `${definition.number}. ${definition.title}` : definition.title);
    const chapterTitles = chapters.slice(1).map(chapter => chapter.title);
    const missing = expectedTitles.filter(title => !chapterTitles.includes(title));
    if (missing.length) throw new Error(`Rules parser could not locate these chapters: ${missing.join(', ')}.`);

    const slugs = new Set();
    for (const chapter of chapters) {
      if (slugs.has(chapter.slug)) throw new Error(`Duplicate chapter target detected: ${chapter.slug}`);
      slugs.add(chapter.slug);
    }

    const gameConcepts = chapters.find(chapter => chapter.title === '1. Game Concepts');
    if (!gameConcepts || !chapterContainsRule(gameConcepts, '100.1')) {
      throw new Error('The Game Concepts chapter was found, but rule 100.1 was not inside it. The source may be a table of contents rather than the full rules text.');
    }
  }

  function parseRules(text, configuredTitle) {
    const clean = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const lines = clean.split('\n').map(line => line.trimEnd());
    const title = configuredTitle || (lines[0] || 'Magic: The Gathering Comprehensive Rules').trim();
    const effectiveMatch = clean.match(/These rules are effective as of ([^.]+)\./i);
    const effectiveDate = effectiveMatch ? effectiveMatch[1].trim() : '';

    const firstDefinition = CHAPTER_DEFINITIONS[0];
    const firstMatches = findChapterMatches(lines, firstDefinition, 0);
    if (!firstMatches.length) throw new Error('Could not find the start of section 1 in the rules text.');

    const bodyStart = firstMatches[firstMatches.length - 1];
    const contentsIndex = lines.findIndex(line => normalizedLine(line) === 'Contents');
    const introductionIndex = lines.findIndex((line, index) => index < bodyStart.index && normalizedLine(line) === 'Introduction');
    const introStart = introductionIndex >= 0 ? introductionIndex + 1 : Math.min(lines.length, 3);
    const introEndCandidates = [contentsIndex, bodyStart.index].filter(index => index >= introStart);
    const introEnd = introEndCandidates.length ? Math.min(...introEndCandidates) : bodyStart.index;
    const introLines = lines.slice(introStart, introEnd).filter(line => normalizedLine(line));

    const starts = [bodyStart];
    let cursor = bodyStart.contentStart;
    for (let definitionIndex = 1; definitionIndex < CHAPTER_DEFINITIONS.length; definitionIndex++) {
      const definition = CHAPTER_DEFINITIONS[definitionIndex];
      let found = null;
      for (let index = cursor; index < lines.length; index++) {
        const match = matchChapterAt(lines, index, definition);
        if (match) { found = match; break; }
      }
      if (found) {
        starts.push(found);
        cursor = found.contentStart;
      }
    }

    const chapters = [{title: 'Introduction', slug: '000-introduction', lines: introLines}];
    starts.forEach((start, index) => {
      const next = starts[index + 1] ? starts[index + 1].index : lines.length;
      chapters.push({
        title: start.title,
        slug: `${start.prefix}-${slugify(start.title.replace(/^[1-9]\.\s*/, ''))}`,
        lines: lines.slice(start.contentStart, next)
      });
    });

    validateParsedRules(chapters);
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
    const result = [];

    for (let index = 0; index < chapter.lines.length; index++) {
      const trimmed = normalizedLine(chapter.lines[index]);
      if (!trimmed) continue;

      const nextIndex = nextNonEmptyIndex(chapter.lines, index + 1);
      const nextLine = nextIndex >= 0 ? normalizedLine(chapter.lines[nextIndex]) : '';

      const sectionMatch = trimmed.match(/^(\d{3})\.\s+(.+)$/);
      if (sectionMatch) {
        result.push(`<h3 id="${ruleAnchor(sectionMatch[1])}">${escapeHtml(trimmed)}</h3>`);
        continue;
      }

      const splitSectionMatch = trimmed.match(/^(\d{3})\.$/);
      if (splitSectionMatch && nextLine && !/^\d{3}\.\d+/.test(nextLine)) {
        result.push(`<h3 id="${ruleAnchor(splitSectionMatch[1])}">${escapeHtml(`${splitSectionMatch[1]}. ${nextLine}`)}</h3>`);
        index = nextIndex;
        continue;
      }

      const ruleMatch = trimmed.match(/^(\d{3}\.\d+[a-z]?)\.?\s+(.+)$/);
      if (ruleMatch) {
        result.push(`<p class="rule" id="${ruleAnchor(ruleMatch[1])}"><strong>${escapeHtml(ruleMatch[1])}.</strong> ${linkRuleReferences(escapeHtml(ruleMatch[2]), linkMode)}</p>`);
        continue;
      }

      const splitRuleMatch = trimmed.match(/^(\d{3}\.\d+[a-z]?)\.?$/);
      if (splitRuleMatch && nextLine) {
        result.push(`<p class="rule" id="${ruleAnchor(splitRuleMatch[1])}"><strong>${escapeHtml(splitRuleMatch[1])}.</strong> ${linkRuleReferences(escapeHtml(nextLine), linkMode)}</p>`);
        index = nextIndex;
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

  function chapterAnchor(chapter) {
    return `chapter-${chapter.slug}`;
  }

  function renderChapterSection(chapter, linkMode, includeBackToTop) {
    const anchor = chapterAnchor(chapter);
    const body = renderLines(chapter, linkMode);
    const backToTop = includeBackToTop ? '<p class="back-top"><a href="#top">Back to chapter list</a></p>' : '';
    return `<section class="chapter-section" aria-labelledby="${anchor}"><h2 class="chapter-heading" id="${anchor}" tabindex="-1">${escapeHtml(chapter.title)}</h2>${body}${backToTop}</section>`;
  }

  function styles(size) {
    const scale = textScale(size);
    const designerCss = window.OutputDesigner ? OutputDesigner.getGeneratedCss('rules') : '';
    return `
html{scroll-behavior:auto;}
body{font-family:Arial,sans-serif;font-size:${scale.body};line-height:1.45;margin:0;background:#f3f0e8;color:#202020;}
a{color:#163c65}.page{max-width:1200px;margin:auto;padding:16px}.header{text-align:center;background:#ebe2cf;border:1px solid #b9ac8e;padding:16px;margin-bottom:14px}.header h1{font-size:${scale.h1};margin:0 0 6px}.meta{color:#555;font-size:.9em}.layout{display:block}.nav{background:#f8f5ed;border:1px solid #c6baa0;padding:12px;margin-bottom:14px;max-height:42vh;overflow:auto}.nav-title{display:block;font-size:1.05em;margin:0 0 8px;font-weight:bold}.nav-list{list-style:none;margin:0;padding:0}.nav-list li{margin:0;padding:0;border-top:1px solid #e1d8c5}.nav-list li:first-child{border-top:0}.nav a{display:block;width:auto;box-sizing:border-box;padding:8px 7px;text-decoration:none;line-height:1.25}.nav a:hover,.nav a:focus{background:#e6edf4;text-decoration:underline}.content{background:#fffdf8;border:1px solid #c8bea8;padding:16px}.chapter-section{margin:0 0 2.2em}.chapter-heading{font-size:${scale.h2};border-bottom:1px solid #cbb999;padding-bottom:5px;scroll-margin-top:12px}.chapter-heading:target{background:#fff2b8;outline:3px solid #c9a93f;outline-offset:3px}.chapter-section:first-child .chapter-heading{margin-top:0}h3{font-size:${scale.h3};margin-top:1.4em;scroll-margin-top:12px}.rule{padding-left:1.2em;text-indent:-1.2em;scroll-margin-top:10px}.rule:target,h3:target{background:#fff2b8;outline:2px solid #c9a93f;outline-offset:2px}.example{background:#f4ecdd;border-left:4px solid #b99a68;padding:9px 11px;margin:8px 0;font-style:italic}.back-top{margin-top:1.2em;padding-top:.6em;border-top:1px solid #ddd}.chapter-links{display:flex;justify-content:space-between;gap:8px;margin:12px 0}.chapter-links a{padding:7px 10px;background:#f5efe3;border:1px solid #c8baa0;text-decoration:none}@media (min-width:901px) and (orientation:landscape){.layout{display:flex;gap:16px;align-items:flex-start}.nav{width:270px;flex:0 0 270px;position:sticky;top:10px;max-height:calc(100vh - 20px);margin:0}.content{flex:1;min-width:0}}@media (max-width:480px){.page{padding:8px}.content{padding:11px}.nav{max-height:none}.chapter-links{display:block}.chapter-links a{display:block;margin:6px 0}}@media print{.nav,.chapter-links,.back-top{display:none}.content{border:0}.page{max-width:none;padding:0}.chapter-heading:target,.rule:target,h3:target{background:transparent;outline:0}}${designerCss}
`;
  }

  function shell(title, effectiveDate, body, nav, size, extraMeta) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${styles(size)}</style></head><body><div id="top"></div><div class="page"><header class="header"><h1>${escapeHtml(title)}</h1><div class="meta">${effectiveDate ? `Effective ${escapeHtml(effectiveDate)} · ` : ''}${escapeHtml(extraMeta || 'Offline Rules Library')}</div></header><div class="layout">${nav ? `<nav class="nav">${nav}</nav>` : ''}<main class="content">${body}</main></div></div></body></html>`;
  }

  function navList(chapters, linkBuilder, title) {
    const items = chapters.map(chapter => `<li><a href="${linkBuilder(chapter)}">${escapeHtml(chapter.title)}</a></li>`).join('');
    return `<div class="nav-title">${escapeHtml(title)}</div><ol class="nav-list">${items}</ol>`;
  }

  function chapterNav(chapters) {
    return navList(chapters, chapter => `${chapter.slug}.html#${chapterAnchor(chapter)}`, 'Chapters');
  }

  function buildSinglePage(parsed, size) {
    const nav = navList(parsed.chapters, chapter => `#${chapterAnchor(chapter)}`, 'Rules chapters');
    const body = parsed.chapters.map(chapter => renderChapterSection(chapter, 'all', true)).join('\n');
    return shell(parsed.title, parsed.effectiveDate, body, nav, size, 'Complete single-page reference');
  }

  function buildIndex(parsed, size, includeSingle) {
    const list = parsed.chapters.map(chapter => `<li><a href="${chapter.slug}.html#${chapterAnchor(chapter)}">${escapeHtml(chapter.title)}</a></li>`).join('');
    const allLink = includeSingle ? '<p><a href="all-rules.html#top"><strong>Open complete single-page reference</strong></a></p>' : '';
    return shell(parsed.title, parsed.effectiveDate, `<section class="chapter-section"><h2 class="chapter-heading">Rules Chapters</h2><p>This package is organized into smaller chapter files for faster loading on restricted devices.</p>${allLink}<ol>${list}</ol></section>`, '', size, 'Chapter index');
  }

  function buildChapterPage(parsed, chapter, index, size) {
    const previous = parsed.chapters[index - 1];
    const next = parsed.chapters[index + 1];
    const links = `<div class="chapter-links"><span>${previous ? `<a href="${previous.slug}.html#${chapterAnchor(previous)}">← ${escapeHtml(previous.title)}</a>` : ''}</span><a href="index.html">Chapter Index</a><span>${next ? `<a href="${next.slug}.html#${chapterAnchor(next)}">${escapeHtml(next.title)} →</a>` : ''}</span></div>`;
    return shell(parsed.title, parsed.effectiveDate, `${links}${renderChapterSection(chapter, 'chapters', false)}${links}`, chapterNav(parsed.chapters), size, chapter.title);
  }

  async function evaluateChange(sourcePath, mode, size) {
    const source = await loadSource(sourcePath);
    const parsed = parseRules(source.text, source.title);
    const sourceHash = await sourceFingerprint(source);
    const profileHash = await profileFingerprint(mode, size);
    const manifest = await loadBuildManifest();
    const previous = manifest.rulesLibrary || null;
    let reason = 'No previous rules-library record was found.';
    let changed = true;
    if (previous) {
      if (previous.sourceHash !== sourceHash) reason = 'The rules source or rules manifest changed.';
      else if (previous.profileFingerprint !== profileHash) reason = 'The output package, text size, generator version, or design profile changed.';
      else {
        reason = 'The source and output settings match the existing build manifest.';
        changed = false;
      }
    }
    return {source, parsed, sourceHash, profileHash, manifest, previous, reason, changed};
  }

  async function analyzeRulesChanges() {
    const status = $('rulesBuildStatus');
    const button = $('analyzeRulesChangesBtn');
    const sourcePath = (($('rulesSourcePath') || {}).value || './data/rules/index.json').trim();
    const mode = (($('rulesOutputMode') || {}).value) || 'hybrid';
    const size = (($('rulesTextSize') || {}).value) || 'comfortable';
    if (button) button.disabled = true;
    try {
      status.innerHTML = `Checking ${escapeHtml(sourcePath)}...`;
      const evaluation = await evaluateChange(sourcePath, mode, size);
      status.innerHTML = `<strong>${evaluation.changed ? 'Rules library needs rebuilding.' : 'Rules library is unchanged.'}</strong><br>` +
        `<strong>Reason:</strong> ${escapeHtml(evaluation.reason)}<br>` +
        `<strong>Effective date:</strong> ${escapeHtml(evaluation.parsed.effectiveDate || 'Not detected')}<br>` +
        `<strong>Chapters detected:</strong> ${evaluation.parsed.chapters.length}<br>` +
        `<strong>Output:</strong> ${escapeHtml(mode)} · ${escapeHtml(size)} text`;
    } catch (error) {
      status.innerHTML = `<strong>Rules change check failed:</strong> ${escapeHtml(error && error.message ? error.message : String(error))}`;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function buildRulesLibrary() {
    const status = $('rulesBuildStatus');
    const button = $('buildRulesLibraryBtn');
    const sourcePath = (($('rulesSourcePath') || {}).value || './data/rules/index.json').trim();
    const mode = (($('rulesOutputMode') || {}).value) || 'hybrid';
    const size = (($('rulesTextSize') || {}).value) || 'comfortable';
    const force = !!(($('forceRulesRebuild') || {}).checked);
    button.disabled = true;
    try {
      status.innerHTML = `Checking ${escapeHtml(sourcePath)}...`;
      const evaluation = await evaluateChange(sourcePath, mode, size);
      if (!evaluation.changed && !force) {
        status.innerHTML = `<strong>Rules source unchanged.</strong><br>Library build skipped.<br><span class="hint">Select force rebuild to generate it again with identical settings.</span>`;
        return;
      }
      const parsed = evaluation.parsed;
      status.innerHTML = 'Building rules-library output...';
      let outputFile;
      let outputLabel;
      let outputFiles = [];
      let packageBytes = 0;

      if (mode === 'single') {
        const html = buildSinglePage(parsed, size);
        outputFile = 'mtg-comprehensive-rules.html';
        outputLabel = 'Single HTML page';
        outputFiles = [outputFile];
        packageBytes = encoder.encode(html).length;
        downloadBlob(new Blob([html], {type: 'text/html;charset=utf-8'}), outputFile);
      } else {
        if (typeof SimpleZip === 'undefined') throw new Error('ZIP module is not loaded.');
        const includeSingle = mode === 'hybrid';
        const files = [{name: 'index.html', content: buildIndex(parsed, size, includeSingle)}];
        parsed.chapters.forEach((chapter, index) => files.push({name: `${chapter.slug}.html`, content: buildChapterPage(parsed, chapter, index, size)}));
        if (includeSingle) files.push({name: 'all-rules.html', content: buildSinglePage(parsed, size)});
        files.push({name: 'SOURCE.txt', content: `Source file: ${evaluation.source.sourceLabel || sourcePath}\nEffective date: ${parsed.effectiveDate || 'Not detected'}\nGenerated by MTG Builder Rules Library Generator ${GENERATOR_VERSION}\n`});
        const zip = SimpleZip.create(files);
        outputFile = includeSingle ? 'mtg-rules-library-hybrid.zip' : 'mtg-rules-library-chapters.zip';
        outputLabel = includeSingle ? 'Hybrid ZIP' : 'Chapter ZIP';
        outputFiles = files.map(file => file.name);
        packageBytes = zip.size;
        downloadBlob(zip, outputFile);
      }

      const manifest = evaluation.manifest;
      manifest.builderVersion = '8.7.1';
      manifest.rulesLibrary = {
        sourceHash: evaluation.sourceHash,
        profileFingerprint: evaluation.profileHash,
        sourcePath,
        effectiveDate: parsed.effectiveDate || '',
        outputMode: mode,
        textSize: size,
        generatorVersion: GENERATOR_VERSION,
        outputArchive: outputFile,
        outputs: outputFiles,
        chapterCount: parsed.chapters.length,
        updatedAt: new Date().toISOString()
      };
      downloadText('build-manifest.json', JSON.stringify(manifest, null, 2));

      status.innerHTML = `<strong>Rules library built successfully.</strong><br>` +
        `<strong>Reason:</strong> ${escapeHtml(force && !evaluation.changed ? 'Forced rebuild.' : evaluation.reason)}<br>` +
        `<strong>Output:</strong> ${escapeHtml(outputLabel)}<br>` +
        `<strong>Chapters detected:</strong> ${parsed.chapters.length}<br>` +
        `<strong>Package size:</strong> ${formatBytes(packageBytes)}<br>` +
        `<strong>Effective date:</strong> ${escapeHtml(parsed.effectiveDate || 'Not detected')}<br>` +
        `<strong>Manifest:</strong> <code>build-manifest.json</code> was downloaded; upload it to <code>data/output</code>.`;
    } catch (error) {
      console.error(error);
      status.innerHTML = `<strong>Rules build failed:</strong> ${escapeHtml(error && error.message ? error.message : String(error))}`;
    } finally {
      button.disabled = false;
    }
  }


  async function buildCaptured(manifestOverride, forceOverride) {
    const sourcePath = (($('rulesSourcePath') || {}).value || './data/rules/index.json').trim();
    const mode = (($('rulesOutputMode') || {}).value) || 'hybrid';
    const size = (($('rulesTextSize') || {}).value) || 'comfortable';
    const force = forceOverride === true || !!(($('forceRulesRebuild') || {}).checked);
    const evaluation = await evaluateChange(sourcePath, mode, size);
    if (!evaluation.changed && !force) return {changed:false, reason:evaluation.reason, files:[], manifest:manifestOverride || evaluation.manifest, evaluation};
    const parsed = evaluation.parsed;
    const files = [];
    let outputFile;
    let outputFiles=[];
    if (mode === 'single') {
      outputFile='mtg-comprehensive-rules.html';
      outputFiles=[outputFile];
      files.push({name:`data/output/rules/${outputFile}`,content:buildSinglePage(parsed,size)});
    } else {
      if (typeof SimpleZip === 'undefined') throw new Error('ZIP module is not loaded.');
      const includeSingle=mode==='hybrid';
      const packageFiles=[{name:'index.html',content:buildIndex(parsed,size,includeSingle)}];
      parsed.chapters.forEach((chapter,index)=>packageFiles.push({name:`${chapter.slug}.html`,content:buildChapterPage(parsed,chapter,index,size)}));
      if(includeSingle) packageFiles.push({name:'all-rules.html',content:buildSinglePage(parsed,size)});
      packageFiles.push({name:'SOURCE.txt',content:`Source file: ${evaluation.source.sourceLabel || sourcePath}
Effective date: ${parsed.effectiveDate || 'Not detected'}
Generated by MTG Builder Rules Library Generator ${GENERATOR_VERSION}
`});
      const zip=SimpleZip.create(packageFiles);
      outputFile=includeSingle?'mtg-rules-library-hybrid.zip':'mtg-rules-library-chapters.zip';
      outputFiles=packageFiles.map(file=>file.name);
      files.push({name:`data/output/rules/${outputFile}`,content:new Uint8Array(await zip.arrayBuffer())});
    }
    const manifest=manifestOverride || evaluation.manifest || {};
    manifest.builderVersion='8.7.1';
    manifest.rulesLibrary={sourceHash:evaluation.sourceHash,profileFingerprint:evaluation.profileHash,sourcePath,effectiveDate:parsed.effectiveDate||'',outputMode:mode,textSize:size,generatorVersion:GENERATOR_VERSION,outputArchive:outputFile,outputs:outputFiles,chapterCount:parsed.chapters.length,updatedAt:new Date().toISOString()};
    return {changed:true,reason:evaluation.reason,files,manifest,evaluation};
  }

  function init() {
    registerModule();
    const analyzeButton = $('analyzeRulesChangesBtn');
    const buildButton = $('buildRulesLibraryBtn');
    if (analyzeButton) analyzeButton.addEventListener('click', analyzeRulesChanges);
    if (buildButton) buildButton.addEventListener('click', buildRulesLibrary);
  }

  window.RulesLibraryInternals = {
    parseRules,
    buildSinglePage,
    buildIndex,
    buildChapterPage,
    chapterAnchor,
    ruleAnchor,
    validateParsedRules,
    evaluateChange,
    buildCaptured
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
