/* Certificados NFT: panel institucional conectado al API real. */
(function () {
  'use strict';

  var state = { token: localStorage.getItem('certnft_token'), user: null, institutions: [], students: [], batches: [], template: null, excel: null, rows: [], prepared: [], job: null, activeInstitution: null, config: null, lastResult: null };
  var screens = { admin: ['instituciones', 'dashboard', 'solicitudes', 'wizard', 'config', 'verify', 'inst', 'progress', 'result'], viewer: ['panel', 'alumnos', 'verify'], student: ['certs', 'verify'], guest: ['verify'] };
  var homes = { admin: 'instituciones', viewer: 'panel', student: 'certs', guest: 'verify' };
  var titles = { instituciones: 'Instituciones', inst: 'Institucion', dashboard: 'Emisiones', solicitudes: 'Solicitudes de lotes', wizard: 'Nueva emision', config: 'Configuracion', panel: 'Dashboard', alumnos: 'Estudiantes', certs: 'Mis certificados', verify: 'Verificacion publica', progress: 'Procesando emision', result: 'Resultado y trazabilidad' };

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { var node = byId(id); if (node) node.textContent = value == null ? '-' : value; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function short(value) { value = String(value || ''); return value.length > 12 ? value.slice(0, 6) + '...' + value.slice(-4) : (value || '-'); }
  function money(value) { return '$' + Number(value || 0).toFixed(2); }
  function toast(message, error) { var node = byId('toast'); if (!node) return; setText('toast-msg', message); node.querySelector('.tk').textContent = error ? '!' : 'OK'; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(function () { node.classList.remove('show'); }, 2800); }
  function headers(json) { var output = {}; if (state.token) output.Authorization = 'Bearer ' + state.token; if (json) output['Content-Type'] = 'application/json'; return output; }
  function api(url, options) {
    options = options || {}; options.headers = Object.assign({}, headers(options.json), options.headers || {});
    if (options.json) { options.body = JSON.stringify(options.json); delete options.json; }
    return fetch(url, options).then(function (response) { return response.json().catch(function () { return {}; }).then(function (data) { if (!response.ok) throw new Error(data.message || data.error || 'No se pudo completar la operacion.'); return data; }); });
  }
  function role() { return state.user?.rol || 'guest'; }
  function allowed(screen) { return (screens[role()] || screens.guest).indexOf(screen) !== -1; }
  function homeScreen() { return homes[role()] || 'verify'; }
  function activeId() { return Number(state.activeInstitution || state.user?.institucion_id || state.user?.institucionId || state.institutions[0]?.id || 0); }
  function currentInstitution() { return state.institutions.find(function (item) { return Number(item.id) === activeId(); }) || state.institutions[0]; }
  function walletValid(wallet) { return /^0x[a-fA-F0-9]{40}$/.test(String(wallet || '')); }
  function statusTag(status) { return '<span class="tag ' + (status === 'activa' || status === 'aprobada' ? 'ok' : status === 'pendiente' || status === 'credito bajo' ? 'warn' : 'err') + '">' + esc(status) + '</span>'; }

  function applyUser() {
    var user = state.user || {}; var initials = (user.nombre || 'Usuario').split(/\s+/).slice(0, 2).map(function (part) { return part[0] || ''; }).join('').toUpperCase();
    setText('user-name', user.nombre || 'Visitante'); setText('user-role', { admin: 'Administracion', viewer: 'Consulta institucional', student: 'Estudiante' }[user.rol] || 'Acceso publico'); setText('user-initials', user.nombre ? initials : '-');
    document.querySelectorAll('[data-role]').forEach(function (node) { node.hidden = node.getAttribute('data-role') !== role(); });
    document.body.setAttribute('data-panel', role()); setText('logout-btn', state.user ? 'Cerrar sesion' : 'Iniciar sesion');
  }
  function showScreen(screen) {
    if (!allowed(screen)) screen = homeScreen(); applyUser();
    byId('view-login').classList.remove('active'); byId('view-app').classList.add('active');
    document.querySelectorAll('[data-screen-panel]').forEach(function (node) { node.style.display = node.getAttribute('data-screen-panel') === screen ? '' : 'none'; });
    document.querySelectorAll('.nav-item[data-screen]').forEach(function (node) { node.classList.toggle('active', node.getAttribute('data-screen') === screen); });
    setText('topbar-title', titles[screen] || 'Panel'); setText('topbar-crumb', screen === 'progress' ? 'Procesando' : ''); localStorage.setItem('certnft_screen', screen); window.scrollTo(0, 0);
    if (screen === 'instituciones' || screen === 'inst') renderInstitutions();
    if (screen === 'alumnos') loadStudents();
    if (screen === 'solicitudes') loadBatches();
    if (screen === 'dashboard') loadHistory();
    if (screen === 'panel') { loadBatches(); renderViewerPanel(); }
    if (screen === 'wizard') refreshWizard();
    if (screen === 'result') renderResult();
    if (screen === 'certs') loadMyCerts();
  }
  function fillInstitutionSelects() {
    document.querySelectorAll('[data-inst-select]').forEach(function (select) {
      var old = select.value; select.innerHTML = state.institutions.map(function (item) { return '<option value="' + item.id + '">' + esc(item.etiqueta) + ' - ' + esc(item.nombre) + '</option>'; }).join(''); select.value = old || String(activeId());
    });
  }

  function loadPanel() {
    return api('/api/panel/overview').then(function (data) { state.institutions = data.institutions || []; state.user = Object.assign({}, state.user || {}, data.usuario || {}); applyUser(); fillInstitutionSelects(); renderInstitutions(); return data; });
  }
  function renderInstitutions() {
    var totalCredit = state.institutions.reduce(function (sum, item) { return sum + Number(item.credito_usd || 0); }, 0), totalCerts = state.institutions.reduce(function (sum, item) { return sum + Number(item.certs || 0); }, 0);
    setText('st-inst-count', state.institutions.length); setText('st-inst-certs', totalCerts); setText('st-inst-gas', money(totalCredit));
    var body = byId('inst-body');
    if (body) body.innerHTML = state.institutions.map(function (item) { return '<tr><td><span class="nm">' + esc(item.nombre) + '</span><div class="ilabel">' + esc(item.etiqueta) + ' - ' + esc(item.responsable_nombre || 'Sin responsable') + '</div></td><td class="mono">' + esc(short(item.wallet)) + '</td><td class="mono" style="text-align:right">' + money(item.credito_usd) + '<div class="imeta">' + item.certs + ' certificados</div></td><td>' + statusTag(item.estado) + '</td><td style="text-align:right"><a class="link" data-open-inst="' + item.id + '">Ver</a> <a class="link" data-emit-inst="' + item.id + '">Emitir</a></td></tr>'; }).join('') || '<tr><td colspan="5" class="helper">Aun no hay instituciones registradas.</td></tr>';
    var item = currentInstitution();
    if (item) { setText('dt-name', item.nombre); setText('dt-label', item.etiqueta); setText('dt-user', item.responsable_nombre || '-'); setText('dt-email', item.responsable_correo || '-'); setText('dt-wallet', item.wallet || 'Sin wallet registrada'); setText('dt-gas', money(item.credito_usd)); setText('dt-certs', item.certs); setText('dt-deliv', item.delivered + ' / ' + item.certs); if (byId('dt-status')) byId('dt-status').innerHTML = statusTag(item.estado); }
    loadAccessRequests();
  }
  function loadAccessRequests() {
    if (role() !== 'admin') return Promise.resolve();
    return api('/api/panel/solicitudes-acceso').then(function (data) {
      var requests = data.solicitudes || []; setText('reqs-count', requests.length); setText('st-inst-alerts', requests.length); if (byId('reqs-card')) byId('reqs-card').hidden = !requests.length;
      var body = byId('reqs-body'); if (body) body.innerHTML = requests.map(function (request) { return '<tr><td><span class="nm">' + esc(request.nombre) + '</span><div class="imeta">' + esc(request.correo) + '</div></td><td>' + esc(request.institucion_nombre) + '</td><td class="mono">' + esc(request.creado_en) + '</td><td style="text-align:right"><button class="btn" data-resolve-request="' + request.id + '" data-action="aprobar">Aprobar</button> <a class="link" data-resolve-request="' + request.id + '" data-action="rechazar">Rechazar</a></td></tr>'; }).join('');
    }).catch(function () {});
  }

  function loadStudents() { return api('/api/panel/estudiantes?institucionId=' + activeId()).then(function (data) { state.students = data.estudiantes || []; renderStudents(); }); }
  function renderStudents() {
    var body = byId('st-body'); if (!body) return;
    body.innerHTML = state.students.map(function (student) { var valid = walletValid(student.wallet); return '<tr' + (valid ? '' : ' class="err"') + '><td class="nm">' + esc(student.nombre) + '</td><td>' + esc(student.correo || '-') + '</td><td class="mono">' + esc(short(student.wallet)) + '</td><td><span class="tag ' + (valid ? 'ok' : 'err') + '">' + (valid ? 'lista para emitir' : 'wallet pendiente') + '</span></td><td style="text-align:right"><a class="link" data-delete-student="' + student.id + '">Quitar</a></td></tr>'; }).join('') || '<tr><td colspan="5" class="helper">Agrega estudiantes para crear un lote.</td></tr>';
    setText('st-ok', state.students.filter(function (student) { return walletValid(student.wallet); }).length); setText('st-bad', state.students.filter(function (student) { return !walletValid(student.wallet); }).length); setText('st-total', state.students.length); renderBatchCost();
  }
  function renderBatchCost() {
    var count = state.students.filter(function (student) { return walletValid(student.wallet); }).length, total = count * 0.77, institution = currentInstitution();
    setText('cost-count', count); setText('cost-unit', money(0.77)); setText('cost-total', money(total)); setText('cost-credit', money(institution?.credito_usd)); setText('cost-after', money(Number(institution?.credito_usd || 0) - total)); if (byId('req-send')) byId('req-send').disabled = !count || !state.template || Number(institution?.credito_usd || 0) < total;
  }
  function loadBatches() { return api('/api/panel/lotes').then(function (data) { state.batches = data.lotes || []; renderBatches(); }); }
  function renderBatches() {
    var mine = role() === 'admin' ? state.batches : state.batches.filter(function (batch) { return Number(batch.institucion_id) === activeId(); });
    var mineBody = byId('bat-body'); if (mineBody) mineBody.innerHTML = mine.map(function (batch) { return '<tr><td class="mono">' + esc(batch.creado_en) + '</td><td class="nm">' + esc(batch.nombre) + '</td><td class="mono" style="text-align:right">' + batch.cantidad + '</td><td class="mono" style="text-align:right">' + money(batch.costo_usd) + '</td><td>' + esc(batch.plantilla_nombre || '-') + '</td><td>' + statusTag(batch.estado) + '</td></tr>'; }).join('');
    var body = byId('sol-body'); if (body) body.innerHTML = state.batches.map(function (batch) { var pending = batch.estado === 'pendiente'; return '<tr><td><span class="nm">' + esc(batch.institucion_nombre) + '</span><div class="ilabel">' + esc(batch.institucion_etiqueta) + '</div></td><td class="nm">' + esc(batch.nombre) + '<div class="imeta">' + batch.cantidad + ' certificados</div></td><td class="mono">' + money(batch.costo_usd) + '</td><td>' + statusTag(batch.estado) + '</td><td style="text-align:right">' + (pending ? '<button class="btn" data-resolve-batch="' + batch.id + '" data-action="aprobar">Autorizar</button> <a class="link" data-resolve-batch="' + batch.id + '" data-action="rechazar">Rechazar</a>' : '') + '</td></tr>'; }).join(''); setText('sol-count', state.batches.filter(function (batch) { return batch.estado === 'pendiente'; }).length);
  }
  function renderViewerPanel() { var institution = currentInstitution(); setText('dash-credit', money(institution?.credito_usd)); setText('dash-credit2', money(institution?.credito_usd)); setText('dash-open', state.batches.filter(function (batch) { return batch.estado === 'pendiente'; }).length); }
  function loadHistory() { return api('/api/certificados/historial').then(function (data) { var stats = data.stats || {}, emissions = data.emisiones || [], screen = document.querySelector('[data-screen-panel="dashboard"]'); setText('dash-certs', stats.totalEmitidos || 0); setText('dash-lotes', stats.totalLotes || 0); setText('dash-delivered', stats.entregados || 0); var statValues = screen ? screen.querySelectorAll('.stat .v') : []; if (statValues[0]) statValues[0].textContent = stats.totalEmitidos || 0; if (statValues[1]) statValues[1].textContent = stats.totalLotes || 0; if (statValues[2]) statValues[2].innerHTML = (stats.entregados || 0) + ' <small>/ ' + (stats.totalEmitidos || 0) + '</small>'; var body = screen && screen.querySelector('tbody'); if (body) body.innerHTML = emissions.slice(0, 15).map(function (item) { return '<tr><td class="mono">' + esc(item.creado_en) + '</td><td class="nm">' + esc(item.nombre_alumno) + '</td><td class="mono">' + esc(short(item.wallet_alumno)) + '</td><td class="mono">' + esc(item.token_id || '-') + '</td><td>' + statusTag(item.estado === 'nft_transferido' ? 'aprobada' : 'rechazada') + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="helper">Todavia no hay emisiones registradas.</td></tr>'; }).catch(function (error) { toast(error.message, true); }); }

  function refreshWizard() {
    var institution = currentInstitution(); if (!institution) return; fillInstitutionSelects(); setText('wz-inst-wallet', state.config?.universityWallet || institution.wallet || 'Sin wallet configurada'); setText('wz-inst-net', state.config?.network || 'Cargando red'); setText('wz-inst-gas', money(institution.credito_usd));
    document.querySelectorAll('[data-inst-name]').forEach(function (node) { node.textContent = institution.nombre; }); document.querySelectorAll('[data-inst-label]').forEach(function (node) { node.textContent = institution.etiqueta; }); document.querySelectorAll('[data-inst-wallet]').forEach(function (node) { node.textContent = state.config?.universityWallet || institution.wallet || '-'; });
  }
  function showStep(step) { document.querySelectorAll('.wstep').forEach(function (node) { node.style.display = Number(node.getAttribute('data-wstep')) === step ? '' : 'none'; }); document.querySelectorAll('#stepper .step').forEach(function (node) { var number = Number(node.getAttribute('data-step')); node.classList.toggle('current', number === step); node.classList.toggle('done', number < step); }); }
  function validateExcel() {
    if (!state.excel) return Promise.reject(new Error('Selecciona el Excel de estudiantes.')); var form = new FormData(); form.append('excel', state.excel);
    return fetch('/api/certificados/validar-excel', { method: 'POST', headers: headers(), body: form }).then(function (response) { return response.json().then(function (data) { if (!response.ok) throw new Error(data.message); return data; }); }).then(function (data) { state.rows = data.filas || []; renderValidation(); return data; });
  }
  function renderValidation() {
    var step = document.querySelector('[data-wstep="2"]'), table = step && step.querySelector('tbody'); if (!table) return; table.innerHTML = state.rows.slice(0, 20).map(function (row) { return '<tr' + (row.valido ? '' : ' class="err"') + '><td class="mono">' + row.row + '</td><td class="nm">' + esc(row.studentName) + '</td><td class="mono">' + esc(short(row.studentWallet)) + '</td><td><span class="tag ' + (row.valido ? 'ok' : 'err') + '">' + (row.valido ? 'valida' : esc(row.error)) + '</span></td></tr>'; }).join(''); var valid = state.rows.filter(function (row) { return row.valido; }).length, summary = step.querySelector('.summary-pill'); if (summary) summary.innerHTML = '<span class="num-ok"><b>' + valid + '</b> validas</span><span class="div"></span><span class="num-err"><b>' + (state.rows.length - valid) + '</b> con error</span><span class="div"></span><span>' + state.rows.length + ' totales</span>';
  }
  function prepareCertificates() {
    if (!state.template || !state.excel) return Promise.reject(new Error('Selecciona la plantilla PDF y el Excel.')); var form = new FormData(); form.append('plantilla', state.template); form.append('excel', state.excel); var loading = byId('gen-loading'), done = byId('gen-done'); if (loading) loading.style.display = ''; if (done) done.style.display = 'none';
    return fetch('/api/certificados/masivo/preparar', { method: 'POST', headers: headers(), body: form }).then(function (response) { return response.json().then(function (data) { if (!response.ok) throw new Error(data.message); return data; }); }).then(function (data) { state.prepared = data.certificados || []; setText('gen-pct', '100%'); var bar = document.querySelector('#gen-progress i'); if (bar) bar.style.width = '100%'; if (loading) loading.style.display = 'none'; if (done) done.style.display = ''; refreshWizard(); return data; });
  }
  function startEmission() { if (!state.prepared.length) return toast('Primero genera los certificados.', true); api('/api/certificados/masivo/emitir', { method: 'POST', json: { certificados: state.prepared, institucionId: activeId() } }).then(function (data) { state.job = data.jobId; showScreen('progress'); pollJob(); }).catch(function (error) { toast(error.message, true); }); }
  function pollJob() { if (!state.job) return; api('/api/certificados/masivo/emitir/' + state.job).then(function (data) { renderJob(data); if (data.status === 'procesando') setTimeout(pollJob, 2000); else byId('batch-go').disabled = false; }).catch(function (error) { toast(error.message, true); }); }
  function renderJob(data) {
    var details = data.details || [], complete = details.filter(function (item) { return ['confirmado', 'revisar_owner', 'error'].indexOf(item.stage) !== -1; }).length; setText('p1-counter', complete + ' de ' + details.length); var bar = document.querySelector('#p1-progress i'); if (bar) bar.style.width = (details.length ? complete / details.length * 100 : 0) + '%';
    var heading = document.querySelector('#phase1 .phh b'), description = document.querySelector('#phase1 .sub'); if (heading) heading.textContent = 'Emision directa a las wallets de estudiantes'; if (description) description.textContent = 'Cada certificado se firma y se envia mediante el proceso real de blockchain configurado en el servidor.';
    var body = document.querySelector('#mint-list tbody'); if (body) body.innerHTML = details.map(function (item, index) { var ok = item.stage === 'confirmado', failed = item.stage === 'error', label = failed ? 'error' : ok ? 'confirmado' : item.stage === 'estampando_qr' ? 'estampando QR' : item.stage; return '<tr' + (failed ? ' class="err"' : '') + '><td class="mono">' + (index + 1) + '</td><td class="nm">' + esc(item.studentName) + '</td><td class="mono">' + esc(item.tokenId || '-') + '</td><td><span class="tag ' + (failed ? 'err' : ok ? 'ok' : 'run') + '">' + esc(label) + '</span></td></tr>'; }).join(''); setText('p1-tag', data.status === 'completado' ? 'completado' : 'en proceso'); if (data.status === 'completado') { byId('phase1').classList.add('done'); byId('phase2').style.display = 'none'; byId('checkpoint').style.display = 'none'; } state.lastResult = data;
  }
  function renderResult() { var result = state.lastResult || { details: [] }, ok = result.details.filter(function (item) { return item.status === 'nft_transferido'; }).length, screen = document.querySelector('[data-screen-panel="result"]'); if (screen) { var summary = screen.querySelector('.summary-pill'); if (summary) summary.innerHTML = '<span><b>' + result.details.length + '</b> procesados</span><span class="div"></span><span class="num-ok"><b>' + ok + '</b> entregados</span><span class="div"></span><span class="num-err"><b>' + (result.details.length - ok) + '</b> con error</span>'; var body = screen.querySelector('tbody'); if (body) body.innerHTML = result.details.map(function (item) { return '<tr><td class="nm">' + esc(item.studentName) + '</td><td class="mono">' + esc(short(item.studentWallet)) + '</td><td class="mono">' + esc(item.tokenId || '-') + '</td><td><span class="tag ' + (item.status === 'nft_transferido' ? 'ok' : 'err') + '">' + esc(item.status || item.stage) + '</span></td><td>' + (item.explorerUrl ? '<a class="txlink" target="_blank" href="' + encodeURI(item.explorerUrl) + '">Ver transaccion</a>' : '-') + (item.finalPdfUrl ? ' · <a class="txlink" target="_blank" href="' + encodeURI(item.finalPdfUrl) + '">PDF con QR</a>' : item.qrError ? ' · <span class="tag warn">QR pendiente</span>' : '') + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="helper">Aun no hay una emision para mostrar.</td></tr>'; } }
  function verify() {
    var query = (byId('vf-input').value || '').trim(); if (!query) return toast('Ingresa el Token ID o el CID del certificado.', true);
    api('/api/public/verificar?q=' + encodeURIComponent(query), { headers: {} }).then(function (data) {
      var cert = data.certificado; byId('vf-idle').hidden = true; byId('vf-bad').hidden = true; byId('vf-ok').hidden = false;
      setText('vf-student', cert.nombreAlumno || 'No registrado'); setText('vf-course', 'Certificado NFT'); setText('vf-inst', cert.institucion || 'Institucion emisora'); setText('vf-date', cert.fecha || '-'); setText('vf-token', '#' + cert.tokenId); setText('vf-owner', cert.owner); setText('vf-cid', cert.metadataCid || cert.tokenURI); setText('vf-contract', cert.contractAddress); setText('vf-net', cert.network); setText('vf-tx', short(cert.txHash));
      setText('vf-note', cert.ownerCoincide === false ? 'El token existe en el contrato, pero hoy pertenece a otra wallet distinta a la del alumno.' : 'El token existe en el contrato y su tokenURI coincide con el registrado.');
      var pdf = byId('vf-pdf'), pdfUrl = cert.finalPdfUrl || cert.pdfUrl; pdf.hidden = !pdfUrl; if (pdfUrl) pdf.href = pdfUrl; pdf.textContent = cert.finalPdfUrl ? '↓ PDF del certificado (con QR)' : '↓ PDF minteado (sin QR)';
      var explorer = byId('vf-explorer'); explorer.hidden = !cert.explorerUrl; if (cert.explorerUrl) explorer.href = cert.explorerUrl;
    }).catch(function (error) { byId('vf-idle').hidden = true; byId('vf-ok').hidden = true; byId('vf-bad').hidden = false; setText('vf-badmsg', error.message); });
  }
  // Vista del estudiante: certificados emitidos a la wallet de su cuenta.
  function loadMyCerts() {
    return api('/api/panel/mis-certificados').then(function (data) {
      var certs = data.certificados || [], grid = byId('sc-grid');
      byId('sw-addr').value = data.wallet || ''; setText('sc-count', certs.length); setText('sc-valid', certs.length); setText('sc-rev', 0);
      byId('sc-empty').hidden = certs.length > 0;
      grid.innerHTML = certs.map(function (cert) {
        var pdf = cert.final_pdf_url || (cert.pdf_cid ? 'https://gateway.pinata.cloud/ipfs/' + cert.pdf_cid : '');
        return '<div class="certcard"><div class="cc-seal"><span class="cc-ring">✓</span><span class="cc-tok mono">#CERT-' + esc(cert.token_id) + '</span></div><div class="cc-body"><span class="tag ok">vigente</span><h3>Certificado NFT · ' + esc(cert.nombre_alumno) + '</h3><p class="cc-inst">' + esc(cert.institucion_nombre || 'Institucion emisora') + '</p>'
          + '<dl class="cc-meta"><dt>Token ID</dt><dd class="mono">' + esc(cert.token_id) + '</dd><dt>Fecha</dt><dd>' + esc(cert.creado_en || '-') + '</dd><dt>Transaccion</dt><dd class="mono">' + esc(short(cert.tx_hash)) + '</dd></dl>'
          + '<div class="cc-foot">' + (pdf ? '<a class="btn" href="' + esc(pdf) + '" target="_blank" rel="noopener">PDF</a>' : '') + (cert.explorer_url ? '<a class="btn" href="' + esc(cert.explorer_url) + '" target="_blank" rel="noopener">Transaccion</a>' : '') + '<a class="btn btn--primary" href="?token=' + esc(cert.token_id) + '">Verificar</a></div></div></div>';
      }).join('');
    }).catch(function (error) { toast(error.message, true); });
  }
  function logout() {
    localStorage.removeItem('certnft_token'); localStorage.removeItem('certnft_screen'); state.token = null; state.user = null; state.institutions = []; state.students = []; state.batches = [];
    if (window.location.search) { window.location.href = window.location.pathname; return; }
    byId('view-app').classList.remove('active'); byId('view-login').classList.add('active'); byId('li-pass').value = ''; applyUser();
  }
  function clearVerify() { byId('vf-input').value = ''; byId('vf-ok').hidden = true; byId('vf-bad').hidden = true; byId('vf-idle').hidden = false; byId('vf-input').focus(); }
  // El QR del PDF final apunta a "<sitio>/?token=<tokenId>": al abrirlo se
  // muestra la verificacion publica ya resuelta, sin iniciar sesion.
  function verifyFromUrl() {
    var params = new URLSearchParams(window.location.search), query = params.get('token') || params.get('cid'); if (!query) return false;
    showScreen('verify'); byId('vf-input').value = query; verify(); return true;
  }

  function bindFiles() {
    var templateInput = document.createElement('input'), excelInput = document.createElement('input'); templateInput.type = 'file'; templateInput.accept = 'application/pdf'; templateInput.hidden = true; excelInput.type = 'file'; excelInput.accept = '.xlsx,.xls'; excelInput.hidden = true; document.body.append(templateInput, excelInput);
    templateInput.addEventListener('change', function () { state.template = templateInput.files[0] || null; if (state.template) toast('Plantilla seleccionada: ' + state.template.name); renderBatchCost(); }); excelInput.addEventListener('change', function () { state.excel = excelInput.files[0] || null; if (state.excel) validateExcel().then(function () { toast('Lista validada.'); }).catch(function (error) { toast(error.message, true); }); });
    document.querySelector('[data-wstep="1"] .filechip')?.addEventListener('click', function () { templateInput.click(); }); document.querySelector('[data-wstep="2"] .filechip')?.addEventListener('click', function () { excelInput.click(); });
  }
  function bindEvents() {
    document.addEventListener('click', function (event) {
      var node = event.target.closest('button,a'); if (!node) return;
      if (node.hasAttribute('data-auth-tab')) { document.querySelectorAll('[data-auth]').forEach(function (panel) { panel.hidden = panel.getAttribute('data-auth') !== node.getAttribute('data-auth-tab'); }); document.querySelectorAll('[data-auth-tab]').forEach(function (tab) { tab.classList.toggle('on', tab === node); }); return; }
      if (node.id === 'login-btn') { api('/api/login', { method: 'POST', json: { correo: byId('li-user').value.trim(), contrasena: byId('li-pass').value } }).then(function (data) { state.token = data.token; state.user = data.usuario; localStorage.setItem('certnft_token', state.token); localStorage.removeItem('certnft_screen'); return loadPanel(); }).then(function () { return api('/api/certificados/config'); }).then(function (config) { state.config = config; showScreen(homeScreen()); }).catch(function (error) { toast(error.message, true); }); return; }
      if (node.id === 'reg-btn') { api('/api/register', { method: 'POST', json: { nombre: byId('rg-name').value.trim(), correo: byId('rg-mail').value.trim(), contrasena: byId('rg-pass').value, institucionId: Number(byId('rg-inst').value) } }).then(function (data) { toast(data.mensaje); }).catch(function (error) { toast(error.message, true); }); return; }
      if (node.id === 'public-verify') { showScreen('verify'); return; }
      if (node.id === 'logout-btn') { logout(); return; }
      if (node.id === 'sw-save') { api('/api/panel/mi-wallet', { method: 'PUT', json: { wallet: byId('sw-addr').value.trim() } }).then(function (data) { state.user.wallet = data.wallet; toast('Wallet guardada.'); return loadMyCerts(); }).catch(function (error) { toast(error.message, true); }); return; }
      if (node.id === 'sw-copy') { navigator.clipboard?.writeText(byId('sw-addr').value).then(function () { toast('Direccion copiada.'); }); return; }
      if (node.hasAttribute('data-screen') || node.hasAttribute('data-goto')) { showScreen(node.getAttribute('data-screen') || node.getAttribute('data-goto')); return; }
      if (node.id === 'inst-new-btn') { byId('inst-form').hidden = false; return; }
      if (node.id === 'inst-form-cancel' || node.id === 'inst-form-cancel2') { byId('inst-form').hidden = true; return; }
      if (node.id === 'inst-save') { api('/api/panel/instituciones', { method: 'POST', json: { nombre: byId('nf-name').value, etiqueta: byId('nf-label').value, responsableNombre: byId('nf-user').value, responsableCorreo: byId('nf-mail').value, wallet: byId('nf-wallet').value } }).then(function () { byId('inst-form').hidden = true; return loadPanel(); }).then(function () { toast('Institucion creada.'); }).catch(function (error) { toast(error.message, true); }); return; }
      if (node.hasAttribute('data-open-inst')) { state.activeInstitution = Number(node.getAttribute('data-open-inst')); showScreen('inst'); return; }
      if (node.hasAttribute('data-emit-inst')) { state.activeInstitution = Number(node.getAttribute('data-emit-inst')); showScreen('wizard'); return; }
      if (node.hasAttribute('data-resolve-request')) { api('/api/panel/solicitudes-acceso/' + node.getAttribute('data-resolve-request') + '/resolver', { method: 'POST', json: { accion: node.getAttribute('data-action') } }).then(loadPanel).then(function () { toast('Solicitud actualizada.'); }).catch(function (error) { toast(error.message, true); }); return; }
      if (node.id === 'st-add') { api('/api/panel/estudiantes', { method: 'POST', json: { institucionId: activeId(), nombre: byId('st-name').value, correo: byId('st-mail').value, wallet: byId('st-wallet').value } }).then(loadStudents).then(function () { byId('st-name').value = ''; byId('st-mail').value = ''; byId('st-wallet').value = ''; toast('Estudiante guardado.'); }).catch(function (error) { toast(error.message, true); }); return; }
      if (node.hasAttribute('data-delete-student')) { api('/api/panel/estudiantes/' + node.getAttribute('data-delete-student'), { method: 'DELETE' }).then(loadStudents).catch(function (error) { toast(error.message, true); }); return; }
      if (node.id === 'req-send') { var valid = state.students.filter(function (student) { return walletValid(student.wallet); }).length; api('/api/panel/lotes', { method: 'POST', json: { institucionId: activeId(), nombre: byId('req-lote').value || 'Lote ' + new Date().toLocaleDateString(), plantillaNombre: state.template?.name, cantidad: valid } }).then(loadBatches).then(function () { toast('Lote enviado al administrador.'); }).catch(function (error) { toast(error.message, true); }); return; }
      if (node.hasAttribute('data-resolve-batch')) { api('/api/panel/lotes/' + node.getAttribute('data-resolve-batch') + '/resolver', { method: 'POST', json: { accion: node.getAttribute('data-action') } }).then(function () { return Promise.all([loadBatches(), loadPanel()]); }).then(function () { toast('Lote actualizado.'); }).catch(function (error) { toast(error.message, true); }); return; }
      if (node.id === 'vf-go') { verify(); return; }
      if (node.id === 'vf-clear' || node.id === 'vf-clear2') { clearVerify(); return; }
      if (node.hasAttribute('data-wnext')) { var next = Number(node.getAttribute('data-wnext')); if (next === 2 && !state.template) return toast('Selecciona una plantilla PDF.', true); if (next === 3) { prepareCertificates().then(function () { showStep(3); }).catch(function (error) { toast(error.message, true); }); return; } showStep(next); return; }
      if (node.hasAttribute('data-wprev')) { showStep(Number(node.getAttribute('data-wprev'))); return; }
      if (node.id === 'emit-btn') { startEmission(); return; }
      if (node.id === 'batch-go') { renderResult(); showScreen('result'); return; }
    });
    document.addEventListener('change', function (event) { if (event.target.id === 'wz-inst') { state.activeInstitution = Number(event.target.value); refreshWizard(); } if (event.target.id === 'conf-check') byId('emit-btn').disabled = !event.target.checked; }); byId('vf-input')?.addEventListener('keydown', function (event) { if (event.key === 'Enter') verify(); });
  }
  function boot() {
    bindFiles(); bindEvents(); showStep(1); api('/api/public/instituciones', { headers: {} }).then(function (data) { state.institutions = data.instituciones || []; fillInstitutionSelects(); }).catch(function () {});
    var fromUrl = verifyFromUrl();
    if (!state.token) return; api('/api/me').then(function (data) { state.user = data.usuario; return loadPanel(); }).then(function () { return api('/api/certificados/config'); }).then(function (config) { state.config = config; showScreen(fromUrl ? 'verify' : localStorage.getItem('certnft_screen') || homeScreen()); }).catch(function () { localStorage.removeItem('certnft_token'); state.token = null; });
  }
  boot();
})();
