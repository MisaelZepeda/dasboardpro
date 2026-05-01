// 1. CONFIGURACIÓN E INICIALIZACIÓN
const firebaseConfig = {
    apiKey: "AIzaSyD86xvnjFFHkdMhvHPOkYUn8_PdHgNOEK0",
    authDomain: "misuperappfinanciera.firebaseapp.com",
    databaseURL: "https://misuperappfinanciera-default-rtdb.firebaseio.com",
    projectId: "misuperappfinanciera",
    storageBucket: "misuperappfinanciera.firebasestorage.app",
    messagingSenderId: "320368053330",
    appId: "1:320368053330:web:c85ec9a1108be81617a38b"
};
firebase.initializeApp(firebaseConfig); const auth = firebase.auth(); const db = firebase.database();
let state = { cuentas: [], transacciones: [], presupuestos: {}, currentBase64: "", selectedColor: "#3b82f6" };
let chartInstance = null; let currentEditId = null; let currentMovMode = 'pago'; 

// 2. SEGURIDAD DE SESIÓN
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
let inactivityTimer;
function resetTimer() {
    clearTimeout(inactivityTimer);
    if(auth.currentUser) inactivityTimer = setTimeout(() => { auth.signOut().then(() => window.location.reload()); }, 15 * 60 * 1000);
}
window.onload = resetTimer; document.onmousemove = resetTimer; document.onkeypress = resetTimer; document.ontouchstart = resetTimer;

// 3. COMPRESOR, AUTH LOGIC Y MEJORAS UX
function comprimirImagen(file, callback) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const MAX_SIZE = 300; 
            let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
            else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
            canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
}

let regBase64 = "";
if(document.getElementById('regFoto')) document.getElementById('regFoto').addEventListener('change', function(e) { if(e.target.files[0]) comprimirImagen(e.target.files[0], (base64) => { regBase64 = base64; }); });

function toggleAuthForm(type) { document.getElementById('loginForm').style.display = type === 'login' ? 'block' : 'none'; document.getElementById('registerForm').style.display = type === 'register' ? 'block' : 'none'; document.getElementById('resetForm').style.display = type === 'reset' ? 'block' : 'none'; }
function handleLogin() { auth.signInWithEmailAndPassword(document.getElementById('logEmail').value, document.getElementById('logPass').value).catch(e => alert(e.message)); }
function handleRegistro() { 
    const email = document.getElementById('regEmail').value, pass = document.getElementById('regPass').value, nombre = document.getElementById('regNombre').value;
    if(!nombre) { alert("El nombre es obligatorio"); return; }
    auth.createUserWithEmailAndPassword(email, pass).then((cred) => {
        const defaultPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=3b82f6&color=fff&size=128`;
        db.ref(`Usuarios/${cred.user.uid}/perfil`).set({ nombre: nombre, foto: regBase64 || defaultPic, color: "#3b82f6" }).then(() => alert("¡Bienvenido " + nombre + "!"));
    }).catch(e => alert(e.message)); 
}
function handleResetPassword() { auth.sendPasswordResetEmail(document.getElementById('resetEmail').value).then(() => { alert("Enviado"); toggleAuthForm('login'); }).catch(e => alert(e.message)); }
function handleLogout() { auth.signOut().then(() => window.location.reload()); }

function mostrarFraseDiaria() {
    const frases = [ "El éxito es la suma de pequeños esfuerzos repetidos día tras día.", "Cuida de tus pequeños gastos; un pequeño agujero hunde un gran barco.", "La riqueza no consiste en tener grandes posesiones, sino en tener pocas necesidades.", "No ahorres lo que te queda después de gastar, gasta lo que te queda después de ahorrar.", "El mejor momento para plantar un árbol fue hace 20 años. El segundo mejor momento es ahora.", "El dinero es una herramienta. Te llevará a donde desees, pero no te reemplazará como conductor.", "La educación financiera es el activo más poderoso que puedes tener.", "Tu futuro financiero depende de lo que hagas hoy, no mañana.", "No trabajes por el dinero, haz que el dinero trabaje para ti.", "El conocimiento es la mejor inversión que puedes hacer." ];
    const hoy = new Date(); const diaDelAnio = Math.floor((hoy - new Date(hoy.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    if(document.getElementById('fraseMotivadora')) document.getElementById('fraseMotivadora').innerText = `"${frases[diaDelAnio % frases.length]}"`;
}
setTimeout(() => {
    const enterParaLoguear = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleLogin(); } };
    if(document.getElementById('logEmail')) document.getElementById('logEmail').addEventListener('keypress', enterParaLoguear);
    if(document.getElementById('logPass')) document.getElementById('logPass').addEventListener('keypress', enterParaLoguear);
    mostrarFraseDiaria();
}, 500);

// 4. ESTADO EN TIEMPO REAL CON PANTALLA DE CARGA Y RETRASO
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('loginScreen').style.display = 'none'; document.getElementById('appDashboard').style.display = 'block'; 
        if(document.getElementById('loader')) document.getElementById('loader').style.display = 'flex';
        resetTimer();
        db.ref('Usuarios/' + user.uid).on('value', snap => {
            const data = snap.val() || {}; 
            state.cuentas = data.cuentas ? Object.values(data.cuentas) : []; 
            state.transacciones = data.transacciones ? Object.entries(data.transacciones).map(([id, val]) => ({...val, firebaseId: id})) : [];
            state.presupuestos = data.presupuestos || {};
            
            const p = data.perfil || { nombre: "Usuario", foto: "https://via.placeholder.com/100", color: "#3b82f6" };
            state.selectedColor = p.color; document.documentElement.style.setProperty('--primary', p.color);
            document.getElementById('headerGreeting').innerText = `Hola ${p.nombre} :)`; document.getElementById('headerFoto').src = p.foto; document.getElementById('perfDisplayNombre').innerText = p.nombre; document.getElementById('perfDisplayFoto').src = p.foto;
            if(document.getElementById('perfNombre')) document.getElementById('perfNombre').value = p.nombre;
            
            renderAll();
            
            setTimeout(() => { if(document.getElementById('loader')) document.getElementById('loader').style.display = 'none'; }, 3000);
        });
    } else { 
        document.getElementById('loginScreen').style.display = 'block'; document.getElementById('appDashboard').style.display = 'none'; 
        if(document.getElementById('loader')) document.getElementById('loader').style.display = 'none'; clearTimeout(inactivityTimer); 
    }
});

// 5. NAVEGACIÓN Y UI
function toggleUserMenu(e) { e.stopPropagation(); document.getElementById('userMenu').classList.toggle('show'); }
function closeDropdowns() { document.getElementById('userMenu').classList.remove('show'); }
function cambiarTab(id, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active'); if(btn) btn.classList.add('active'); closeDropdowns(); window.scrollTo(0,0);
    currentEditId = null; document.querySelectorAll('form').forEach(f => { if(!f.closest('#tab-perfil')) f.reset(); });
    ['inCuenta', 'gaFuente', 'movOrigen', 'movDestino'].forEach(eid => { if(document.getElementById(eid)) document.getElementById(eid).disabled = false; });
    if(document.getElementById('ingresoFormTitle')) document.getElementById('ingresoFormTitle').innerText = "Nuevo Ingreso"; 
    if(document.getElementById('gastoFormTitle')) document.getElementById('gastoFormTitle').innerText = "Nuevo Gasto"; 
    if(document.getElementById('movTitle')) document.getElementById('movTitle').innerText = "Nuevo Movimiento";
}

// 6. LOGICA TRANSACCIONAL ROBUSTA
function revertirTransaccion(fid) {
    const t = state.transacciones.find(x => x.firebaseId === fid); if (!t) return {}; let updates = {};
    if (t.tipo === 'ingreso') { const c = state.cuentas.find(x => x.id == t.cuentaId); if(c) updates[`cuentas/${c.id}/saldo`] = c.saldo - t.monto; } 
    else if (t.tipo === 'gasto') { const c = state.cuentas.find(x => x.id == t.cuentaId); if(c) updates[`cuentas/${c.id}/saldo`] = c.tipo === 'debito' ? c.saldo + t.monto : c.saldo - t.monto; } 
    else if (t.tipo === 'movimiento') { const or = state.cuentas.find(x => x.id == t.origenId), des = state.cuentas.find(x => x.id == t.destinoId); if(or) updates[`cuentas/${or.id}/saldo`] = or.saldo + t.monto; if(des) updates[`cuentas/${des.id}/saldo`] = des.tipo === 'debito' ? des.saldo - t.monto : des.saldo + t.monto; }
    return updates;
}
function eliminarTransaccion(fid) { if(!confirm("¿Borrar y devolver saldos?")) return; let updates = revertirTransaccion(fid); updates[`transacciones/${fid}`] = null; db.ref(`Usuarios/${auth.currentUser.uid}`).update(updates); }

function editIngreso(fid) { const t = state.transacciones.find(x => x.firebaseId === fid); cambiarTab('ingresos'); document.getElementById('inDesc').value = t.desc; document.getElementById('inMonto').value = t.monto; document.getElementById('inCuenta').value = t.cuentaId; document.getElementById('inCuenta').disabled = true; currentEditId = fid; document.getElementById('ingresoFormTitle').innerText = "Editando Ingreso (Cuenta Fija)"; }
function handleIngreso(e) {
    e.preventDefault(); const m = parseFloat(document.getElementById('inMonto').value); let updates = currentEditId ? revertirTransaccion(currentEditId) : {};
    const cId = currentEditId ? state.transacciones.find(x => x.firebaseId === currentEditId).cuentaId : document.getElementById('inCuenta').value; const c = state.cuentas.find(x => x.id == cId);
    let currentSaldo = updates[`cuentas/${c.id}/saldo`] !== undefined ? updates[`cuentas/${c.id}/saldo`] : c.saldo;
    const id = currentEditId || db.ref(`Usuarios/${auth.currentUser.uid}/transacciones`).push().key; const oldFecha = currentEditId ? state.transacciones.find(x => x.firebaseId === currentEditId).fecha : new Date().toISOString().split('T')[0];
    updates[`transacciones/${id}`] = { desc: document.getElementById('inDesc').value, monto: m, tipo: 'ingreso', cuentaId: c.id, fecha: oldFecha }; updates[`cuentas/${c.id}/saldo`] = currentSaldo + m;
    db.ref(`Usuarios/${auth.currentUser.uid}`).update(updates).then(() => { e.target.reset(); currentEditId = null; document.getElementById('inCuenta').disabled = false; document.getElementById('ingresoFormTitle').innerText = "Nuevo Ingreso"; });
}

function editGasto(fid) { const t = state.transacciones.find(x => x.firebaseId === fid); cambiarTab('gastos'); document.getElementById('gaDesc').value = t.desc; document.getElementById('gaMonto').value = t.monto; document.getElementById('gaCat').value = t.cat; document.getElementById('gaFuente').value = t.cuentaId; document.getElementById('gaFuente').disabled = true; currentEditId = fid; document.getElementById('gastoFormTitle').innerText = "Editando Gasto (Cuenta Fija)"; }
function handleGasto(e) {
    e.preventDefault(); const m = parseFloat(document.getElementById('gaMonto').value); let updates = currentEditId ? revertirTransaccion(currentEditId) : {};
    const cId = currentEditId ? state.transacciones.find(x => x.firebaseId === currentEditId).cuentaId : document.getElementById('gaFuente').value; const c = state.cuentas.find(x => x.id == cId);
    let currentSaldo = updates[`cuentas/${c.id}/saldo`] !== undefined ? updates[`cuentas/${c.id}/saldo`] : c.saldo;
    const id = currentEditId || db.ref(`Usuarios/${auth.currentUser.uid}/transacciones`).push().key; const oldFecha = currentEditId ? state.transacciones.find(x => x.firebaseId === currentEditId).fecha : new Date().toISOString().split('T')[0];
    updates[`transacciones/${id}`] = { desc: document.getElementById('gaDesc').value, cat: document.getElementById('gaCat').value, monto: m, tipo: 'gasto', cuentaId: c.id, fecha: oldFecha }; updates[`cuentas/${c.id}/saldo`] = c.tipo === 'debito' ? currentSaldo - m : currentSaldo + m;
    db.ref(`Usuarios/${auth.currentUser.uid}`).update(updates).then(() => { e.target.reset(); currentEditId = null; document.getElementById('gaFuente').disabled = false; document.getElementById('gastoFormTitle').innerText = "Nuevo Gasto"; });
}

function setMovMode(mode) { currentMovMode = mode; document.getElementById('btnModoPago').style.background = mode === 'pago' ? 'var(--primary)' : 'var(--muted)'; document.getElementById('btnModoTras').style.background = mode === 'traspaso' ? 'var(--primary)' : 'var(--muted)'; document.getElementById('lblDestino').innerText = mode === 'pago' ? 'Destino (Crédito):' : 'Destino (Débito):'; actualizarSelects(); }
function editMovimiento(fid) { const t = state.transacciones.find(x => x.firebaseId === fid); cambiarTab('traspasos'); setMovMode(t.subtipo || 'traspaso'); document.getElementById('movOrigen').value = t.origenId; document.getElementById('movDestino').value = t.destinoId; document.getElementById('movMonto').value = t.monto; document.getElementById('movOrigen').disabled = true; document.getElementById('movDestino').disabled = true; currentEditId = fid; document.getElementById('movTitle').innerText = "Editando Movimiento"; }
function handleMovimiento(e) {
    e.preventDefault(); const m = parseFloat(document.getElementById('movMonto').value); let updates = currentEditId ? revertirTransaccion(currentEditId) : {};
    const orId = currentEditId ? state.transacciones.find(x => x.firebaseId === currentEditId).origenId : document.getElementById('movOrigen').value, desId = currentEditId ? state.transacciones.find(x => x.firebaseId === currentEditId).destinoId : document.getElementById('movDestino').value;
    const or = state.cuentas.find(x => x.id == orId), des = state.cuentas.find(x => x.id == desId);
    let sOr = updates[`cuentas/${or.id}/saldo`] !== undefined ? updates[`cuentas/${or.id}/saldo`] : or.saldo, sDes = updates[`cuentas/${des.id}/saldo`] !== undefined ? updates[`cuentas/${des.id}/saldo`] : des.saldo;
    updates[`cuentas/${or.id}/saldo`] = sOr - m; updates[`cuentas/${des.id}/saldo`] = des.tipo === 'debito' ? sDes + m : sDes - m;
    const id = currentEditId || db.ref(`Usuarios/${auth.currentUser.uid}/transacciones`).push().key, oldFecha = currentEditId ? state.transacciones.find(x => x.firebaseId === currentEditId).fecha : new Date().toISOString().split('T')[0];
    updates[`transacciones/${id}`] = { tipo: 'movimiento', subtipo: currentMovMode, monto: m, desc: currentMovMode === 'pago' ? `Pago a ${des.nombre}` : `Traspaso a ${des.nombre}`, origenId: or.id, destinoId: des.id, fecha: oldFecha };
    if (currentMovMode === 'pago') { const mesActual = new Date().getMonth(); updates[`cuentas/${des.id}/mesPagado`] = mesActual; }
    db.ref(`Usuarios/${auth.currentUser.uid}`).update(updates).then(() => { e.target.reset(); currentEditId = null; document.getElementById('movOrigen').disabled = false; document.getElementById('movDestino').disabled = false; document.getElementById('movTitle').innerText = "Nuevo Movimiento"; alert("Movimiento procesado."); });
}

function sumarInteres(id) {
    const m = parseFloat(prompt("Interés generado hoy ($):")); if (!m || isNaN(m) || m <= 0) return;
    const c = state.cuentas.find(x => x.id == id); if (!c) return;
    const transId = db.ref(`Usuarios/${auth.currentUser.uid}/transacciones`).push().key;
    let updates = {}; updates[`transacciones/${transId}`] = { desc: `Rendimiento`, monto: m, tipo: 'ingreso', cuentaId: c.id, fecha: new Date().toISOString().split('T')[0] }; updates[`cuentas/${c.id}/saldo`] = c.saldo + m;
    db.ref(`Usuarios/${auth.currentUser.uid}`).update(updates);
}

// 7. ZONA DE PELIGRO Y BACKUPS
function resetearCuenta() { if(!confirm("⚠️ ¿Borrar historial y dejar saldos en $0?")) return; let updates = {}; updates['transacciones'] = null; state.cuentas.forEach(c => { updates[`cuentas/${c.id}/saldo`] = 0; updates[`cuentas/${c.id}/mesPagado`] = null; }); db.ref(`Usuarios/${auth.currentUser.uid}`).update(updates).then(() => alert("Restablecido a $0.")); }
function eliminarUsuario() {
    if(!confirm("🚨 ¡PELIGRO! Esto borrará tu cuenta de la BD permanentemente. ¿Continuar?")) return; const user = auth.currentUser;
    db.ref(`Usuarios/${user.uid}`).remove().then(() => { user.delete().then(() => { alert("Cuenta eliminada."); window.location.reload(); }).catch(e => { if(e.code === 'auth/requires-recent-login') { alert("Por seguridad, vuelve a iniciar sesión y repite este proceso."); auth.signOut().then(() => window.location.reload()); } else alert(e.message); }); });
}
function exportarBackup() {
    db.ref(`Usuarios/${auth.currentUser.uid}`).once('value').then(snap => {
        const data = snap.val(); if(!data) { alert("No hay datos."); return; }
        const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: "application/json"}));
        a.href = url; a.download = `Respaldo_DashboardPro_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }).catch(e => alert("Error: " + e.message));
}
function importarBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    if(!confirm("⚠️ ADVERTENCIA: Esto sobrescribirá todos tus datos actuales. ¿Continuar?")) { e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(ev) { try { const data = JSON.parse(ev.target.result); db.ref(`Usuarios/${auth.currentUser.uid}`).set(data).then(() => { alert("✅ Restaurado."); window.location.reload(); }); } catch(err) { alert("❌ Archivo inválido."); } e.target.value = ''; };
    reader.readAsText(file);
}

// 8. RENDERIZADO VISUAL
function renderAll() {
    let tengo = 0, debo = 0, gT = 0, iT = 0; const hoy = new Date(); const diaHoy = hoy.getDate(); const mesAct = hoy.getMonth(); let hDeb = "", hCre = "", hMae = "";
    
    state.cuentas.forEach(c => {
        let aviso = "";
        if(c.diaPago) { 
            const yaPagado = c.mesPagado === mesAct; const vence = c.diaPago - diaHoy; 
            if (yaPagado) { aviso = `<br><small style="color:var(--success); font-weight:bold;">✓ Pagado este mes</small> <span onclick="db.ref('Usuarios/${auth.currentUser.uid}/cuentas/${c.id}/mesPagado').remove()" style="font-size:8px; cursor:pointer; color:var(--muted);">(Deshacer)</span>`; } 
            else { let textoDias = vence < 0 ? `⚠️ Atrasado` : (vence === 0 ? '¡Paga HOY!' : `Faltan: ${vence}d`); let colorTexto = vence <= 3 ? 'var(--danger)' : 'var(--muted)'; aviso = `<br><small style="color:${colorTexto}; font-weight:bold;">${textoDias}</small><br><button class="btn-check-pago" style="${vence <= 0 ? 'background:var(--danger)' : ''}" onclick="db.ref('Usuarios/${auth.currentUser.uid}/cuentas/${c.id}/mesPagado').set(${mesAct})">Marcar Pagado</button>`; }
        }
        
        const item = `<div class="bank-item"><div class="bank-info"><img src="${c.icon}" class="bank-icon"><div class="bank-details"><b>${c.nombre}</b>${aviso}</div></div><b>$${c.saldo.toLocaleString('es-MX', {minimumFractionDigits: 2})}</b></div>`;
        if(c.tipo==='debito'){ tengo+=c.saldo; hDeb+=item; } else { debo+=c.saldo; hCre+=item; }
        
        hMae += `<div class="bank-item"><div class="bank-info"><img src="${c.icon}" class="bank-icon"><b>${c.nombre}</b></div><div style="text-align:right"><b>$${c.saldo.toLocaleString('es-MX', {minimumFractionDigits: 2})}</b><br><span class="action-link" style="color:var(--success)" onclick="sumarInteres('${c.id}')">+ Interés</span><span class="action-link" onclick="const d=prompt('Dominio:'); if(d) db.ref('Usuarios/${auth.currentUser.uid}/cuentas/${c.id}/icon').set('https://www.google.com/s2/favicons?domain='+d+'&sz=128')">Logo</span><span class="action-link danger" onclick="if(confirm('¿Borrar cuenta?')) db.ref('Usuarios/${auth.currentUser.uid}/cuentas/${c.id}').remove()">Borrar</span></div></div>`;
    });

    document.getElementById('widgetDebitos').innerHTML = hDeb || "<small>Vacío</small>"; document.getElementById('widgetCreditos').innerHTML = hCre || "<small>Vacío</small>"; document.getElementById('listaMaestraCuentas').innerHTML = hMae;
    document.getElementById('valTengo').innerText = `$${tengo.toLocaleString('es-MX', {minimumFractionDigits: 2})}`; document.getElementById('valDebo').innerText = `$${debo.toLocaleString('es-MX', {minimumFractionDigits: 2})}`; document.getElementById('valPatrimonio').innerText = `$${(tengo - debo).toLocaleString('es-MX', {minimumFractionDigits: 2})}`;

    const prefijoMes = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;
    const txMes = state.transacciones.filter(t => t.fecha && t.fecha.startsWith(prefijoMes));
    
    gT = txMes.filter(t => t.tipo==='gasto').reduce((a, b) => a + Number(b.monto || 0), 0); iT = txMes.filter(t => t.tipo==='ingreso').reduce((a, b) => a + Number(b.monto || 0), 0);
    document.getElementById('homeIngresos').innerText = `$${iT.toLocaleString('es-MX', {minimumFractionDigits: 2})}`; document.getElementById('homeGastos').innerText = `$${gT.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;

    let hG = "", hI = "", hM = "";
    state.transacciones.slice().reverse().forEach(t => {
        let actionStr = t.tipo === 'movimiento' ? `editMovimiento('${t.firebaseId}')` : (t.tipo === 'gasto' ? `editGasto('${t.firebaseId}')` : `editIngreso('${t.firebaseId}')`);
        const item = `<div class="bank-item"><div>${t.desc}<br><small>${t.fecha}</small></div><div style="display:flex; align-items:center;"><button class="del-btn" onclick="eliminarTransaccion('${t.firebaseId}')">🗑️</button><button class="edit-btn" onclick="${actionStr}">✎</button><b>$${Number(t.monto || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</b></div></div>`;
        if(t.tipo === 'gasto') hG += item; else if (t.tipo === 'ingreso') hI += item; else hM += item;
    });
    
    document.getElementById('listaGastos').innerHTML = hG; document.getElementById('listaIngresos').innerHTML = hI; document.getElementById('listaMovimientos').innerHTML = hM;
    
    actualizarSelects(); renderChart(); renderPresupuestos();
}

function actualizarSelects() {
    const optDeb = state.cuentas.filter(c => c.tipo==='debito').map(c => `<option value="${c.id}">${c.nombre}</option>`).join(''), optCre = state.cuentas.filter(c => c.tipo==='credito').map(c => `<option value="${c.id}">${c.nombre}</option>`).join(''), optAll = state.cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    if(document.getElementById('inCuenta')) document.getElementById('inCuenta').innerHTML = optDeb; if(document.getElementById('gaFuente')) document.getElementById('gaFuente').innerHTML = optAll; if(document.getElementById('movOrigen')) document.getElementById('movOrigen').innerHTML = optDeb; if(document.getElementById('movDestino')) document.getElementById('movDestino').innerHTML = currentMovMode === 'pago' ? optCre : optDeb;
}

function renderChart() { 
    const hoy = new Date(); const prefijoMes = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;
    const ctx = document.getElementById('chartGastos').getContext('2d'); const cats = {}; 
    state.transacciones.filter(t => t.tipo === 'gasto' && t.fecha && t.fecha.startsWith(prefijoMes)).forEach(t => cats[t.cat] = (cats[t.cat] || 0) + Number(t.monto || 0)); 
    if(chartInstance) chartInstance.destroy(); 
    chartInstance = new Chart(ctx, { type:'doughnut', data:{ labels:Object.keys(cats), datasets:[{data:Object.values(cats), backgroundColor:['#3b82f6','#10b981','#ef4444','#8b5cf6', '#f59e0b', '#64748b'], borderWidth:0}] }, options:{ maintainAspectRatio:false, plugins:{legend:{display:false}}, cutout:'75%' } }); 
}

// 9. CONFIGURACIÓN FINAL Y PERFIL (SISTEMA DE LOGOS GOOGLE HD)
function getBankLogo(banco) { 
    const nombre = banco.toLowerCase().trim();
    const logosMexicanos = { "bbva": "bbva.mx", "nu": "nu.com.mx", "nubank": "nu.com.mx", "santander": "santander.com.mx", "banamex": "banamex.com", "citi": "banamex.com", "banorte": "banorte.com", "hsbc": "hsbc.com.mx", "scotiabank": "scotiabank.com.mx", "inbursa": "inbursa.com", "hey banco": "heybanco.com", "heybanco": "heybanco.com", "spin": "spinbyoxxo.com.mx", "mercado pago": "mercadopago.com.mx", "mercadopago": "mercadopago.com.mx", "klar": "klar.mx", "stori": "storicard.com", "uala": "uala.mx", "ualá": "uala.mx", "bienestar": "bancodelbienestar.com.mx", "bancoppel": "bancoppel.com", "coppel": "bancoppel.com", "azteca": "bancoazteca.com.mx", "fonacot": "fonacot.gob.mx", "infonavit": "infonavit.org.mx", "kueski": "kueski.com", "paypal": "paypal.com" };
    for (const clave in logosMexicanos) { if (nombre.includes(clave)) return `https://www.google.com/s2/favicons?domain=${logosMexicanos[clave]}&sz=128`; }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(banco)}&background=random&color=fff&size=128&bold=true`;
}

function selectColor(hex, el) { state.selectedColor = hex; document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active')); el.classList.add('active'); document.documentElement.style.setProperty('--primary', hex); }
function handleNuevaCuenta(e) { e.preventDefault(); const id=Date.now(), b=document.getElementById('cuBanco').value; db.ref(`Usuarios/${auth.currentUser.uid}/cuentas/${id}`).set({id, nombre:document.getElementById('cuNombre').value, banco:b, tipo:document.getElementById('cuTipo').value, saldo:parseFloat(document.getElementById('cuSaldo').value), icon:getBankLogo(b), diaPago:parseInt(document.getElementById('cuPago').value)||0}); e.target.reset(); }
function handleGuardarPerfil(e) { e.preventDefault(); db.ref(`Usuarios/${auth.currentUser.uid}/perfil`).set({ nombre: document.getElementById('perfNombre').value, foto: state.currentBase64 || document.getElementById('perfDisplayFoto').src, color: state.selectedColor }).then(() => { alert("Perfil actualizado"); cambiarTab('resumen'); }); }
function toggleTheme() { const t = document.body.getAttribute('data-theme')==='dark'?'light':'dark'; document.body.setAttribute('data-theme', t); }

// 10. MÓDULO: PRESUPUESTOS
let chartPresupuestoInstance = null;
function handleGuardarPresupuesto(e) {
    e.preventDefault();
    const presupuestos = {
        Comida: parseFloat(document.getElementById('presComida').value) || 0,
        Servicios: parseFloat(document.getElementById('presServicios').value) || 0,
        Transporte: parseFloat(document.getElementById('presTransporte').value) || 0,
        Vivienda: parseFloat(document.getElementById('presVivienda').value) || 0,
        Ocio: parseFloat(document.getElementById('presOcio').value) || 0,
        Otros: parseFloat(document.getElementById('presOtros').value) || 0
    };
    db.ref(`Usuarios/${auth.currentUser.uid}/presupuestos`).set(presupuestos).then(() => { alert("¡Presupuesto actualizado!"); });
}

function renderPresupuestos() {
    try {
        const cats = ['Comida', 'Servicios', 'Transporte', 'Vivienda', 'Ocio', 'Otros'];
        cats.forEach(c => { if(document.getElementById(`pres${c}`)) document.getElementById(`pres${c}`).value = state.presupuestos[c] || ''; });
        const hoy = new Date(); const prefijoMes = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;
        const txMes = state.transacciones.filter(t => t.tipo === 'gasto' && t.fecha && t.fecha.startsWith(prefijoMes));
        let gastosPorCat = {}; cats.forEach(c => gastosPorCat[c] = 0);
        txMes.forEach(t => { let cat = t.cat || 'Otros'; let monto = Number(t.monto) || 0; if(gastosPorCat[cat] !== undefined) gastosPorCat[cat] += monto; else gastosPorCat['Otros'] += monto; });
        let html = ""; let labels = []; let dataLims = []; let dataGastos = []; let bgColors = []; let totalLimite = 0; let totalGastado = 0;
        
        cats.forEach(c => {
            let limite = Number(state.presupuestos[c]) || 0; let gastado = Number(gastosPorCat[c]) || 0;
            if(limite > 0 || gastado > 0) {
                totalLimite += limite; totalGastado += gastado;
                let porcentaje = limite > 0 ? (gastado / limite) * 100 : 100;
                let colorBarra = porcentaje > 100 ? 'var(--danger)' : (porcentaje > 80 ? '#f59e0b' : 'var(--primary)');
                html += `<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; font-size:12px;"><b style="text-transform:uppercase;">${c}</b><span style="color:${porcentaje > 100 ? 'var(--danger)' : 'var(--text)'}; font-weight:bold;">$${gastado.toLocaleString('es-MX', {minimumFractionDigits: 2})} / $${limite.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div><div style="background:var(--line); height:10px; border-radius:5px; margin-top:5px; overflow:hidden;"><div style="background:${colorBarra}; width:${Math.min(porcentaje, 100)}%; height:100%; transition: width 0.5s ease-out;"></div></div></div>`;
                labels.push(c); dataLims.push(limite); dataGastos.push(gastado); bgColors.push(colorBarra);
            }
        });

        if (totalLimite > 0 || totalGastado > 0) {
            let totalPorcentaje = totalLimite > 0 ? (totalGastado / totalLimite) * 100 : 100; let totalColor = totalPorcentaje > 100 ? 'var(--danger)' : (totalPorcentaje > 80 ? '#f59e0b' : 'var(--primary)');
            let headerTotal = `<div style="background: var(--bg); padding: 15px; border-radius: 15px; margin-bottom: 20px; border: 1px solid var(--line); text-align: center;"><p style="font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: bold; margin-bottom: 5px;">Presupuesto Global del Mes</p><h3 style="color: ${totalColor}; margin-bottom: 5px;">$${totalGastado.toLocaleString('es-MX', {minimumFractionDigits: 2})} <span style="font-size: 14px; color: var(--text);">/ $${totalLimite.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></h3><div style="background:var(--line); height:8px; border-radius:4px; overflow:hidden; width: 80%; margin: 0 auto;"><div style="background:${totalColor}; width:${Math.min(totalPorcentaje, 100)}%; height:100%; transition: width 0.5s ease-out;"></div></div></div>`;
            html = headerTotal + html;
        }

        if(document.getElementById('listaPresupuestos')) document.getElementById('listaPresupuestos').innerHTML = html || "<p style='font-size:12px; color:var(--muted); text-align:center;'>Define tus topes arriba para empezar a medirte.</p>";
        const ctx = document.getElementById('chartPresupuesto'); if(!ctx) return; if(chartPresupuestoInstance) chartPresupuestoInstance.destroy();
        chartPresupuestoInstance = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels: labels, datasets: [ { label: 'Lo que has gastado', data: dataGastos, backgroundColor: bgColors, borderRadius: 6 }, { label: 'Tu Límite', data: dataLims, backgroundColor: '#cbd5e1', borderRadius: 6 } ] }, options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } } });
    } catch (error) { console.error("Error al renderizar los presupuestos: ", error); }
}

// 11. GENERADOR DE PDF MENSUAL (CON PROTECCIÓN ANTI-CRASH Y FILTRO DE EMOJIS)
async function generarPDFMes() {
    if (!window.jspdf) { alert("Cargando librerías..."); return; }
    if(document.getElementById('loader')) document.getElementById('loader').style.display = 'flex';

    try {
        const { jsPDF } = window.jspdf; const doc = new jsPDF({ putOnlyUsedFonts: true, orientation: "portrait" });
        
        // --- FILTRO MÁGICO ANTI-EMOJIS ---
        const limpiarTexto = (txt) => txt ? txt.replace(/[^\x00-\x7F\xC0-\xFF]/g, '').trim() : '';

        const selectorMes = document.getElementById('mesReporte') ? document.getElementById('mesReporte').value : null;
        let fechaObjetivo = new Date(); if (selectorMes) { const partes = selectorMes.split('-'); fechaObjetivo = new Date(partes[0], partes[1] - 1, 10); }
        const year = fechaObjetivo.getFullYear(); const nombreMes = fechaObjetivo.toLocaleString('es-ES', { month: 'long' }).toUpperCase(); const prefijoMes = `${year}-${(fechaObjetivo.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const userName = limpiarTexto(document.getElementById('perfDisplayNombre').innerText); 
        const userPhotoBase64 = document.getElementById('perfDisplayFoto').src; 
        
        const estiloBody = getComputedStyle(document.body); let colorPrimarioHex = estiloBody.getPropertyValue('--primary').trim() || "#3b82f6";
        const hexToRgb = (hex) => { let c = hex.substring(1).split(''); if(c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]]; c = '0x' + c.join(''); return [(c>>16)&255, (c>>8)&255, c&255]; };
        const rgbPrimario = hexToRgb(colorPrimarioHex);

        const txMes = state.transacciones.filter(t => t.fecha && t.fecha.startsWith(prefijoMes)); let ingMes = 0, gasMes = 0;
        txMes.forEach(t => { if (t.tipo === 'ingreso') ingMes += Number(t.monto || 0); else gasMes += Number(t.monto || 0); });

        let activos = 0, deudas = 0; const cuentasDebito = []; const cuentasCredito = [];
        state.cuentas.forEach(c => { if (c.tipo === 'debito') { activos += Number(c.saldo || 0); cuentasDebito.push(c); } else { deudas += Number(c.saldo || 0); cuentasCredito.push(c); } });
        const patrimonio = activos - deudas;

        let yPos = 50; doc.setTextColor(0); doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text("BALANCE GENERAL", 15, yPos); yPos += 5;
        doc.setFillColor(240, 253, 244); doc.roundedRect(15, yPos, 55, 18, 3, 3, 'F'); doc.setTextColor(16, 185, 129); doc.setFontSize(9); doc.text("ACTIVOS (TENGO)", 18, yPos + 6); doc.setFontSize(12); doc.text(`$${activos.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 18, yPos + 14);
        doc.setFillColor(254, 242, 242); doc.roundedRect(75, yPos, 55, 18, 3, 3, 'F'); doc.setTextColor(239, 68, 68); doc.setFontSize(9); doc.text("DEUDAS (DEBO)", 78, yPos + 6); doc.setFontSize(12); doc.text(`$${deudas.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 78, yPos + 14);
        doc.setDrawColor(rgbPrimario[0], rgbPrimario[1], rgbPrimario[2]); doc.setFillColor(255, 255, 255); doc.roundedRect(135, yPos, 60, 18, 3, 3, 'FD'); doc.setTextColor(rgbPrimario[0], rgbPrimario[1], rgbPrimario[2]); doc.setFontSize(9); doc.text("PATRIMONIO TOTAL", 138, yPos + 6); doc.setFontSize(12); doc.text(`$${patrimonio.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 138, yPos + 14); yPos += 22;
        doc.setFillColor(240, 253, 244); doc.roundedRect(15, yPos, 85, 18, 3, 3, 'F'); doc.setTextColor(16, 185, 129); doc.setFontSize(9); doc.text("INGRESOS DEL MES", 18, yPos + 6); doc.setFontSize(14); doc.text(`+ $${ingMes.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 18, yPos + 14);
        doc.setFillColor(254, 242, 242); doc.roundedRect(110, yPos, 85, 18, 3, 3, 'F'); doc.setTextColor(239, 68, 68); doc.setFontSize(9); doc.text("GASTOS Y MOVS DEL MES", 113, yPos + 6); doc.setFontSize(14); doc.text(`- $${gasMes.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 113, yPos + 14); yPos += 28;

        const crearTablaCuentas = (titulo, datos, totalSaldos, startY) => {
            doc.setTextColor(0); doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(titulo, 15, startY);
            const bodyCuentas = datos.map(c => [ limpiarTexto(c.nombre) || 'Cuenta', limpiarTexto(c.banco || 'N/A').toUpperCase(), `$${Number(c.saldo || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}` ]);
            if (bodyCuentas.length === 0) { bodyCuentas.push(['-', 'NO HAY CUENTAS', '$0.00']); }
            bodyCuentas.push([ { content: 'TOTAL', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } }, { content: `$${totalSaldos.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } } ]);
            doc.autoTable({ startY: startY + 4, head: [['Cuenta', 'Institución', 'Saldo']], body: bodyCuentas, theme: 'striped', headStyles: { fillColor: rgbPrimario, textColor: [255, 255, 255], fontStyle: 'bold' }, styles: { valign: 'middle', fontSize: 9 }, columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }, margin: { top: 45, bottom: 25 } });
            return doc.lastAutoTable.finalY + 12;
        };

        yPos = crearTablaCuentas("CUENTAS DE DÉBITO (ACTIVOS)", cuentasDebito, activos, yPos); yPos = crearTablaCuentas("CUENTAS DE CRÉDITO Y TDC (DEUDAS)", cuentasCredito, deudas, yPos);
        if(yPos > doc.internal.pageSize.height - 40) { doc.addPage(); yPos = 55; }
        doc.setTextColor(0); doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(`DETALLE DE MOVIMIENTOS - ${nombreMes}`, 15, yPos);
        
        const bodyMovs = txMes.map(t => { 
            let catDisplay = limpiarTexto(t.cat || 'Ingreso'); 
            if(t.tipo === 'movimiento') catDisplay = t.subtipo === 'pago' ? 'PAGO TDC' : 'TRASPASO'; 
            const esIngreso = t.tipo === 'ingreso'; 
            return [ t.fecha, catDisplay.toUpperCase(), limpiarTexto(t.desc) || 'Sin detalle', { content: `${esIngreso ? '+' : '-'} $${Number(t.monto || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}`, styles: { textColor: esIngreso ? [16, 185, 129] : [239, 68, 68], fontStyle: 'bold' } } ]; 
        });
        
        if (bodyMovs.length === 0) { bodyMovs.push(['-', 'SIN MOVIMIENTOS ESTE MES', '-', '$0.00']); }
        bodyMovs.push([ { content: 'BALANCE DEL MES (INGRESOS - GASTOS)', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } }, { content: `$${(ingMes - gasMes).toLocaleString('es-MX', {minimumFractionDigits: 2})}`, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } } ]);
        doc.autoTable({ startY: yPos + 4, head: [['Fecha', 'Categoría', 'Concepto', 'Monto']], body: bodyMovs, theme: 'grid', headStyles: { fillColor: rgbPrimario, textColor: [255, 255, 255], fontStyle: 'bold' }, styles: { valign: 'middle', fontSize: 8 }, columnStyles: { 3: { halign: 'right' } }, margin: { top: 45, bottom: 25 } });

        const pageCount = doc.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i); doc.setFillColor(rgbPrimario[0], rgbPrimario[1], rgbPrimario[2]); doc.rect(0, 0, 210, 40, 'F'); 
            doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text("ESTADO DE CUENTA MÓVIL", 45, 15); doc.setFontSize(20); doc.setFont(undefined, 'bold'); doc.text(userName.toUpperCase(), 45, 23); doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text(`Período reportado: ${nombreMes} ${year}`, 45, 30);
            if (i === 1) { try { if(userPhotoBase64 && userPhotoBase64.startsWith('data:image')) { doc.addImage(userPhotoBase64, 'JPEG', 15, 8, 24, 24, 'perfil', 'FAST'); } } catch(e) {} }
            const pageHeight = doc.internal.pageSize.height; doc.setFillColor(rgbPrimario[0], rgbPrimario[1], rgbPrimario[2]); doc.rect(0, pageHeight - 15, 210, 15, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.text(`Generado el ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()}`, 15, pageHeight - 6); doc.text(`Página ${i} de ${pageCount}`, 195, pageHeight - 6, { align: 'right' });
        }
        
        const nombreArchivo = `EstadoCuenta_${limpiarTexto(nombreMes)}_${year}.pdf`;
        doc.save(nombreArchivo);
    } catch (error) { alert("Ocurrió un problema al generar el reporte: " + error.message); } 
    finally { if(document.getElementById('loader')) document.getElementById('loader').style.display = 'none'; }
}

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js'); }