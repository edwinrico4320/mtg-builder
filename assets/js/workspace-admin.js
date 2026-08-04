(function () {
  const VERSION='8.6.0';
  const STORAGE_KEY='mtg-builder-workspace-v8_6';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const clone=v=>JSON.parse(JSON.stringify(v));
  const state={workspace:null,lastCheck:null,running:false,cancel:false,sourcePath:null,loadedCanonical:null};

  function setValue(id,value){const el=$(id);if(!el||value==null)return;el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));}
  function setChecked(id,value){const el=$(id);if(!el||value==null)return;el.checked=!!value;el.dispatchEvent(new Event('change',{bubbles:true}));}
  function selected(selector,attr){return Array.from(document.querySelectorAll(selector)).filter(x=>x.checked).map(x=>x.getAttribute(attr)).filter(Boolean);}
  function setSelected(selector,attr,values){const set=new Set(values||[]);document.querySelectorAll(selector).forEach(x=>{x.checked=set.has(x.getAttribute(attr));x.dispatchEvent(new Event('change',{bubbles:true}));});}
  function downloadBlob(name,blob){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function downloadText(name,text){downloadBlob(name,new Blob([text],{type:'application/json;charset=utf-8'}));}
  function repoPath(path,fallback){let s=String(path||fallback||'').trim().replace(/^https?:\/\/[^/]+\//,'').replace(/^\.\//,'').replace(/^\//,'');return s||fallback;}
  async function fetchText(path){const res=await fetch(path,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status} for ${path}`);return res.text();}
  function summaryCard(index,text,klass){const cards=document.querySelectorAll('#workspaceSummaryCards article span');if(cards[index]){cards[index].textContent=text;cards[index].className=klass?`workspace-state-${klass}`:'';}}
  function status(id,html){const el=$(id);if(el)el.innerHTML=html;}
  function dashboard(text){const el=$('workspaceDashboardStatus');if(el)el.textContent=text;}

  function currentWorkspace(){
    const price=window.PriceSnapshotManager?PriceSnapshotManager.getBuildSettings():{enabled:false,providers:[],finishes:[],priceTypes:[],externalLinks:false};
    const design=window.OutputDesigner?OutputDesigner.getProfile():null;
    const sets=window.CatalogProfileCore?CatalogProfileCore.getCheckedSetCodes():[];
    return {
      version:VERSION,
      workspaceName:(state.workspace&&state.workspace.workspaceName)||'Edwin MTG Workspace',
      updatedAt:new Date().toISOString(),
      selectedSets:sets,
      sources:{
        profileLibraryPath:(($('odGithubPath')||{}).value)||'./data/design-profiles/profiles.json',
        designProfileId:(($('odGithubProfileSelect')||{}).value)||'',
        priceSnapshotPath:(($('priceSourcePath')||{}).value)||'./data/prices/price-snapshot.json',
        rulesSourcePath:(($('rulesSourcePath')||{}).value)||'./data/rules/index.json',
        buildManifestPath:(window.CatalogProfileCore&&CatalogProfileCore.manifestPath)||'./data/output/build-manifest.json'
      },
      catalog:{
        textSize:(($('textSizeSelect')||{}).value)||'comfortable',fieldMode:(($('fieldModeSelect')||{}).value)||'essential',navMode:(($('navModeSelect')||{}).value)||'alpha',symbolMode:(($('symbolModeSelect')||{}).value)||'embedded',duplicateMode:(($('duplicateModeSelect')||{}).value)||'collapse',outputProfile:(($('outputProfileSelect')||{}).value)||'card-no-images',imageWidth:Number((($('catalogImageWidthSelect')||{}).value)||300),imageQuality:Number((($('catalogImageQualitySelect')||{}).value)||.65)
      },
      price,
      rules:{outputMode:(($('rulesOutputMode')||{}).value)||'hybrid',textSize:(($('rulesTextSize')||{}).value)||'comfortable'},
      design:{profileId:(($('odGithubProfileSelect')||{}).value)||'',inlineProfile:design},
      policy:{autoLoad:!!($('workspaceAutoLoad')&&$('workspaceAutoLoad').checked),buildOnlyChanged:!!($('workspaceBuildOnlyChanged')&&$('workspaceBuildOnlyChanged').checked),includeRules:!!($('workspaceIncludeRules')&&$('workspaceIncludeRules').checked),includeProfiles:!!($('workspaceIncludeProfiles')&&$('workspaceIncludeProfiles').checked),includePrices:!!($('workspaceIncludePrices')&&$('workspaceIncludePrices').checked),includeWorkspace:!!($('workspaceIncludeWorkspace')&&$('workspaceIncludeWorkspace').checked)}
    };
  }

  function normalizeWorkspace(raw){
    if(!raw||typeof raw!=='object')throw new Error('Workspace JSON must be an object.');
    const w=clone(raw);w.version=w.version||VERSION;w.workspaceName=w.workspaceName||'MTG Workspace';w.selectedSets=Array.isArray(w.selectedSets)?w.selectedSets.map(x=>String(x).toUpperCase()):[];w.sources=w.sources||{};w.catalog=w.catalog||{};w.price=w.price||{};w.rules=w.rules||{};w.design=w.design||{};w.policy=Object.assign({autoLoad:true,buildOnlyChanged:true,includeRules:true,includeProfiles:true,includePrices:true,includeWorkspace:true},w.policy||{});return w;
  }

  function canonicalWorkspace(input){
    const w=normalizeWorkspace(input);delete w.updatedAt;
    return JSON.stringify(w);
  }

  async function applyDesign(w){
    const path=w.sources.profileLibraryPath||'./data/design-profiles/profiles.json';
    setValue('odGithubPath',path);
    let applied=false;
    try{
      const res=await fetch(path,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const payload=await res.json();const lib=OutputDesigner.normalizeProfileLibrary(payload);const select=$('odGithubProfileSelect');if(select){select.innerHTML='';Object.entries(lib.profiles).forEach(([id,p])=>{const o=document.createElement('option');o.value=id;o.textContent=p.name||id;select.appendChild(o);});select.disabled=false;}
      const id=w.sources.designProfileId||w.design.profileId||lib.defaultProfile||Object.keys(lib.profiles)[0];if(select&&lib.profiles[id])select.value=id;if(lib.profiles[id]){OutputDesigner.applyProfile(lib.profiles[id]);applied=true;}
    }catch(error){console.warn('Workspace profile library load failed',error);}
    if(!applied&&w.design.inlineProfile&&window.OutputDesigner)OutputDesigner.applyProfile(w.design.inlineProfile);
  }

  async function waitForSets(timeout){const start=Date.now();while(Date.now()-start<(timeout||15000)){const boxes=document.querySelectorAll('#batchSetList input[type="checkbox"]');if(boxes.length)return boxes;await delay(120);}return document.querySelectorAll('#batchSetList input[type="checkbox"]');}
  async function scanAndSelect(codes){const btn=$('scanCatalogSetsBtn');if(btn)btn.click();const boxes=await waitForSets(20000);const wanted=new Set((codes||[]).map(x=>String(x).toUpperCase()));boxes.forEach(b=>{const code=String(b.value||b.dataset.code||b.dataset.setCode||'').toUpperCase();b.checked=wanted.size?wanted.has(code):b.checked;});return boxes.length;}

  async function applyWorkspace(raw,sourceLabel){
    const w=normalizeWorkspace(raw);state.workspace=w;state.loadedCanonical=canonicalWorkspace(w);state.sourcePath=sourceLabel||state.sourcePath;
    const c=w.catalog||{};setValue('textSizeSelect',c.textSize);setValue('fieldModeSelect',c.fieldMode);setValue('navModeSelect',c.navMode);setValue('symbolModeSelect',c.symbolMode);setValue('duplicateModeSelect',c.duplicateMode);setValue('outputProfileSelect',c.outputProfile);setValue('catalogImageWidthSelect',c.imageWidth);setValue('catalogImageQualitySelect',c.imageQuality);
    const p=w.price||{};setChecked('priceEnabled',p.enabled);setSelected('[data-price-provider]','data-price-provider',p.providers);setSelected('[data-price-finish]','data-price-finish',p.finishes);setSelected('[data-price-type]','data-price-type',p.priceTypes);setChecked('priceExternalLinks',p.externalLinks);
    setValue('priceSourcePath',w.sources.priceSnapshotPath||'./data/prices/price-snapshot.json');setValue('rulesSourcePath',w.sources.rulesSourcePath);setValue('rulesOutputMode',w.rules.outputMode);setValue('rulesTextSize',w.rules.textSize);
    const policy=w.policy||{};setChecked('workspaceAutoLoad',policy.autoLoad);setChecked('workspaceBuildOnlyChanged',policy.buildOnlyChanged);setChecked('workspaceIncludeRules',policy.includeRules);setChecked('workspaceIncludeProfiles',policy.includeProfiles);setChecked('workspaceIncludePrices',policy.includePrices);setChecked('workspaceIncludeWorkspace',policy.includeWorkspace);
    if(window.OutputDesigner)await applyDesign(w);
    const scanned=await scanAndSelect(w.selectedSets);
    let priceNote='Price loading skipped.';const pricePath=w.sources.priceSnapshotPath;
    if(p.enabled!==false&&pricePath&&window.PriceSnapshotManager){try{await PriceSnapshotManager.loadUrl(pricePath);priceNote='Price snapshot loaded.';}catch(error){priceNote=`Price snapshot unavailable: ${error.message||error}`;}}
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(w));}catch(e){}
    status('workspaceLoadStatus',`<strong>${esc(w.workspaceName)} loaded.</strong><br><strong>Selected sets restored:</strong> ${w.selectedSets.length}<br><strong>Discovered sets:</strong> ${scanned}<br><strong>Design:</strong> ${esc((w.design.inlineProfile&&w.design.inlineProfile.name)||w.sources.designProfileId||'current profile')}<br><strong>Prices:</strong> ${esc(priceNote)}`);
    dashboard(w.workspaceName);summaryCard(0,'Loaded','current');document.dispatchEvent(new CustomEvent('workspace-loaded',{detail:w}));return w;
  }

  async function loadWorkspacePath(auto){const path=(($('workspacePath')||{}).value||'./data/workspace.json').trim();try{if(!auto)status('workspaceLoadStatus',`Loading <code>${esc(path)}</code>...`);const res=await fetch(path,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);return applyWorkspace(await res.json(),path);}catch(error){if(!auto)status('workspaceLoadStatus',`<strong>Workspace load failed:</strong> ${esc(error.message||error)}`);else{status('workspaceLoadStatus',`No automatic workspace loaded (${esc(error.message||error)}). Current browser settings remain available.`);dashboard('Manual setup');}throw error;}}
  async function loadLocal(file){if(!file)return;let raw;if(/\.zip$/i.test(file.name)){if(typeof SimpleZipReader==='undefined')throw new Error('ZIP reader is not loaded.');const zr=new SimpleZipReader(await file.arrayBuffer());const name=zr.listEntries().find(n=>/(^|\/)workspace\.json$/i.test(n));if(!name)throw new Error('No workspace.json was found in the ZIP.');raw=JSON.parse(new TextDecoder().decode(await zr.getEntryBytes(name)));}else raw=JSON.parse(await file.text());return applyWorkspace(raw,file.name);}
  function saveWorkspace(){const w=currentWorkspace();state.workspace=w;downloadText('workspace.json',JSON.stringify(w,null,2));status('workspaceLoadStatus',`<strong>Workspace exported.</strong><br>Upload it as <code>data/workspace.json</code>.`);}

  function priceStatus(){if(!window.PriceSnapshotManager)return {text:'Unavailable',state:'error'};const s=PriceSnapshotManager.getSummary();if(!s.loaded)return {text:'Not loaded',state:'changed',summary:s};let age=null;if(s.snapshotDate){age=Math.floor((Date.now()-new Date(`${s.snapshotDate}T00:00:00`).getTime())/86400000);}return {text:`${s.recordCount.toLocaleString()} records${age==null?'':` · ${age}d old`}`,state:age!=null&&age>45?'changed':'current',summary:s,age};}
  function rowsHtml(records){if(!records.length)return '<p class="hint">No catalog sets are selected.</p>';return `<div class="workspace-change-scroll"><table class="workspace-change-table"><thead><tr><th>Item</th><th>Status</th><th>Reason</th></tr></thead><tbody>${records.map(r=>`<tr><td><strong>${esc(r.setCode||r.item)}</strong></td><td class="workspace-state-${r.state==='new'?'changed':r.state}">${esc(r.state==='new'?'New':r.state)}</td><td>${esc(r.reason)}</td></tr>`).join('')}</tbody></table></div>`;}

  async function checkWorkspace(){
    if(state.running)return;state.running=true;state.cancel=false;const btn=$('workspaceCheckBtn');if(btn)btn.disabled=true;status('workspaceDeploymentStatus','Checking sources and fingerprints...');
    try{
      const w=currentWorkspace();state.workspace=w;const options=CatalogProfileCore.gatherOptions();let codes=w.selectedSets.length?w.selectedSets:CatalogProfileCore.getAllSetCodes();
      const catalog=await CatalogProfileCore.inspectSetChanges(codes,options,html=>status('workspaceDeploymentStatus',html));
      let rules={changed:false,reason:'Rules checking disabled.',state:'info',evaluation:null};
      if(w.policy.includeRules&&window.RulesLibraryInternals&&RulesLibraryInternals.evaluateChange){try{const e=await RulesLibraryInternals.evaluateChange(w.sources.rulesSourcePath||'./data/rules/index.json',w.rules.outputMode||'hybrid',w.rules.textSize||'comfortable');rules={changed:e.changed,reason:e.reason,state:e.changed?'changed':'current',evaluation:e};}catch(error){rules={changed:false,reason:error.message||String(error),state:'error'};}}
      const price=priceStatus();
      const workspaceChanged=!state.loadedCanonical||canonicalWorkspace(w)!==state.loadedCanonical;
      const records=[{item:'Workspace configuration',setCode:'Workspace',state:workspaceChanged?'changed':'current',reason:workspaceChanged?'Current controls differ from the loaded workspace file':'Matches the loaded workspace file'}].concat(catalog.records,[{item:'Rules library',setCode:'Rules',state:rules.state,reason:rules.reason},{item:'Price snapshot',setCode:'Prices',state:price.state,reason:price.text}]);
      state.lastCheck={at:new Date().toISOString(),workspace:w,workspaceChanged,options,catalog,rules,price,records};
      summaryCard(0,workspaceChanged?'Settings changed':(w.workspaceName||'Loaded'),workspaceChanged?'changed':'current');summaryCard(1,catalog.errors&&catalog.errors.length?`${catalog.errors.length} scan error(s)`: `${catalog.changed.length} changed · ${catalog.skipped.length} current`,catalog.errors&&catalog.errors.length?'error':(catalog.changed.length?'changed':'current'));summaryCard(2,rules.state==='error'?'Check failed':rules.changed?'Needs build':'Current',rules.state);summaryCard(3,price.text,price.state);
      const time=$('workspaceCheckTime');if(time)time.textContent=`Checked ${new Date().toLocaleString()}`;const list=$('workspaceChangeList');if(list)list.innerHTML=rowsHtml(records);
      status('workspaceDeploymentStatus',catalog.changed.length||rules.changed||workspaceChanged?`<strong>Deployment needed.</strong><br>${catalog.changed.length} catalog(s), ${rules.changed?1:0} rules package, and ${workspaceChanged?1:0} workspace configuration need updating.`:'<strong>Everything checked is current.</strong><br>No rebuild or configuration upload is needed.');
      return state.lastCheck;
    }finally{state.running=false;if(btn)btn.disabled=false;}
  }

  async function optionalSource(files,path,include,label){if(!include||!path)return;try{files.push({name:repoPath(path),content:await fetchText(path)});}catch(error){files.push({name:`deployment-notes/${label}-missing.txt`,content:`Could not include ${path}: ${error.message||error}\n`});}}
  function deploymentReport(check,files){return [`MTG Builder v${VERSION} Deployment Report`,`Generated: ${new Date().toISOString()}`,`Workspace: ${check.workspace.workspaceName}`,`Catalogs changed: ${check.catalog.changed.length}`,`Catalogs unchanged/skipped: ${check.catalog.skipped.length}`,`Rules changed: ${check.rules.changed?'yes':'no'}`,`Price source: ${check.price.text}`,'','Files in this pack:',...files.map(f=>`- ${f.name}`),'','Upload the ZIP contents to the matching paths in the GitHub Pages branch. Unchanged files are intentionally omitted.'].join('\n');}

  async function buildDeploy(){
    if(state.running)return;
    let check;
    try { check=await checkWorkspace(); }
    catch(error){status('workspaceDeploymentStatus',`<strong>Pre-build check failed:</strong> ${esc(error.message||error)}`);return;}
    if(!check)return;
    state.running=true;state.cancel=false;const buildBtn=$('workspaceBuildDeployBtn'),cancelBtn=$('workspaceCancelBtn');if(buildBtn)buildBtn.disabled=true;if(cancelBtn)cancelBtn.disabled=false;status('workspaceDeploymentStatus','Preparing smart deployment...');
    try{
      const w=currentWorkspace();check.workspace=w;
      if(check.options&&check.options.profile==='compact-text')throw new Error('Smart deployment currently supports Card Profile — No Images and Card Profile — Embedded Images. Use the existing legacy build buttons for Compact Text Only.');
      if(check.catalog.errors&&check.catalog.errors.length)throw new Error(`${check.catalog.errors.length} selected set(s) could not be scanned. Correct those errors before building.`);
      if(!check.catalog.changed.length&&!check.rules.changed&&!check.workspaceChanged){status('workspaceDeploymentStatus','<strong>Everything is current.</strong><br>No deployment pack was generated, preventing an unnecessary upload or commit.');return;}
      const files=[];let manifest=check.catalog.manifest;
      const codes=w.policy.buildOnlyChanged?check.catalog.changed:(w.selectedSets.length?w.selectedSets:CatalogProfileCore.getAllSetCodes());
      if(codes.length){const result=await BatchImageProfileRunner.runBatch(codes,check.options,manifest,check.catalog.preloaded,{downloadOutputs:false,downloadManifest:false,outputRoot:'data/output'});manifest=result.manifest;files.push(...result.files);}
      if(state.cancel)throw new Error('Smart build cancelled.');
      if(w.policy.includeRules&&check.rules.changed&&window.RulesLibraryInternals&&RulesLibraryInternals.buildCaptured){const rr=await RulesLibraryInternals.buildCaptured(manifest,false);manifest=rr.manifest;files.push(...rr.files);}
      manifest.builderVersion=VERSION;manifest.workspace={workspaceName:w.workspaceName,workspaceVersion:w.version||VERSION,selectedSets:w.selectedSets,updatedAt:new Date().toISOString()};
      files.push({name:'data/output/build-manifest.json',content:JSON.stringify(manifest,null,2)});
      if(w.policy.includeWorkspace)files.push({name:'data/workspace.json',content:JSON.stringify(w,null,2)});
      await optionalSource(files,w.sources.profileLibraryPath,w.policy.includeProfiles,'profile-library');await optionalSource(files,w.sources.priceSnapshotPath,w.policy.includePrices,'price-snapshot');
      files.push({name:'DEPLOYMENT-REPORT.txt',content:deploymentReport(check,files)});
      if(typeof SimpleZip==='undefined')throw new Error('ZIP creator is not loaded.');const blob=SimpleZip.create(files);const stamp=new Date().toISOString().slice(0,10);downloadBlob(`mtg-builder-deployment-${stamp}.zip`,blob);
      status('workspaceDeploymentStatus',`<strong>Deployment pack created.</strong><br><strong>Catalog outputs:</strong> ${codes.length}<br><strong>Total packaged files:</strong> ${files.length}<br><strong>ZIP size:</strong> ${CatalogProfileCore.formatBytes(blob.size)}<div class="workspace-deploy-files"><ul>${files.map(f=>`<li><code>${esc(f.name)}</code></li>`).join('')}</ul></div>`);
      state.workspace=w;state.loadedCanonical=canonicalWorkspace(w);state.lastCheck=null;
    }catch(error){status('workspaceDeploymentStatus',`<strong>Smart deployment failed:</strong> ${esc(error.message||error)}`);}finally{state.running=false;if(buildBtn)buildBtn.disabled=false;if(cancelBtn)cancelBtn.disabled=true;}
  }

  function init(){
    if(typeof BuilderModules!=='undefined')BuilderModules.register('Workspace & Smart Deployment',VERSION);
    const load=$('workspaceLoadBtn');if(load)load.addEventListener('click',()=>loadWorkspacePath(false).catch(()=>{}));const local=$('workspaceLoadLocalBtn'),file=$('workspaceLocalFile');if(local&&file)local.addEventListener('click',()=>file.click());if(file)file.addEventListener('change',async()=>{try{await loadLocal(file.files&&file.files[0]);}catch(error){status('workspaceLoadStatus',`<strong>Workspace import failed:</strong> ${esc(error.message||error)}`);}file.value='';});const save=$('workspaceSaveBtn');if(save)save.addEventListener('click',saveWorkspace);const check=$('workspaceCheckBtn');if(check)check.addEventListener('click',()=>checkWorkspace().catch(error=>status('workspaceDeploymentStatus',`<strong>Check failed:</strong> ${esc(error.message||error)}`)));const build=$('workspaceBuildDeployBtn');if(build)build.addEventListener('click',buildDeploy);const cancel=$('workspaceCancelBtn');if(cancel)cancel.addEventListener('click',()=>{state.cancel=true;if(window.BatchImageProfileRunner){BatchImageProfileRunner.state.cancelBatch=true;BatchImageProfileRunner.state.cancelCurrent=true;}status('workspaceDeploymentStatus','Cancellation requested.');});
    try{const cached=localStorage.getItem(STORAGE_KEY);if(cached){const w=normalizeWorkspace(JSON.parse(cached));state.workspace=w;dashboard(`${w.workspaceName} (cached)`);}}catch(e){}
    setTimeout(()=>{if($('workspaceAutoLoad')&&$('workspaceAutoLoad').checked)loadWorkspacePath(true).catch(()=>{});},450);
  }
  window.WorkspaceAdmin={version:VERSION,currentWorkspace,applyWorkspace,checkWorkspace,buildDeploy};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
