// Solicitudes: creación, listado, detalle, seguimiento y flujo (aprobar, entregar, devolver...).
import { apiFetch, obtenerUsuario } from './api.js';
import { esEncargado } from './auth.js';
import { estado as estadoCatalogo, vaciarCarrito, cargarArticulos } from './catalogo.js';
import { listarUsuarios } from './usuarios.js';
import { describirCambios, describirDetalle } from './movimientos.js';
import {
    escapeHtml, formatearFecha, mostrarToast, abrirModal, cerrarModal,
    registrarAcciones, enviando, insigniaEstado, pedirDialogo
} from './ui.js';

const enc = encodeURIComponent;

// ---------- Nueva solicitud (se arma desde el carrito del catálogo) ----------

// Solo el encargado: permite crear la solicitud a nombre de otro usuario.
async function poblarSolicitantes() {
    const select = document.getElementById('sol-solicitante');
    const yo = obtenerUsuario()?.idUsuario;
    try {
        const usuarios = await listarUsuarios();
        select.innerHTML = '<option value="">Yo (mi cuenta)</option>' +
            usuarios
                .filter(u => u.idUsuario !== yo)
                .map(u => `<option value="${escapeHtml(u.idUsuario)}">${escapeHtml(u.nombre)} — ${escapeHtml(u.correo)}</option>`)
                .join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function abrirModalNuevaSolicitud() {
    const entradas = Object.entries(estadoCatalogo.carrito);
    if (entradas.length === 0) {
        mostrarToast('Agrega al menos un artículo del catálogo primero', 'error');
        return;
    }
    document.getElementById('lista-carrito-modal').innerHTML = entradas.map(([id, cant]) => {
        const art = estadoCatalogo.articulos.find(a => a.idArticulo === id);
        return `<div class="flex justify-between items-center py-1 border-b last:border-0">
            <span><strong>${escapeHtml(art?.clave || '')}</strong> ${escapeHtml(art?.nombre || id)}</span>
            <span class="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold">x${cant}</span>
        </div>`;
    }).join('');
    abrirModal('modal-nueva-solicitud');
    if (esEncargado()) poblarSolicitantes();
}

const formNueva = document.getElementById('form-nueva-solicitud');
formNueva.addEventListener('submit', async (e) => {
    e.preventDefault();
    const articulos = Object.entries(estadoCatalogo.carrito)
        .map(([idArticulo, cantidad]) => ({ idArticulo, cantidad }));
    const idSolicitante = esEncargado() ? document.getElementById('sol-solicitante').value : '';

    await enviando(formNueva, async () => {
        try {
            const res = await apiFetch('/solicitudes', {
                method: 'POST',
                body: JSON.stringify({
                    practica: document.getElementById('sol-practica').value,
                    observaciones: document.getElementById('sol-observaciones').value,
                    articulos,
                    ...(idSolicitante ? { idSolicitante } : {})
                })
            });
            vaciarCarrito();
            cerrarModal('modal-nueva-solicitud');
            formNueva.reset();
            mostrarToast(`Solicitud ${res.solicitud.folio} creada`);
            window.dispatchEvent(new CustomEvent('app:navegar', { detail: 'solicitudes' }));
        } catch (err) {
            mostrarToast(err.message, 'error');
        }
    });
});

// ---------- Listado ----------

const ESTADOS = [
    ['TODAS', 'Todas'], ['PENDIENTE', 'Pendientes'], ['APROBADA', 'Aprobadas'],
    ['ENTREGADA', 'Entregadas'], ['DEVUELTA', 'Devueltas'], ['CERRADA', 'Cerradas'],
    ['RECHAZADA', 'Rechazadas'], ['CANCELADA', 'Canceladas']
];

let solicitudes = [];
let filtroEstado = null; // se decide según el rol en la primera carga

// ---------- Aviso de pendientes (solo encargado) ----------

const TITULO_BASE = document.title;
const INTERVALO_AVISO_MS = 60 * 1000;
let pendientes = 0;
let imprimiendo = false;
let consultandoPendientes = false;

function aplicarTitulo() {
    if (imprimiendo) return; // mientras se imprime, el título es el del vale
    document.title = pendientes > 0 ? `(${pendientes}) ${TITULO_BASE}` : TITULO_BASE;
}

function fijarBadgePendientes(n) {
    pendientes = n;
    const badge = document.getElementById('badge-pendientes');
    if (badge) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.classList.toggle('hidden', n === 0);
    }
    aplicarTitulo();
}

export async function actualizarPendientes() {
    if (!esEncargado() || consultandoPendientes) return;
    consultandoPendientes = true;
    try {
        const lista = await apiFetch('/solicitudes/estado/PENDIENTE');
        fijarBadgePendientes(lista.length);
    } catch {
        // Es un aviso secundario: si falla, se reintenta en el siguiente ciclo sin molestar.
    } finally {
        consultandoPendientes = false;
    }
}

// Consulta al entrar, cada minuto y al volver a la pestaña. Pausa mientras la pestaña está oculta.
export function iniciarAvisoPendientes() {
    if (!esEncargado()) return;
    actualizarPendientes();
    setInterval(() => { if (!document.hidden) actualizarPendientes(); }, INTERVALO_AVISO_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) actualizarPendientes();
    });
}

// El backend lista por estado (encargado) o por usuario (solicitante). Para ofrecer la vista
// "Todas" y los contadores, el encargado pide los 7 estados en paralelo y se unen aquí.
export async function cargarSolicitudes() {
    try {
        const usuario = obtenerUsuario();
        if (filtroEstado === null) filtroEstado = esEncargado() ? 'PENDIENTE' : 'TODAS';

        let lista;
        if (esEncargado()) {
            const porEstado = await Promise.all(
                ESTADOS.slice(1).map(([estado]) => apiFetch(`/solicitudes/estado/${enc(estado)}`))
            );
            lista = porEstado.flat();
        } else {
            lista = await apiFetch(`/solicitudes/usuario/${enc(usuario.idUsuario)}`);
        }
        solicitudes = lista.sort((a, b) =>
            String(b.fechaSolicitud).localeCompare(String(a.fechaSolicitud)));
        renderizarSolicitudes();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function renderizarSolicitudes() {
    const conteo = { TODAS: solicitudes.length };
    solicitudes.forEach(s => { conteo[s.estado] = (conteo[s.estado] || 0) + 1; });
    if (esEncargado()) fijarBadgePendientes(conteo.PENDIENTE || 0); // la lista trae los 7 estados

    document.getElementById('chips-solicitudes').innerHTML = ESTADOS.map(([valor, etiqueta]) => {
        const activo = valor === filtroEstado;
        const clase = activo
            ? 'bg-indigo-700 text-white border-indigo-700'
            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100';
        const claseNumero = activo ? 'text-indigo-200' : 'text-slate-400';
        return `<button data-accion="filtro-estado-sol" data-estado="${valor}"
            class="px-3 py-1.5 rounded-full border text-xs font-semibold cursor-pointer ${clase}">${etiqueta} <span class="${claseNumero}">${conteo[valor] || 0}</span></button>`;
    }).join('');

    const q = document.getElementById('filtro-solicitud-texto').value.trim().toLowerCase();
    const filtradas = solicitudes.filter(s =>
        (filtroEstado === 'TODAS' || s.estado === filtroEstado) &&
        (!q || [s.folio, s.nombreSolicitante, s.practica].some(v => (v || '').toLowerCase().includes(q)))
    );

    const tbody = document.getElementById('tabla-solicitudes');
    if (filtradas.length === 0) {
        const mensaje = solicitudes.length === 0
            ? 'No hay solicitudes en esta vista.'
            : 'Ninguna solicitud coincide con el filtro.';
        tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-8 text-center text-slate-400">${mensaje}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtradas.map(s => `
        <tr class="hover:bg-slate-50">
            <td class="px-5 py-3.5 font-bold text-indigo-700">${escapeHtml(s.folio)}</td>
            <td class="px-5 py-3.5">${escapeHtml(s.nombreSolicitante)}</td>
            <td class="px-5 py-3.5">${escapeHtml(s.practica)}</td>
            <td class="px-5 py-3.5 text-xs text-slate-500">${escapeHtml(formatearFecha(s.fechaSolicitud))}</td>
            <td class="px-5 py-3.5">${(s.articulos || []).length} ítem(s)</td>
            <td class="px-5 py-3.5">${insigniaEstado(s.estado)}</td>
            <td class="px-5 py-3.5 text-right">
                <button data-accion="ver-solicitud" data-id="${escapeHtml(s.idSolicitudes)}" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer">Gestionar / Ver</button>
            </td>
        </tr>
    `).join('');
}

// ---------- Detalle: seguimiento, devolución e historial ----------

// Quién hizo qué y cuándo, con los datos que guarda el backend en cada paso del flujo.
function pasosSeguimiento(s) {
    return [
        ['Solicitada', s.fechaSolicitud, s.nombreSolicitante],
        [s.estado === 'RECHAZADA' ? 'Rechazada' : 'Aprobada', s.fechaResolucion, s.nombreEncargado],
        ['Entregada', s.fechaEntrega, s.nombreEncargadoEntrega],
        ['Devuelta', s.fechaDevolucion, s.nombreEncargadoDevolucion],
        ['Cancelada', s.fechaCancelacion, s.nombreCancelo],
        ['Cerrada', s.fechaCierre, s.nombreEncargadoCierre]
    ].filter(([, fecha]) => fecha);
}

function seguimiento(s) {
    const pasos = pasosSeguimiento(s);

    return `
        <div class="bg-slate-50 p-3 rounded-lg border">
            <p class="font-semibold mb-2">Seguimiento:</p>
            <ul class="space-y-1 text-xs">
                ${pasos.map(([etiqueta, fecha, quien]) => `
                    <li class="flex justify-between gap-3">
                        <span><strong>${etiqueta}</strong>${quien ? ` por ${escapeHtml(quien)}` : ''}</span>
                        <span class="text-slate-500">${escapeHtml(formatearFecha(fecha))}</span>
                    </li>`).join('')}
            </ul>
        </div>`;
}

// Resultado de la devolución de los prestables (lo que registró el encargado).
function resumenDevolucion(s) {
    if (!Array.isArray(s.devolucion) || s.devolucion.length === 0) return '';
    return `
        <div class="bg-slate-50 p-3 rounded-lg border">
            <p class="font-semibold mb-2">Resultado de la devolución:</p>
            <table class="w-full text-xs">
                <thead class="text-slate-500 text-left">
                    <tr><th class="py-1">Artículo</th><th>Total</th><th>Buenas</th><th>Dañadas</th><th>Faltantes</th></tr>
                </thead>
                <tbody>
                    ${s.devolucion.map(d => `
                        <tr class="border-t">
                            <td class="py-1">${escapeHtml(d.clave || '')} ${escapeHtml(d.nombre)}</td>
                            <td>${escapeHtml(d.cantidad)}</td>
                            <td>${escapeHtml(d.buenas)}</td>
                            <td class="${d.danadas > 0 ? 'text-amber-700 font-semibold' : ''}">${escapeHtml(d.danadas)}</td>
                            <td class="${d.faltantes > 0 ? 'text-red-700 font-semibold' : ''}">${escapeHtml(d.faltantes)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function nota(etiqueta, texto) {
    return texto ? `<p><strong>${etiqueta}:</strong> ${escapeHtml(texto)}</p>` : '';
}

function botonFlujo(id, flujo, texto, color, pedirMotivo = false) {
    return `<button data-accion="flujo" data-id="${escapeHtml(id)}" data-flujo="${flujo}"
        ${pedirMotivo ? 'data-pedir-motivo="1"' : ''}
        class="px-3 py-1.5 ${color} rounded-lg text-xs font-semibold">${texto}</button>`;
}

async function cargarHistorialSolicitud(id) {
    const cont = document.getElementById('det-sol-historial');
    cont.dataset.id = id;
    cont.innerHTML = '<p class="text-xs text-slate-400">Cargando historial…</p>';
    try {
        const lista = await apiFetch(`/movimientos/solicitud/${enc(id)}`);
        if (cont.dataset.id !== id) return; // el usuario ya abrió otra solicitud
        if (lista.length === 0) {
            cont.innerHTML = '<p class="text-xs text-slate-400">Sin movimientos registrados.</p>';
            return;
        }
        cont.innerHTML = `
            <p class="font-semibold mb-2">Historial de movimientos:</p>
            <ul class="space-y-1.5 text-xs">
                ${lista.map(m => {
                    const extra = [describirDetalle(m), ...describirCambios(m)].filter(Boolean).join(' · ');
                    return `
                    <li class="border-l-2 border-slate-200 pl-3">
                        <span class="text-slate-500">${escapeHtml(formatearFecha(m.fecha))}</span>
                        <span class="px-1.5 py-0.5 rounded font-bold bg-slate-100">${escapeHtml(m.tipoMovimiento)}</span>
                        ${escapeHtml(m.nombreArticulo)} <strong>x${escapeHtml(m.cantidad)}</strong>
                        ${m.nombreEncargado ? `<span class="text-slate-500">· ${escapeHtml(m.nombreEncargado)}</span>` : ''}
                        ${extra ? `<br><span class="text-slate-500">${escapeHtml(extra)}</span>` : ''}
                    </li>`;
                }).join('')}
            </ul>`;
    } catch (err) {
        if (cont.dataset.id === id) {
            cont.innerHTML = `<p class="text-xs text-red-600">No se pudo cargar el historial: ${escapeHtml(err.message)}</p>`;
        }
    }
}

async function verDetalleSolicitud(id) {
    try {
        const s = await apiFetch(`/solicitudes/${enc(id)}`);
        solicitudActual = s;
        const encargado = esEncargado();
        const articulos = s.articulos || [];

        document.getElementById('det-sol-folio').innerHTML =
            `${escapeHtml(s.folio)} <span class="ml-2 align-middle">${insigniaEstado(s.estado)}</span>`;
        document.getElementById('det-sol-info').textContent =
            `Solicitante: ${s.nombreSolicitante} | Práctica: ${s.practica}`;

        let html = `
            <div class="bg-slate-50 p-3 rounded-lg border">
                <p class="font-semibold mb-2">Artículos solicitados:</p>
                <ul class="space-y-1">
                    ${articulos.map(a => `<li class="flex justify-between"><span>${escapeHtml(a.clave || '')} - ${escapeHtml(a.nombre)} (${escapeHtml(a.tipo)})</span><strong>x${escapeHtml(a.cantidad)}</strong></li>`).join('')}
                </ul>
            </div>
            ${seguimiento(s)}
            ${nota('Observaciones', s.observaciones)}
            ${nota(s.estado === 'RECHAZADA' ? 'Motivo del rechazo' : 'Nota de resolución', s.motivoResolucion)}
            ${nota('Motivo de cancelación', s.motivoCancelacion)}
            ${resumenDevolucion(s)}
            ${nota('Observaciones de la devolución', s.observacionesDevolucion)}
        `;

        if (encargado && s.estado === 'PENDIENTE') {
            html += `
            <div class="border-t pt-3">
                <label class="block text-xs font-medium mb-1">Nota para el solicitante (opcional, se guarda al aprobar)</label>
                <input type="text" id="det-nota" maxlength="500" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>`;
        }

        const prestables = articulos.filter(a => a.tipo === 'PRESTABLE');
        if (encargado && s.estado === 'ENTREGADA' && prestables.length > 0) {
            html += `
            <div class="border-t pt-3 space-y-2">
                <p class="font-bold text-indigo-900">Reporte de Devolución de Equipo Prestable:</p>
                ${prestables.map(p => `
                    <div data-fila-devolucion data-total="${escapeHtml(p.cantidad)}" class="grid grid-cols-4 gap-2 items-center bg-indigo-50/50 p-2 rounded">
                        <span class="col-span-1 font-medium text-xs">${escapeHtml(p.nombre)} (Total: ${escapeHtml(p.cantidad)})</span>
                        <div><label class="text-[10px]">Buenas</label><input type="number" data-dev="b" id="dev-b-${escapeHtml(p.idArticulo)}" min="0" max="${escapeHtml(p.cantidad)}" value="${escapeHtml(p.cantidad)}" class="w-full px-2 py-1 border rounded text-xs"></div>
                        <div><label class="text-[10px]">Dañadas</label><input type="number" data-dev="d" id="dev-d-${escapeHtml(p.idArticulo)}" min="0" max="${escapeHtml(p.cantidad)}" value="0" class="w-full px-2 py-1 border rounded text-xs"></div>
                        <div><label class="text-[10px]">Faltantes</label><input type="number" data-dev="f" id="dev-f-${escapeHtml(p.idArticulo)}" min="0" max="${escapeHtml(p.cantidad)}" value="0" class="w-full px-2 py-1 border rounded text-xs"></div>
                        <p data-dev-mensaje class="col-span-4 text-[11px] text-emerald-700">Cuadra con el total.</p>
                    </div>
                `).join('')}
                <div>
                    <label class="block text-xs font-medium mb-1">Observaciones de la devolución (opcional)</label>
                    <textarea id="dev-observaciones" rows="2" maxlength="500" class="w-full px-2 py-1 border rounded text-xs"></textarea>
                </div>
            </div>`;
        }
        document.getElementById('det-sol-contenido').innerHTML = html;

        const sid = s.idSolicitudes;
        let botones = `<button data-accion="imprimir-vale" data-id="${escapeHtml(sid)}" class="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold">Imprimir vale</button>`;
        if (encargado && s.estado === 'PENDIENTE') {
            botones += botonFlujo(sid, 'aprobar', 'Aprobar', 'bg-emerald-600 text-white');
            botones += botonFlujo(sid, 'rechazar', 'Rechazar', 'bg-red-600 text-white', true);
        }
        if (encargado && s.estado === 'APROBADA') {
            botones += botonFlujo(sid, 'entregar', 'Registrar Entrega', 'bg-indigo-600 text-white');
        }
        if (encargado && s.estado === 'ENTREGADA') {
            botones += `<button id="btn-registrar-devolucion" data-accion="devolver" data-id="${escapeHtml(sid)}" class="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Registrar Devolución</button>`;
        }
        if (encargado && s.estado === 'DEVUELTA') {
            botones += botonFlujo(sid, 'cerrar', 'Cerrar Solicitud', 'bg-slate-800 text-white');
        }
        if (['PENDIENTE', 'APROBADA'].includes(s.estado)) {
            botones += botonFlujo(sid, 'cancelar', 'Cancelar Solicitud', 'bg-slate-200 text-slate-800');
        }

        document.getElementById('det-sol-acciones').innerHTML = botones;
        validarDevolucionEnVivo();
        abrirModal('modal-detalle-solicitud');
        cargarHistorialSolicitud(sid);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function accionFlujo(id, accion, motivoObligatorio = false) {
    let motivo = '';
    if (motivoObligatorio || accion === 'cancelar') {
        const rechazo = accion === 'rechazar';
        const entrada = await pedirDialogo({
            titulo: rechazo ? 'Rechazar solicitud' : 'Cancelar solicitud',
            mensaje: rechazo
                ? 'La persona que la pidió podrá ver este motivo.'
                : 'La solicitud quedará cancelada.',
            etiqueta: rechazo ? 'Motivo del rechazo' : 'Motivo de la cancelación (opcional)',
            obligatorio: motivoObligatorio,
            textoAceptar: rechazo ? 'Rechazar' : 'Cancelar solicitud',
            peligro: true
        });
        if (entrada === null) return; // cerró el diálogo: no se hace nada
        motivo = entrada;
    } else if (accion === 'aprobar') {
        motivo = document.getElementById('det-nota')?.value.trim() || '';
    }
    try {
        await apiFetch(`/solicitudes/${enc(id)}/${accion}`, {
            method: 'PATCH',
            body: JSON.stringify({ motivo })
        });
        cerrarModal('modal-detalle-solicitud');
        mostrarToast(`Operación "${accion}" realizada`);
        cargarSolicitudes();
        cargarArticulos(); // el stock cambió (reserva, entrega, liberación...)
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function registrarDevolucion(id) {
    try {
        const s = await apiFetch(`/solicitudes/${enc(id)}`);
        const prestables = (s.articulos || []).filter(a => a.tipo === 'PRESTABLE');
        const leer = (prefijo, p) =>
            parseInt(document.getElementById(`${prefijo}-${p.idArticulo}`).value, 10);

        const articulos = prestables.map(p => ({
            idArticulo: p.idArticulo,
            buenas: leer('dev-b', p),
            danadas: leer('dev-d', p),
            faltantes: leer('dev-f', p)
        }));
        const observaciones = document.getElementById('dev-observaciones')?.value.trim() || '';

        await apiFetch(`/solicitudes/${enc(id)}/devolver`, {
            method: 'PATCH',
            body: JSON.stringify({ articulos, observaciones })
        });
        cerrarModal('modal-detalle-solicitud');
        mostrarToast('Devolución registrada');
        cargarSolicitudes();
        cargarArticulos(); // las unidades devueltas vuelven al stock
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ---------- Vale imprimible ----------

let solicitudActual = null; // la solicitud que está abierta en el detalle

function armarVale(s) {
    const articulos = s.articulos || [];
    const hayPrestables = articulos.some(a => a.tipo === 'PRESTABLE');
    const dato = (etiqueta, valor) =>
        valor ? `<p><strong>${etiqueta}:</strong> ${escapeHtml(valor)}</p>` : '';

    const filasArticulos = articulos.map(a => `
        <tr>
            <td>${escapeHtml(a.clave || '')}</td>
            <td>${escapeHtml(a.nombre)}</td>
            <td>${escapeHtml(a.tipo)}</td>
            <td>${escapeHtml(a.cantidad)}</td>
        </tr>`).join('');

    const devolucion = Array.isArray(s.devolucion) && s.devolucion.length > 0 ? `
        <p class="vale-seccion">Resultado de la devolución</p>
        <table class="vale-tabla">
            <thead><tr><th>Artículo</th><th>Total</th><th>Buenas</th><th>Dañadas</th><th>Faltantes</th></tr></thead>
            <tbody>
                ${s.devolucion.map(d => `
                    <tr>
                        <td>${escapeHtml(d.clave || '')} ${escapeHtml(d.nombre)}</td>
                        <td>${escapeHtml(d.cantidad)}</td>
                        <td>${escapeHtml(d.buenas)}</td>
                        <td>${escapeHtml(d.danadas)}</td>
                        <td>${escapeHtml(d.faltantes)}</td>
                    </tr>`).join('')}
            </tbody>
        </table>
        ${dato('Observaciones de la devolución', s.observacionesDevolucion)}` : '';

    const pasos = pasosSeguimiento(s).map(([etiqueta, fecha, quien]) =>
        `<li>${etiqueta}${quien ? ` por ${escapeHtml(quien)}` : ''}: ${escapeHtml(formatearFecha(fecha))}</li>`
    ).join('');

    return `
        <div class="vale-encabezado">
            <div>
                <h1 class="vale-titulo">Vale de laboratorio</h1>
                <p class="vale-subtitulo">Inventario Lab Redes - UAQ</p>
            </div>
            <div class="vale-folio">${escapeHtml(s.folio)}</div>
        </div>

        <div class="vale-datos">
            ${dato('Estado', s.estado)}
            ${dato('Fecha de solicitud', formatearFecha(s.fechaSolicitud))}
            ${dato('Solicitante', s.nombreSolicitante)}
            ${dato('Práctica', s.practica)}
        </div>
        ${dato('Observaciones', s.observaciones)}
        ${dato(s.estado === 'RECHAZADA' ? 'Motivo del rechazo' : 'Nota de resolución', s.motivoResolucion)}
        ${dato('Motivo de cancelación', s.motivoCancelacion)}

        <p class="vale-seccion">Artículos</p>
        <table class="vale-tabla">
            <thead><tr><th>Clave</th><th>Artículo</th><th>Tipo</th><th>Cantidad</th></tr></thead>
            <tbody>${filasArticulos}</tbody>
        </table>

        ${devolucion}

        <p class="vale-seccion">Seguimiento</p>
        <ul class="vale-seguimiento">${pasos}</ul>

        <div class="vale-firmas">
            <div class="vale-firma">Solicitante<br>${escapeHtml(s.nombreSolicitante)}</div>
            <div class="vale-firma">Encargado que entrega</div>
            ${hayPrestables ? '<div class="vale-firma">Encargado que recibe la devolución</div>' : ''}
        </div>

        <p class="vale-pie">Impreso el ${escapeHtml(formatearFecha(new Date().toISOString()))}</p>`;
}

function imprimirVale(id) {
    const s = solicitudActual;
    if (!s || s.idSolicitudes !== id) {
        mostrarToast('Abre la solicitud de nuevo para imprimir el vale', 'error');
        return;
    }
    document.getElementById('vale-impresion').innerHTML = armarVale(s);

    // El título de la pestaña es el nombre que propone el navegador al guardar como PDF.
    imprimiendo = true;
    document.title = `Vale ${s.folio}`;
    window.addEventListener('afterprint', () => {
        imprimiendo = false;
        aplicarTitulo();
    }, { once: true });
    window.print();
}

// Revisa fila por fila que buenas + dañadas + faltantes sea igual al total prestado
// (la misma regla que valida el backend) y solo habilita el botón cuando todo cuadra.
function validarDevolucionEnVivo() {
    let todoCuadra = true;
    document.querySelectorAll('[data-fila-devolucion]').forEach(fila => {
        const total = parseInt(fila.dataset.total, 10);
        const [b, d, f] = ['b', 'd', 'f']
            .map(k => parseInt(fila.querySelector(`[data-dev="${k}"]`).value, 10));
        const mensaje = fila.querySelector('[data-dev-mensaje]');

        let texto;
        if (![b, d, f].every(n => Number.isInteger(n) && n >= 0)) {
            texto = 'Escribe un número entero (0 o más) en cada campo.';
        } else if (b + d + f !== total) {
            const diferencia = total - (b + d + f);
            texto = `Suman ${b + d + f} de ${total}: ${diferencia > 0 ? `faltan ${diferencia}` : `sobran ${-diferencia}`}.`;
        }

        if (texto) todoCuadra = false;
        mensaje.textContent = texto || 'Cuadra con el total.';
        mensaje.className = `col-span-4 text-[11px] ${texto ? 'text-red-600' : 'text-emerald-700'}`;
    });

    const boton = document.getElementById('btn-registrar-devolucion');
    if (boton) boton.disabled = !todoCuadra;
}

// ---------- Eventos ----------

document.getElementById('filtro-solicitud-texto').addEventListener('input', renderizarSolicitudes);
document.getElementById('det-sol-contenido').addEventListener('input', (e) => {
    if (e.target.dataset.dev) validarDevolucionEnVivo();
});

registrarAcciones({
    'filtro-estado-sol': (d) => { filtroEstado = d.estado; renderizarSolicitudes(); },
    'imprimir-vale': (d) => imprimirVale(d.id),
    'nueva-solicitud': abrirModalNuevaSolicitud,
    'ver-solicitud': (d) => verDetalleSolicitud(d.id),
    'flujo': (d) => accionFlujo(d.id, d.flujo, d.pedirMotivo === '1'),
    'devolver': (d) => registrarDevolucion(d.id)
});
