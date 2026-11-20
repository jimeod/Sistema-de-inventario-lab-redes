const API_BASE = 'http://localhost:3000/api';

let estadoApp = {
    token: localStorage.getItem('token') || null,
    usuario: JSON.parse(localStorage.getItem('usuario') || 'null'),
    articulos: [],
    carrito: {} 
};

async function apiFetch(ruta, opciones = {}) {
    const headers = opciones.headers || {};
    if (estadoApp.token) {
        headers['Authorization'] = `Bearer ${estadoApp.token}`;
    }
    if (!(opciones.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${ruta}`, { ...opciones, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        if (res.status === 401 && ruta !== '/auth/login') {
            cerrarSesion();
        }
        throw new Error(data.error || data.mensaje || 'Error en la petición');
    }
    return data;
}

function mostrarToast(mensaje, tipo = 'ok') {
    const cont = document.getElementById('toast-container');
    const div = document.createElement('div');
    const color = tipo === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    div.className = `${color} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium toast-enter max-w-sm`;
    div.textContent = mensaje;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

function abrirModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function cerrarModal(id) {
    document.getElementById(id).classList.add('hidden');
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = document.getElementById('login-correo').value;
    const password = document.getElementById('login-password').value;

    try {
        const data = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ correo, password })
        });
        estadoApp.token = data.token;
        estadoApp.usuario = data.usuario;
        localStorage.setItem('token', data.token);
        localStorage.setItem('usuario', JSON.stringify(data.usuario));
        iniciarSesionUI();
        mostrarToast(`Bienvenido, ${data.usuario.nombre}`);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
});

function cerrarSesion() {
    estadoApp.token = null;
    estadoApp.usuario = null;
    estadoApp.carrito = {};
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    document.getElementById('vista-app').classList.add('hidden');
    document.getElementById('vista-login').classList.remove('hidden');
}

function iniciarSesionUI() {
    document.getElementById('vista-login').classList.add('hidden');
    document.getElementById('vista-app').classList.remove('hidden');

    const u = estadoApp.usuario;
    document.getElementById('user-nombre').textContent = u.nombre;
    document.getElementById('user-correo').textContent = u.correo;
    document.getElementById('badge-rol').textContent = u.rol;

    const esEncargado = u.rol === 'ENCARGADO';
    document.querySelectorAll('.solo-encargado').forEach(el => {
        el.classList.toggle('hidden', !esEncargado);
    });

    navegar('catalogo');
}

document.getElementById('form-cambiar-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = await apiFetch('/auth/cambiar-password', {
            method: 'POST',
            body: JSON.stringify({
                passwordActual: document.getElementById('pass-actual').value,
                passwordNueva: document.getElementById('pass-nueva').value
            })
        });
        estadoApp.token = data.token;
        localStorage.setItem('token', data.token);
        cerrarModal('modal-password');
        e.target.reset();
        mostrarToast('Contraseña actualizada');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
});

function navegar(seccion) {
    ['catalogo', 'solicitudes', 'movimientos', 'usuarios'].forEach(s => {
        document.getElementById(`sec-${s}`).classList.toggle('hidden', s !== seccion);
        const btn = document.getElementById(`nav-${s}`);
        if (btn) {
            btn.className = s === seccion
                ? 'nav-btn px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 bg-indigo-800 text-white'
                : 'nav-btn px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 text-indigo-200 hover:bg-indigo-800/60';
        }
    });

    if (seccion === 'catalogo') cargarArticulos();
    if (seccion === 'solicitudes') cargarSolicitudes();
    if (seccion === 'movimientos') cargarMovimientos();
    if (seccion === 'usuarios') cargarUsuarios();
}

async function cargarArticulos() {
    try {
        estadoApp.articulos = await apiFetch('/articulos');
        renderizarArticulos();
        const selectMov = document.getElementById('select-articulo-movimientos');
        selectMov.innerHTML = '<option value="">-- Filtrar por artículo --</option>' +
            estadoApp.articulos.map(a => `<option value="${a.idArticulo}">${a.clave || ''} - ${a.nombre}</option>`).join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function renderizarArticulos() {
    const q = document.getElementById('filtro-articulo-texto').value.toLowerCase();
    const tipo = document.getElementById('filtro-articulo-tipo').value;
    const esEncargado = estadoApp.usuario.rol === 'ENCARGADO';

    const filtrados = estadoApp.articulos.filter(a => {
        const coincideTexto = [a.clave, a.nombre, a.categoria, a.ubicacion]
            .some(v => (v || '').toLowerCase().includes(q));
        const coincideTipo = !tipo || a.tipo === tipo;
        return coincideTexto && coincideTipo;
    });

    const grid = document.getElementById('grid-articulos');
    if (filtrados.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-slate-400 py-10">No se encontraron artículos.</p>';
        return;
    }

    grid.innerHTML = filtrados.map(a => {
        const enCarrito = estadoApp.carrito[a.idArticulo] || 0;
        const img = a.fotoUrl
            ? `<img src="${a.fotoUrl}" alt="${a.nombre}" class="w-full h-36 object-cover">`
            : `<div class="w-full h-36 bg-slate-100 flex items-center justify-center text-slate-400"><i data-lucide="cpu" class="w-10 h-10"></i></div>`;

        return `
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between">
            <div>
                <div class="relative">
                    ${img}
                    <span class="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded bg-slate-900/80 text-white">${a.clave || 'SIN CLAVE'}</span>
                    <span class="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded ${a.tipo === 'PRESTABLE' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'}">${a.tipo}</span>
                </div>
                <div class="p-4 space-y-1.5">
                    <h3 class="font-bold text-slate-900 leading-snug">${a.nombre}</h3>
                    <p class="text-xs text-slate-500">${a.categoria} • <span class="font-medium text-slate-700">${a.ubicacion}</span></p>
                    <div class="pt-2 flex items-center justify-between text-xs">
                        <span class="font-semibold ${a.libres > 0 ? 'text-emerald-600' : 'text-red-600'}">Libres: ${a.libres} / ${a.existencias}</span>
                        <span class="text-slate-400">Condición: ${a.condicion}</span>
                    </div>
                </div>
            </div>
            <div class="p-3 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                    <button onclick="cambiarCarrito('${a.idArticulo}', -1)" class="px-2.5 py-1 bg-white border rounded hover:bg-slate-100 text-sm font-bold">-</button>
                    <span class="text-xs font-semibold">En solicitud: ${enCarrito}</span>
                    <button onclick="cambiarCarrito('${a.idArticulo}', 1)" ${enCarrito >= a.libres ? 'disabled' : ''} class="px-2.5 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 text-sm font-bold">+</button>
                </div>
                ${esEncargado ? `
                <div class="flex gap-1 pt-1 border-t border-slate-200 text-xs">
                    <button onclick="abrirAjuste('${a.idArticulo}', 'reabastecer')" class="flex-1 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-medium">+ Stock</button>
                    <button onclick="abrirAjuste('${a.idArticulo}', 'baja')" class="flex-1 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded font-medium">- Baja</button>
                </div>` : ''}
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

function cambiarCarrito(idArticulo, delta) {
    const art = estadoApp.articulos.find(a => a.idArticulo === idArticulo);
    if (!art) return;
    const actual = estadoApp.carrito[idArticulo] || 0;
    const nuevo = Math.max(0, Math.min(art.libres, actual + delta));
    if (nuevo === 0) delete estadoApp.carrito[idArticulo];
    else estadoApp.carrito[idArticulo] = nuevo;

    const totalItems = Object.values(estadoApp.carrito).reduce((s, n) => s + n, 0);
    document.getElementById('carrito-count').textContent = totalItems;
    renderizarArticulos();
}

function abrirModalNuevaSolicitud() {
    const entradas = Object.entries(estadoApp.carrito);
    if (entradas.length === 0) {
        mostrarToast('Agrega al menos un artículo del catálogo primero', 'error');
        return;
    }
    const lista = document.getElementById('lista-carrito-modal');
    lista.innerHTML = entradas.map(([id, cant]) => {
        const art = estadoApp.articulos.find(a => a.idArticulo === id);
        return `<div class="flex justify-between items-center py-1 border-b last:border-0">
            <span><strong>${art?.clave || ''}</strong> ${art?.nombre || id}</span>
            <span class="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold">x${cant}</span>
        </div>`;
    }).join('');
    abrirModal('modal-nueva-solicitud');
}

document.getElementById('form-nueva-solicitud').addEventListener('submit', async (e) => {
    e.preventDefault();
    const articulos = Object.entries(estadoApp.carrito).map(([idArticulo, cantidad]) => ({ idArticulo, cantidad }));
    try {
        const res = await apiFetch('/solicitudes', {
            method: 'POST',
            body: JSON.stringify({
                practica: document.getElementById('sol-practica').value,
                observaciones: document.getElementById('sol-observaciones').value,
                articulos
            })
        });
        estadoApp.carrito = {};
        document.getElementById('carrito-count').textContent = '0';
        cerrarModal('modal-nueva-solicitud');
        e.target.reset();
        mostrarToast(`Solicitud ${res.solicitud.folio} creada`);
        navegar('solicitudes');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
});

document.getElementById('form-nuevo-articulo').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const payload = {
            clave: document.getElementById('art-clave').value,
            tipo: document.getElementById('art-tipo').value,
            nombre: document.getElementById('art-nombre').value,
            categoria: document.getElementById('art-categoria').value,
            ubicacion: document.getElementById('art-ubicacion').value,
            existencias: parseInt(document.getElementById('art-existencias').value, 10),
            condicion: document.getElementById('art-condicion').value
        };
        const res = await apiFetch('/articulos', { method: 'POST', body: JSON.stringify(payload) });

        const archivo = document.getElementById('art-foto').files[0];
        if (archivo) {
            const fd = new FormData();
            fd.append('foto', archivo);
            await apiFetch(`/articulos/${res.articulo.idArticulo}/foto`, { method: 'POST', body: fd });
        }

        cerrarModal('modal-nuevo-articulo');
        e.target.reset();
        mostrarToast('Artículo registrado correctamente');
        cargarArticulos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
});

function abrirAjuste(idArticulo, operacion) {
    document.getElementById('ajuste-id-articulo').value = idArticulo;
    document.getElementById('ajuste-operacion').value = operacion;
    document.getElementById('ajuste-titulo').textContent = operacion === 'reabastecer' ? 'Reabastecer Existencias' : 'Dar de Baja Unidades';
    abrirModal('modal-ajuste-stock');
}

document.getElementById('form-ajuste-stock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ajuste-id-articulo').value;
    const op = document.getElementById('ajuste-operacion').value;
    try {
        await apiFetch(`/articulos/${id}/${op}`, {
            method: 'POST',
            body: JSON.stringify({
                cantidad: parseInt(document.getElementById('ajuste-cantidad').value, 10),
                motivo: document.getElementById('ajuste-motivo').value
            })
        });
        cerrarModal('modal-ajuste-stock');
        e.target.reset();
        mostrarToast('Inventario actualizado');
        cargarArticulos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
});

async function cargarSolicitudes() {
    try {
        const esEncargado = estadoApp.usuario.rol === 'ENCARGADO';
        let lista = [];
        if (esEncargado) {
            const estado = document.getElementById('select-estado-solicitud').value;
            lista = await apiFetch(`/solicitudes/estado/${estado}`);
        } else {
            lista = await apiFetch(`/solicitudes/usuario/${estadoApp.usuario.idUsuario}`);
        }

        const tbody = document.getElementById('tabla-solicitudes');
        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-8 text-center text-slate-400">No hay solicitudes en esta vista.</td></tr>';
            return;
        }

        tbody.innerHTML = lista.map(s => `
            <tr class="hover:bg-slate-50">
                <td class="px-5 py-3.5 font-bold text-indigo-700">${s.folio}</td>
                <td class="px-5 py-3.5">${s.nombreSolicitante}</td>
                <td class="px-5 py-3.5">${s.practica}</td>
                <td class="px-5 py-3.5 text-xs text-slate-500">${new Date(s.fechaSolicitud).toLocaleString()}</td>
                <td class="px-5 py-3.5">${s.articulos.length} ítem(s)</td>
                <td class="px-5 py-3.5"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">${s.estado}</span></td>
                <td class="px-5 py-3.5 text-right">
                    <button onclick="verDetalleSolicitud('${s.idSolicitudes}')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer">Gestionar / Ver</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function verDetalleSolicitud(id) {
    try {
        const s = await apiFetch(`/solicitudes/${id}`);
        const esEncargado = estadoApp.usuario.rol === 'ENCARGADO';

        document.getElementById('det-sol-folio').textContent = `${s.folio} — ${s.estado}`;
        document.getElementById('det-sol-info').textContent = `Solicitante: ${s.nombreSolicitante} | Práctica: ${s.practica}`;

        let html = `
            <div class="bg-slate-50 p-3 rounded-lg border">
                <p class="font-semibold mb-2">Artículos solicitados:</p>
                <ul class="space-y-1">
                    ${s.articulos.map(a => `<li class="flex justify-between"><span>${a.clave || ''} - ${a.nombre} (${a.tipo})</span><strong>x${a.cantidad}</strong></li>`).join('')}
                </ul>
            </div>
            ${s.observaciones ? `<p><strong>Observaciones:</strong> ${s.observaciones}</p>` : ''}
            ${s.motivoResolucion ? `<p><strong>Motivo resolución:</strong> ${s.motivoResolucion}</p>` : ''}
        `;

        const prestables = s.articulos.filter(a => a.tipo === 'PRESTABLE');
        if (esEncargado && s.estado === 'ENTREGADA' && prestables.length > 0) {
            html += `
            <div class="border-t pt-3 space-y-2">
                <p class="font-bold text-indigo-900">Reporte de Devolución de Equipo Prestable:</p>
                ${prestables.map(p => `
                    <div class="grid grid-cols-4 gap-2 items-center bg-indigo-50/50 p-2 rounded">
                        <span class="col-span-1 font-medium text-xs">${p.nombre} (Total: ${p.cantidad})</span>
                        <div><label class="text-[10px]">Buenas</label><input type="number" id="dev-b-${p.idArticulo}" min="0" max="${p.cantidad}" value="${p.cantidad}" class="w-full px-2 py-1 border rounded text-xs"></div>
                        <div><label class="text-[10px]">Dañadas</label><input type="number" id="dev-d-${p.idArticulo}" min="0" max="${p.cantidad}" value="0" class="w-full px-2 py-1 border rounded text-xs"></div>
                        <div><label class="text-[10px]">Faltantes</label><input type="number" id="dev-f-${p.idArticulo}" min="0" max="${p.cantidad}" value="0" class="w-full px-2 py-1 border rounded text-xs"></div>
                    </div>
                `).join('')}
            </div>`;
        }

        document.getElementById('det-sol-contenido').innerHTML = html;

        let botones = '';
        if (esEncargado && s.estado === 'PENDIENTE') {
            botones += `<button onclick="accionFlujo('${s.idSolicitudes}', 'aprobar')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold">Aprobar</button>`;
            botones += `<button onclick="accionFlujo('${s.idSolicitudes}', 'rechazar', true)" class="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold">Rechazar</button>`;
        }
        if (esEncargado && s.estado === 'APROBADA') {
            botones += `<button onclick="accionFlujo('${s.idSolicitudes}', 'entregar')" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Registrar Entrega</button>`;
        }
        if (esEncargado && s.estado === 'ENTREGADA') {
            botones += `<button onclick="registrarDevolucion('${s.idSolicitudes}')" class="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold">Registrar Devolución</button>`;
        }
        if (esEncargado && s.estado === 'DEVUELTA') {
            botones += `<button onclick="accionFlujo('${s.idSolicitudes}', 'cerrar')" class="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold">Cerrar Solicitud</button>`;
        }
        if (['PENDIENTE', 'APROBADA'].includes(s.estado)) {
            botones += `<button onclick="accionFlujo('${s.idSolicitudes}', 'cancelar')" class="px-3 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold">Cancelar Solicitud</button>`;
        }

        document.getElementById('det-sol-acciones').innerHTML = botones;
        abrirModal('modal-detalle-solicitud');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function accionFlujo(id, accion, pedirMotivoObligatorio = false) {
    let motivo = '';
    if (pedirMotivoObligatorio || accion === 'cancelar') {
        motivo = prompt(`Ingresa el motivo para ${accion}:`) || '';
        if (pedirMotivoObligatorio && !motivo.trim()) return;
    }
    try {
        await apiFetch(`/solicitudes/${id}/${accion}`, {
            method: 'PATCH',
            body: JSON.stringify({ motivo })
        });
        cerrarModal('modal-detalle-solicitud');
        mostrarToast(`Operación "${accion}" realizada`);
        cargarSolicitudes();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function registrarDevolucion(id) {
    try {
        const s = await apiFetch(`/solicitudes/${id}`);
        const prestables = s.articulos.filter(a => a.tipo === 'PRESTABLE');
        const articulos = prestables.map(p => ({
            idArticulo: p.idArticulo,
            buenas: parseInt(document.getElementById(`dev-b-${p.idArticulo}`).value, 10),
            danadas: parseInt(document.getElementById(`dev-d-${p.idArticulo}`).value, 10),
            faltantes: parseInt(document.getElementById(`dev-f-${p.idArticulo}`).value, 10)
        }));
        await apiFetch(`/solicitudes/${id}/devolver`, {
            method: 'PATCH',
            body: JSON.stringify({ articulos, observaciones: '' })
        });
        cerrarModal('modal-detalle-solicitud');
        mostrarToast('Devolución registrada');
        cargarSolicitudes();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function cargarMovimientos() {
    try {
        if (estadoApp.usuario.rol === 'ENCARGADO') {
            if (estadoApp.articulos.length === 0) await cargarArticulos();
            const primero = estadoApp.articulos[0];
            if (primero) {
                document.getElementById('select-articulo-movimientos').value = primero.idArticulo;
                await cargarMovimientosPorArticulo(primero.idArticulo);
            }
        } else {
            const lista = await apiFetch(`/movimientos/solicitante/${estadoApp.usuario.idUsuario}`);
            renderizarMovimientos(lista);
        }
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function cargarMovimientosPorArticulo(idArticulo) {
    if (!idArticulo) return;
    try {
        const lista = await apiFetch(`/movimientos/articulo/${idArticulo}`);
        renderizarMovimientos(lista);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function renderizarMovimientos(lista) {
    const tbody = document.getElementById('tabla-movimientos');
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">Sin movimientos registrados.</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(m => `
        <tr class="hover:bg-slate-50">
            <td class="px-5 py-3 text-xs text-slate-500">${new Date(m.fecha).toLocaleString()}</td>
            <td class="px-5 py-3"><span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100">${m.tipoMovimiento}</span></td>
            <td class="px-5 py-3 font-medium">${m.nombreArticulo}</td>
            <td class="px-5 py-3 font-bold">${m.cantidad}</td>
            <td class="px-5 py-3 text-xs">${m.folio ? `<strong>${m.folio}</strong> - ` : ''}${m.motivo || '-'}</td>
            <td class="px-5 py-3 text-xs">${m.nombreEncargado || m.nombreSolicitante || '-'}</td>
        </tr>
    `).join('');
}

async function cargarUsuarios() {
    try {
        const lista = await apiFetch('/usuarios');
        document.getElementById('tabla-usuarios').innerHTML = lista.map(u => `
            <tr class="hover:bg-slate-50">
                <td class="px-5 py-3 font-medium">${u.nombre}</td>
                <td class="px-5 py-3 text-slate-500">${u.correo}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded text-xs font-semibold ${u.rol === 'ENCARGADO' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${u.rol}</span></td>
                <td class="px-5 py-3 text-right space-x-2">
                    <button onclick="resetPasswordUsuario('${u.idUsuario}')" class="text-xs text-indigo-600 hover:underline">Reset Pass</button>
                    ${u.idUsuario !== estadoApp.usuario.idUsuario ? `<button onclick="desactivarUsuario('${u.idUsuario}')" class="text-xs text-red-600 hover:underline">Desactivar</button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

document.getElementById('form-nuevo-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await apiFetch('/usuarios', {
            method: 'POST',
            body: JSON.stringify({
                nombre: document.getElementById('usr-nombre').value,
                correo: document.getElementById('usr-correo').value,
                rol: document.getElementById('usr-rol').value,
                password: document.getElementById('usr-password').value
            })
        });
        cerrarModal('modal-nuevo-usuario');
        e.target.reset();
        mostrarToast('Usuario creado');
        cargarUsuarios();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
});

async function resetPasswordUsuario(id) {
    if (!confirm('¿Generar una contraseña temporal nueva para este usuario?')) return;
    try {
        const res = await apiFetch(`/usuarios/${id}/restablecer-password`, { method: 'POST', body: '{}' });
        alert(`Contraseña temporal generada:\n\n${res.passwordTemporal}\n\nCompártela con el usuario.`);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function desactivarUsuario(id) {
    if (!confirm('¿Desactivar esta cuenta de usuario?')) return;
    try {
        await apiFetch(`/usuarios/${id}/desactivar`, { method: 'PATCH' });
        mostrarToast('Usuario desactivado');
        cargarUsuarios();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

lucide.createIcons();
if (estadoApp.token && estadoApp.usuario) {
    iniciarSesionUI();
}