// Catálogo de artículos, carrito de solicitud y administración del inventario.
import { apiFetch, obtenerUsuario } from './api.js';
import { esEncargado } from './auth.js';
import {
    escapeHtml, mostrarToast, cerrarModal, abrirModal, registrarAcciones, enviando, iconos, confirmar
} from './ui.js';

// El carrito se guarda por usuario en sessionStorage: sobrevive a recargar la página
// y se borra al cerrar la pestaña o al cerrar sesión.
const claveCarrito = () => `carrito:${obtenerUsuario()?.idUsuario || ''}`;

function leerCarritoGuardado() {
    try {
        const crudo = JSON.parse(sessionStorage.getItem(claveCarrito()) || '{}');
        const limpio = {};
        for (const [id, cantidad] of Object.entries(crudo)) {
            if (Number.isInteger(cantidad) && cantidad > 0) limpio[id] = cantidad;
        }
        return limpio;
    } catch {
        return {};
    }
}

function guardarCarrito() {
    try {
        if (Object.keys(estado.carrito).length === 0) sessionStorage.removeItem(claveCarrito());
        else sessionStorage.setItem(claveCarrito(), JSON.stringify(estado.carrito));
    } catch { /* sin almacenamiento disponible: el carrito vive solo en memoria */ }
}

// Estado compartido con solicitudes.js y movimientos.js
export const estado = {
    articulos: [],
    carrito: leerCarritoGuardado() // { idArticulo: cantidad }
};

const enc = encodeURIComponent;
const valor = (id) => document.getElementById(id).value;

// Mismos límites que valida el backend (upload.middleware.js).
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FOTO = 5 * 1024 * 1024;

function validarFoto(archivo) {
    if (!archivo) return null;
    if (!TIPOS_FOTO.includes(archivo.type)) return 'La foto debe ser JPG, PNG o WEBP';
    if (archivo.size > MAX_FOTO) return 'La foto no debe pesar más de 5 MB';
    return null;
}

function subirFoto(idArticulo, archivo) {
    const fd = new FormData();
    fd.append('foto', archivo);
    return apiFetch(`/articulos/${enc(idArticulo)}/foto`, { method: 'POST', body: fd });
}

export async function cargarArticulos() {
    try {
        estado.articulos = await apiFetch('/articulos');
        depurarCarrito();
        poblarFiltrosCatalogo();
        renderizarArticulos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// Quita del carrito lo que ya no existe (p. ej. se eliminó) y recorta lo que excede las libres.
function depurarCarrito() {
    for (const [id, cantidad] of Object.entries(estado.carrito)) {
        const art = estado.articulos.find(a => a.idArticulo === id);
        if (!art || art.libres <= 0) delete estado.carrito[id];
        else if (cantidad > art.libres) estado.carrito[id] = art.libres;
    }
    actualizarContadorCarrito();
}

// Llena los filtros de categoría y ubicación con los valores que hay en el catálogo.
function poblarFiltro(idSelect, etiquetaTodos, valores) {
    const select = document.getElementById(idSelect);
    const actual = select.value;
    select.innerHTML = `<option value="">${etiquetaTodos}</option>` +
        valores.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    select.value = valores.includes(actual) ? actual : '';
}

function poblarFiltrosCatalogo() {
    const unicos = (campo) => [...new Set(estado.articulos.map(a => a[campo]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es'));
    poblarFiltro('filtro-articulo-categoria', 'Todas las categorías', unicos('categoria'));
    poblarFiltro('filtro-articulo-ubicacion', 'Todas las ubicaciones', unicos('ubicacion'));
}

export function renderizarArticulos() {
    const q = document.getElementById('filtro-articulo-texto').value.toLowerCase();
    const tipo = document.getElementById('filtro-articulo-tipo').value;
    const categoria = document.getElementById('filtro-articulo-categoria').value;
    const ubicacion = document.getElementById('filtro-articulo-ubicacion').value;
    const existencia = document.getElementById('filtro-articulo-existencia').value;
    const encargado = esEncargado();

    const filtrados = estado.articulos.filter(a => {
        const coincideTexto = [a.clave, a.nombre, a.categoria, a.ubicacion]
            .some(v => (v || '').toLowerCase().includes(q));
        const coincideTipo = !tipo || a.tipo === tipo;
        const coincideCategoria = !categoria || a.categoria === categoria;
        const coincideUbicacion = !ubicacion || a.ubicacion === ubicacion;
        const coincideExistencia = !existencia ||
            (existencia === 'disponibles' && a.libres > 0) ||
            (existencia === 'agotados' && !(a.libres > 0)) ||
            (existencia === 'danados' && a.danados > 0);
        return coincideTexto && coincideTipo && coincideCategoria && coincideUbicacion && coincideExistencia;
    });

    const grid = document.getElementById('grid-articulos');
    if (filtrados.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-slate-400 py-10">No se encontraron artículos.</p>';
        return;
    }

    grid.innerHTML = filtrados.map(a => {
        const id = escapeHtml(a.idArticulo);
        const enCarrito = estado.carrito[a.idArticulo] || 0;
        const prestable = a.tipo === 'PRESTABLE';
        const img = a.fotoUrl
            ? `<img src="${escapeHtml(a.fotoUrl)}" alt="${escapeHtml(a.nombre)}" class="w-full h-36 object-cover">`
            : `<div class="w-full h-36 bg-slate-100 flex items-center justify-center text-slate-400"><i data-lucide="cpu" class="w-10 h-10"></i></div>`;

        // Desglose de existencias: los consumibles solo tienen reservas (no se prestan ni se dañan).
        const desglose = prestable
            ? `Prestados: ${escapeHtml(a.prestados)} · Reservados: ${escapeHtml(a.reservados)} · Dañados: ${escapeHtml(a.danados)}`
            : `Reservados: ${escapeHtml(a.reservados)}`;

        const sinDanados = !(a.danados > 0);

        return `
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between">
            <div>
                <div class="relative">
                    ${img}
                    <span class="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded bg-slate-900/80 text-white">${escapeHtml(a.clave || 'SIN CLAVE')}</span>
                    <span class="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded ${prestable ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'}">${escapeHtml(a.tipo)}</span>
                </div>
                <div class="p-4 space-y-1.5">
                    <h3 class="font-bold text-slate-900 leading-snug">${escapeHtml(a.nombre)}</h3>
                    <p class="text-xs text-slate-500">${escapeHtml(a.categoria)} • <span class="font-medium text-slate-700">${escapeHtml(a.ubicacion)}</span></p>
                    <div class="pt-2 flex items-center justify-between text-xs">
                        <span class="font-semibold ${a.libres > 0 ? 'text-emerald-600' : 'text-red-600'}">Libres: ${escapeHtml(a.libres)} / ${escapeHtml(a.existencias)}</span>
                        <span class="text-slate-400">Condición: ${escapeHtml(a.condicion)}</span>
                    </div>
                    <p class="text-[11px] text-slate-400">${desglose}</p>
                </div>
            </div>
            <div class="p-3 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                    <button data-accion="carrito-menos" data-id="${id}" class="px-2.5 py-1 bg-white border rounded hover:bg-slate-100 text-sm font-bold">-</button>
                    <span class="text-xs font-semibold">En solicitud: ${enCarrito}</span>
                    <button data-accion="carrito-mas" data-id="${id}" ${enCarrito >= a.libres ? 'disabled' : ''} class="px-2.5 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 text-sm font-bold">+</button>
                </div>
                <div class="flex gap-1 text-xs">
                    <button data-accion="detalle-articulo" data-id="${id}" class="flex-1 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded font-medium">Detalle</button>
                    ${encargado ? `<button data-accion="historial-articulo" data-id="${id}" class="flex-1 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded font-medium">Historial</button>` : ''}
                </div>
                ${encargado ? `
                <div class="flex gap-1 pt-1 border-t border-slate-200 text-xs">
                    <button data-accion="ajustar-stock" data-id="${id}" data-operacion="reabastecer" class="flex-1 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-medium">+ Stock</button>
                    <button data-accion="ajustar-stock" data-id="${id}" data-operacion="baja" ${sinDanados ? 'disabled title="Solo se pueden dar de baja unidades dañadas"' : ''} class="flex-1 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded font-medium disabled:opacity-40 disabled:cursor-not-allowed">- Baja</button>
                </div>
                <div class="flex gap-1 text-xs">
                    <button data-accion="editar-articulo" data-id="${id}" class="flex-1 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded font-medium">Editar</button>
                    <button data-accion="eliminar-articulo" data-id="${id}" class="flex-1 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded font-medium">Eliminar</button>
                </div>` : ''}
            </div>
        </div>`;
    }).join('');
    iconos();
}

// ---------- Carrito ----------

function actualizarContadorCarrito() {
    const total = Object.values(estado.carrito).reduce((s, n) => s + n, 0);
    document.getElementById('carrito-count').textContent = total;
    guardarCarrito();
}

function cambiarCarrito(idArticulo, delta) {
    const art = estado.articulos.find(a => a.idArticulo === idArticulo);
    if (!art) return;
    const actual = estado.carrito[idArticulo] || 0;
    const nuevo = Math.max(0, Math.min(art.libres, actual + delta));
    if (nuevo === 0) delete estado.carrito[idArticulo];
    else estado.carrito[idArticulo] = nuevo;

    actualizarContadorCarrito();
    renderizarArticulos();
}

export function vaciarCarrito() {
    estado.carrito = {};
    actualizarContadorCarrito();
    renderizarArticulos();
}

// ---------- Ajuste de stock ----------

function abrirAjuste(idArticulo, operacion) {
    const art = estado.articulos.find(a => a.idArticulo === idArticulo);
    const cantidad = document.getElementById('ajuste-cantidad');
    const ayuda = document.getElementById('ajuste-ayuda');

    document.getElementById('ajuste-id-articulo').value = idArticulo;
    document.getElementById('ajuste-operacion').value = operacion;
    document.getElementById('ajuste-titulo').textContent =
        operacion === 'reabastecer' ? 'Reabastecer Existencias' : 'Dar de Baja Unidades';

    // El backend solo permite dar de baja unidades que estén marcadas como dañadas.
    if (operacion === 'baja') {
        const max = art?.danados ?? 0;
        cantidad.max = String(max);
        ayuda.textContent = `Solo se pueden dar de baja unidades dañadas. Dañadas actualmente: ${max}.`;
    } else {
        cantidad.removeAttribute('max');
        ayuda.textContent = '';
    }
    abrirModal('modal-ajuste-stock');
}

const formAjuste = document.getElementById('form-ajuste-stock');
formAjuste.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = valor('ajuste-id-articulo');
    const op = valor('ajuste-operacion');

    await enviando(formAjuste, async () => {
        try {
            await apiFetch(`/articulos/${enc(id)}/${op}`, {
                method: 'POST',
                body: JSON.stringify({
                    cantidad: parseInt(valor('ajuste-cantidad'), 10),
                    motivo: valor('ajuste-motivo')
                })
            });
            cerrarModal('modal-ajuste-stock');
            formAjuste.reset();
            mostrarToast('Inventario actualizado');
            cargarArticulos();
        } catch (err) {
            mostrarToast(err.message, 'error');
        }
    });
});

// ---------- Nuevo artículo ----------

const formArticulo = document.getElementById('form-nuevo-articulo');
formArticulo.addEventListener('submit', async (e) => {
    e.preventDefault();

    const archivo = document.getElementById('art-foto').files[0];
    const errorFoto = validarFoto(archivo);
    if (errorFoto) {
        mostrarToast(errorFoto, 'error');
        return;
    }

    await enviando(formArticulo, async () => {
        let creado;
        try {
            const payload = {
                clave: valor('art-clave'),
                tipo: valor('art-tipo'),
                nombre: valor('art-nombre'),
                categoria: valor('art-categoria'),
                ubicacion: valor('art-ubicacion'),
                existencias: parseInt(valor('art-existencias'), 10),
                condicion: valor('art-condicion')
            };
            creado = await apiFetch('/articulos', { method: 'POST', body: JSON.stringify(payload) });
        } catch (err) {
            mostrarToast(err.message, 'error');
            return;
        }

        // La foto se sube aparte: si falla, el artículo ya existe y no se debe reintentar el alta.
        if (archivo) {
            try {
                await subirFoto(creado.articulo.idArticulo, archivo);
            } catch (err) {
                mostrarToast(`Artículo creado, pero la foto no se subió: ${err.message}`, 'error');
                cerrarModal('modal-nuevo-articulo');
                formArticulo.reset();
                cargarArticulos();
                return;
            }
        }

        cerrarModal('modal-nuevo-articulo');
        formArticulo.reset();
        mostrarToast('Artículo registrado correctamente');
        cargarArticulos();
    });
});

// ---------- Editar artículo ----------

function abrirEdicion(idArticulo) {
    const a = estado.articulos.find(x => x.idArticulo === idArticulo);
    if (!a) return;

    document.getElementById('edit-art-id').value = a.idArticulo;
    // El tipo solo se puede cambiar si no hay unidades prestadas ni reservadas (lo exige el backend).
    const selTipo = document.getElementById('edit-art-tipo');
    const ayudaTipo = document.getElementById('edit-art-tipo-ayuda');
    const bloqueado = a.prestados > 0 || a.reservados > 0;
    selTipo.value = a.tipo;
    selTipo.disabled = bloqueado;
    ayudaTipo.textContent = bloqueado
        ? 'No se puede cambiar el tipo mientras haya unidades prestadas o reservadas.'
        : '';
    ayudaTipo.classList.toggle('hidden', !bloqueado);
    document.getElementById('edit-art-clave').value = a.clave || '';
    document.getElementById('edit-art-nombre').value = a.nombre || '';
    document.getElementById('edit-art-categoria').value = a.categoria || '';
    document.getElementById('edit-art-ubicacion').value = a.ubicacion || '';
    document.getElementById('edit-art-condicion').value = a.condicion || 'BUENO';
    document.getElementById('edit-art-foto').value = '';

    const foto = document.getElementById('edit-art-foto-actual');
    if (a.fotoUrl) {
        foto.src = a.fotoUrl;
        foto.classList.remove('hidden');
    } else {
        foto.removeAttribute('src');
        foto.classList.add('hidden');
    }
    abrirModal('modal-editar-articulo');
}

const formEditar = document.getElementById('form-editar-articulo');
formEditar.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = valor('edit-art-id');
    const actual = estado.articulos.find(a => a.idArticulo === id);
    if (!actual) {
        cerrarModal('modal-editar-articulo');
        mostrarToast('El artículo ya no está en el catálogo', 'error');
        return;
    }

    const archivo = document.getElementById('edit-art-foto').files[0];
    const errorFoto = validarFoto(archivo);
    if (errorFoto) {
        mostrarToast(errorFoto, 'error');
        return;
    }

    // Solo se envía lo que cambió (el backend rechaza un PUT sin campos).
    const nuevos = {
        clave: valor('edit-art-clave').trim().toUpperCase(),
        tipo: valor('edit-art-tipo'),
        nombre: valor('edit-art-nombre').trim(),
        categoria: valor('edit-art-categoria').trim(),
        ubicacion: valor('edit-art-ubicacion').trim(),
        condicion: valor('edit-art-condicion')
    };
    const cambios = {};
    for (const [campo, nuevo] of Object.entries(nuevos)) {
        if (nuevo !== (actual[campo] || '')) cambios[campo] = nuevo;
    }

    if (Object.keys(cambios).length === 0 && !archivo) {
        mostrarToast('No hay cambios que guardar', 'error');
        return;
    }

    await enviando(formEditar, async () => {
        if (Object.keys(cambios).length > 0) {
            try {
                await apiFetch(`/articulos/${enc(id)}`, { method: 'PUT', body: JSON.stringify(cambios) });
            } catch (err) {
                mostrarToast(err.message, 'error');
                return;
            }
        }

        // La foto va aparte: si falla, los datos ya quedaron guardados.
        if (archivo) {
            try {
                await subirFoto(id, archivo);
            } catch (err) {
                mostrarToast(`Datos guardados, pero la foto no se subió: ${err.message}`, 'error');
                cerrarModal('modal-editar-articulo');
                cargarArticulos();
                return;
            }
        }

        cerrarModal('modal-editar-articulo');
        mostrarToast('Artículo actualizado');
        cargarArticulos();
    });
});

// ---------- Eliminar artículo ----------

async function eliminarArticulo(idArticulo) {
    const art = estado.articulos.find(a => a.idArticulo === idArticulo);
    const nombre = art ? `${art.clave || ''} ${art.nombre}`.trim() : idArticulo;
    const acepta = await confirmar({
        titulo: 'Eliminar artículo',
        mensaje: `¿Eliminar "${nombre}"? Se borrará del inventario y su foto se quitará del almacenamiento. No se puede deshacer.`,
        textoAceptar: 'Eliminar',
        peligro: true
    });
    if (!acepta) return;

    try {
        await apiFetch(`/articulos/${enc(idArticulo)}`, { method: 'DELETE' });
        mostrarToast('Artículo eliminado');
        cargarArticulos(); // también depura el carrito
    } catch (err) {
        // Ej. 409 si tiene unidades prestadas o reservadas por solicitudes abiertas.
        mostrarToast(err.message, 'error');
    }
}

// ---------- Detalle de artículo ----------

async function abrirDetalleArticulo(idArticulo) {
    try {
        const a = await apiFetch(`/articulos/${enc(idArticulo)}`);
        const prestable = a.tipo === 'PRESTABLE';
        const celdas = [
            ['Existencias', a.existencias],
            ['Disponibles', a.disponibles],
            ['Libres', a.libres],
            ['Reservados', a.reservados],
            ...(prestable ? [['Prestados', a.prestados], ['Dañados', a.danados]] : [])
        ];
        const foto = a.fotoUrl
            ? `<img src="${escapeHtml(a.fotoUrl)}" alt="${escapeHtml(a.nombre)}" class="w-full max-h-64 object-cover rounded-lg border">`
            : `<div class="w-full h-40 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400"><i data-lucide="cpu" class="w-12 h-12"></i></div>`;

        document.getElementById('det-art-titulo').textContent = `${a.clave || 'SIN CLAVE'} · ${a.nombre}`;
        document.getElementById('det-art-contenido').innerHTML = `
            ${foto}
            <p class="text-slate-600">${escapeHtml(a.categoria)} • <span class="font-medium text-slate-800">${escapeHtml(a.ubicacion)}</span></p>
            <p class="text-xs text-slate-500">Tipo: <strong>${escapeHtml(a.tipo)}</strong> · Condición: <strong>${escapeHtml(a.condicion)}</strong></p>
            <div class="grid grid-cols-3 gap-2">
                ${celdas.map(([etiqueta, n]) => `
                    <div class="bg-slate-50 border rounded-lg p-2 text-center">
                        <p class="text-lg font-bold ${etiqueta === 'Libres' && !(n > 0) ? 'text-red-600' : 'text-slate-900'}">${escapeHtml(n)}</p>
                        <p class="text-[11px] text-slate-500">${etiqueta}</p>
                    </div>`).join('')}
            </div>
            <p class="text-[11px] text-slate-400">Libres = disponibles menos las unidades reservadas por solicitudes aprobadas.</p>`;
        document.getElementById('det-art-acciones').innerHTML = esEncargado()
            ? `<button data-accion="historial-articulo" data-id="${escapeHtml(a.idArticulo)}" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold">Ver historial completo</button>`
            : '';
        abrirModal('modal-detalle-articulo');
        iconos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// movimientos.js escucha este evento: abre el historial con el artículo ya elegido.
function abrirHistorialArticulo(idArticulo) {
    cerrarModal('modal-detalle-articulo');
    window.dispatchEvent(new CustomEvent('app:historial-articulo', { detail: idArticulo }));
}

// ---------- Eventos ----------

document.getElementById('filtro-articulo-texto').addEventListener('input', renderizarArticulos);
['tipo', 'categoria', 'ubicacion', 'existencia'].forEach(f =>
    document.getElementById(`filtro-articulo-${f}`).addEventListener('change', renderizarArticulos));

registrarAcciones({
    'carrito-mas': (d) => cambiarCarrito(d.id, 1),
    'carrito-menos': (d) => cambiarCarrito(d.id, -1),
    'ajustar-stock': (d) => abrirAjuste(d.id, d.operacion),
    'editar-articulo': (d) => abrirEdicion(d.id),
    'eliminar-articulo': (d) => eliminarArticulo(d.id),
    'detalle-articulo': (d) => abrirDetalleArticulo(d.id),
    'historial-articulo': (d) => abrirHistorialArticulo(d.id)
});
