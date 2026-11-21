// Bitácora de movimientos: por artículo o solicitante (encargado) o propios (solicitante).
// Los filtros por tipo, fecha y texto, la paginación y la exportación a CSV se hacen en el
// navegador sobre la lista que devuelve el backend (que no pagina ni filtra).
import { apiFetch, obtenerUsuario } from './api.js';
import { esEncargado } from './auth.js';
import { estado as estadoCatalogo, cargarArticulos } from './catalogo.js';
import { listarUsuarios } from './usuarios.js';
import { escapeHtml, formatearFecha, mostrarToast, registrarAcciones } from './ui.js';

const enc = encodeURIComponent;
const TAM_PAGINA = 25;

const selectArticulo = document.getElementById('select-articulo-movimientos');
const selectSolicitante = document.getElementById('select-solicitante-movimientos');
const filtroTexto = document.getElementById('filtro-mov-texto');
const filtroTipo = document.getElementById('filtro-mov-tipo');
const filtroDesde = document.getElementById('filtro-mov-desde');
const filtroHasta = document.getElementById('filtro-mov-hasta');

let todos = [];            // lo que devolvió el backend para la vista actual
let pagina = 1;
let articuloPendiente = null; // artículo elegido desde el catálogo ("Historial")

const CONTADORES = [
    ['existencias', 'Existencias'], ['disponibles', 'Disponibles'], ['prestados', 'Prestados'],
    ['reservados', 'Reservados'], ['danados', 'Dañados'], ['libres', 'Libres']
];

// Qué contadores del artículo cambió el movimiento: ["Reservados 0→2", "Libres 5→3"].
export function describirCambios(m) {
    const { antes, despues } = m;
    if (antes && despues) {
        return CONTADORES
            .filter(([k]) => antes[k] !== undefined && antes[k] !== despues[k])
            .map(([k, etiqueta]) => `${etiqueta} ${antes[k]}→${despues[k]}`);
    }
    // Movimientos antiguos: solo guardaban el saldo de disponibles.
    if (m.saldoAntes !== undefined && m.saldoDespues !== undefined && m.saldoAntes !== m.saldoDespues) {
        return [`Disponibles ${m.saldoAntes}→${m.saldoDespues}`];
    }
    return [];
}

// Datos extra del movimiento (devolución por estado, estado previo al cancelar).
export function describirDetalle(m) {
    const d = m.detalle;
    if (!d) return '';
    const partes = [];
    if (d.buenas !== undefined) {
        partes.push(`Buenas ${d.buenas}`, `Dañadas ${d.danadas}`, `Faltantes ${d.faltantes}`);
    }
    if (d.estadoAnterior) partes.push(`Estaba ${d.estadoAnterior}`);
    return partes.join(' · ');
}

function poblarSelectArticulos() {
    selectArticulo.innerHTML = '<option value="">-- Filtrar por artículo --</option>' +
        estadoCatalogo.articulos.map(a =>
            `<option value="${escapeHtml(a.idArticulo)}">${escapeHtml(a.clave || '')} - ${escapeHtml(a.nombre)}</option>`
        ).join('');
}

async function poblarSelectSolicitantes() {
    try {
        const usuarios = await listarUsuarios();
        selectSolicitante.innerHTML = '<option value="">-- Filtrar por solicitante --</option>' +
            usuarios.map(u =>
                `<option value="${escapeHtml(u.idUsuario)}">${escapeHtml(u.nombre)}</option>`
            ).join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function limpiarFiltros() {
    filtroTexto.value = '';
    filtroTipo.value = '';
    filtroDesde.value = '';
    filtroHasta.value = '';
}

// Guarda la lista nueva y vuelve a la primera página.
function mostrarLista(lista) {
    todos = lista;
    pagina = 1;
    renderizarMovimientos();
}

export async function cargarMovimientos() {
    limpiarFiltros();
    try {
        if (esEncargado()) {
            if (estadoCatalogo.articulos.length === 0) await cargarArticulos();
            poblarSelectArticulos();
            await poblarSelectSolicitantes();
            const inicial =
                estadoCatalogo.articulos.find(a => a.idArticulo === articuloPendiente) ||
                estadoCatalogo.articulos[0];
            articuloPendiente = null;
            if (inicial) {
                selectArticulo.value = inicial.idArticulo;
                await cargarMovimientosPorArticulo(inicial.idArticulo);
            } else {
                mostrarLista([]);
            }
        } else {
            const { idUsuario } = obtenerUsuario();
            const lista = await apiFetch(`/movimientos/solicitante/${enc(idUsuario)}`);
            mostrarLista(lista);
        }
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function cargarMovimientosPorArticulo(idArticulo) {
    if (!idArticulo) return;
    try {
        const lista = await apiFetch(`/movimientos/articulo/${enc(idArticulo)}`);
        mostrarLista(lista);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function cargarMovimientosPorSolicitante(idSolicitante) {
    if (!idSolicitante) return;
    try {
        const lista = await apiFetch(`/movimientos/solicitante/${enc(idSolicitante)}`);
        mostrarLista(lista);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ---------- Filtros ----------

function filtrar() {
    const q = filtroTexto.value.trim().toLowerCase();
    const desde = filtroDesde.value ? new Date(`${filtroDesde.value}T00:00:00`) : null;
    const hasta = filtroHasta.value ? new Date(`${filtroHasta.value}T23:59:59.999`) : null;

    return todos.filter(m => {
        if (filtroTipo.value && m.tipoMovimiento !== filtroTipo.value) return false;
        const fecha = new Date(m.fecha);
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;
        if (q) {
            const texto = [
                m.nombreArticulo, m.claveArticulo, m.folio, m.motivo, m.nombreEncargado, m.nombreSolicitante
            ].filter(Boolean).join(' ').toLowerCase();
            if (!texto.includes(q)) return false;
        }
        return true;
    });
}

// ---------- Tabla y paginación ----------

function renderizarMovimientos() {
    const lista = filtrar();
    const paginas = Math.max(1, Math.ceil(lista.length / TAM_PAGINA));
    pagina = Math.min(Math.max(pagina, 1), paginas);
    const inicio = (pagina - 1) * TAM_PAGINA;
    const visibles = lista.slice(inicio, inicio + TAM_PAGINA);

    const tbody = document.getElementById('tabla-movimientos');
    if (visibles.length === 0) {
        const mensaje = todos.length === 0
            ? 'Sin movimientos registrados.'
            : 'Ningún movimiento coincide con los filtros.';
        tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-8 text-center text-slate-400">${mensaje}</td></tr>`;
    } else {
        tbody.innerHTML = visibles.map(filaMovimiento).join('');
    }

    const resumen = lista.length === 0
        ? 'Sin resultados'
        : `Mostrando ${inicio + 1}–${inicio + visibles.length} de ${lista.length}` +
          (lista.length !== todos.length ? ` (filtrado de ${todos.length})` : '');
    document.getElementById('movimientos-resumen').textContent = resumen;
    document.getElementById('mov-pagina-actual').textContent = `${pagina} / ${paginas}`;
    document.getElementById('mov-anterior').disabled = pagina <= 1;
    document.getElementById('mov-siguiente').disabled = pagina >= paginas;
}

function filaMovimiento(m) {
    const detalle = describirDetalle(m);
    const cambios = describirCambios(m);
    const responsables = [
        m.nombreEncargado ? escapeHtml(m.nombreEncargado) : '',
        m.nombreSolicitante ? `<span class="text-slate-400">Solicitante:</span> ${escapeHtml(m.nombreSolicitante)}` : ''
    ].filter(Boolean).join('<br>') || '-';

    return `
        <tr class="hover:bg-slate-50">
            <td class="px-5 py-3 text-xs text-slate-500">${escapeHtml(formatearFecha(m.fecha))}</td>
            <td class="px-5 py-3"><span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100">${escapeHtml(m.tipoMovimiento)}</span></td>
            <td class="px-5 py-3 font-medium">${m.claveArticulo ? `<span class="text-xs text-slate-400">${escapeHtml(m.claveArticulo)}</span><br>` : ''}${escapeHtml(m.nombreArticulo)}</td>
            <td class="px-5 py-3 font-bold">${escapeHtml(m.cantidad)}</td>
            <td class="px-5 py-3 text-xs">
                ${m.folio ? `<strong>${escapeHtml(m.folio)}</strong> - ` : ''}${escapeHtml(m.motivo || '-')}
                ${detalle ? `<br><span class="text-slate-500">${escapeHtml(detalle)}</span>` : ''}
            </td>
            <td class="px-5 py-3 text-xs text-slate-600">${cambios.length ? cambios.map(escapeHtml).join('<br>') : '-'}</td>
            <td class="px-5 py-3 text-xs">${responsables}</td>
        </tr>`;
}

// ---------- Exportar a CSV ----------

// Entre comillas y con las comillas internas duplicadas. Si el texto empieza con un símbolo que
// Excel interpreta como fórmula (= + - @), se antepone un apóstrofo para que se lea como texto.
function celdaCsv(valor) {
    let texto = String(valor ?? '');
    if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replace(/"/g, '""')}"`;
}

function fechaParaCsv(iso) {
    const d = new Date(iso);
    const dos = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ` +
           `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

function exportarCsv() {
    const lista = filtrar();
    if (lista.length === 0) {
        mostrarToast('No hay movimientos para exportar', 'error');
        return;
    }
    const encabezado = [
        'Fecha', 'Tipo', 'Clave', 'Artículo', 'Cantidad', 'Folio', 'Motivo',
        'Cambio en inventario', 'Encargado', 'Solicitante'
    ];
    const filas = lista.map(m => [
        fechaParaCsv(m.fecha), m.tipoMovimiento, m.claveArticulo, m.nombreArticulo, m.cantidad,
        m.folio, m.motivo,
        [describirDetalle(m), ...describirCambios(m)].filter(Boolean).join(' | '),
        m.nombreEncargado, m.nombreSolicitante
    ]);
    // El BOM (\uFEFF) hace que Excel abra bien los acentos.
    const csv = '\uFEFF' + [encabezado, ...filas].map(f => f.map(celdaCsv).join(',')).join('\r\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `movimientos_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    mostrarToast(`${lista.length} movimiento(s) exportados`);
}

// ---------- Eventos ----------

selectArticulo.addEventListener('change', (e) => {
    if (e.target.value) selectSolicitante.value = '';
    cargarMovimientosPorArticulo(e.target.value);
});

selectSolicitante.addEventListener('change', (e) => {
    if (e.target.value) {
        selectArticulo.value = '';
        cargarMovimientosPorSolicitante(e.target.value);
        return;
    }
    // Quitó el filtro de solicitante: vuelve a la vista por artículo.
    const primero = estadoCatalogo.articulos[0];
    if (primero) {
        selectArticulo.value = primero.idArticulo;
        cargarMovimientosPorArticulo(primero.idArticulo);
    }
});

const refiltrar = () => { pagina = 1; renderizarMovimientos(); };
filtroTexto.addEventListener('input', refiltrar);
[filtroTipo, filtroDesde, filtroHasta].forEach(el => el.addEventListener('change', refiltrar));

registrarAcciones({
    'mov-pagina': (d) => { pagina += parseInt(d.dir, 10); renderizarMovimientos(); },
    'exportar-movimientos': exportarCsv
});

// Desde el catálogo: "Historial" de un artículo. Se guarda cuál y se navega a esta sección.
window.addEventListener('app:historial-articulo', (e) => {
    articuloPendiente = e.detail;
    window.dispatchEvent(new CustomEvent('app:navegar', { detail: 'movimientos' }));
});
