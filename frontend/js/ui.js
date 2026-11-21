// Utilidades de interfaz compartidas por todas las páginas.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Úsalo SIEMPRE que metas datos del servidor dentro de un template de innerHTML.
export function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
}

// Colores por estado de solicitud (se usan en la tabla y en el detalle).
const CLASES_ESTADO = {
    PENDIENTE: 'bg-amber-100 text-amber-800',
    APROBADA: 'bg-sky-100 text-sky-800',
    ENTREGADA: 'bg-indigo-100 text-indigo-800',
    DEVUELTA: 'bg-violet-100 text-violet-800',
    CERRADA: 'bg-slate-200 text-slate-700',
    RECHAZADA: 'bg-red-100 text-red-800',
    CANCELADA: 'bg-slate-100 text-slate-500'
};

export function insigniaEstado(estado) {
    const clase = CLASES_ESTADO[estado] || 'bg-slate-100 text-slate-600';
    return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${clase}">${escapeHtml(estado)}</span>`;
}

export function formatearFecha(iso) {
    return iso ? new Date(iso).toLocaleString() : '-';
}

export function iconos() {
    window.lucide?.createIcons();
}

export function mostrarToast(mensaje, tipo = 'ok') {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const div = document.createElement('div');
    const color = tipo === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    div.className = `${color} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium toast-enter max-w-sm`;
    div.textContent = mensaje;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// Mensaje que sobrevive a un cambio de página (ej. "Bienvenido" tras el login).
export function guardarFlash(mensaje, tipo = 'ok') {
    sessionStorage.setItem('flash', JSON.stringify({ mensaje, tipo }));
}

function mostrarFlash() {
    const crudo = sessionStorage.getItem('flash');
    if (!crudo) return;
    sessionStorage.removeItem('flash');
    try {
        const { mensaje, tipo } = JSON.parse(crudo);
        mostrarToast(mensaje, tipo);
    } catch { /* flash corrupto: se ignora */ }
}

export function abrirModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
}

export function cerrarModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}

// Deshabilita los botones submit mientras corre la tarea (evita doble envío).
export async function enviando(form, tarea) {
    const botones = form.querySelectorAll('button[type="submit"]');
    botones.forEach(b => { b.disabled = true; b.classList.add('opacity-60', 'cursor-wait'); });
    try {
        return await tarea();
    } finally {
        botones.forEach(b => { b.disabled = false; b.classList.remove('opacity-60', 'cursor-wait'); });
    }
}

// Reemplaza los onclick="..." del HTML.
// En el HTML:  <button data-accion="ver-solicitud" data-id="123">
// En el JS:    registrarAcciones({ 'ver-solicitud': (datos) => ver(datos.id) })
export function registrarAcciones(mapa) {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-accion]');
        if (!el) return;
        const manejador = mapa[el.dataset.accion];
        if (manejador) manejador(el.dataset, el, e);
    });
}

registrarAcciones({
    'abrir-modal': (d) => abrirModal(d.modal),
    'cerrar-modal': (d) => cerrarModal(d.modal)
});

// ---------- Diálogos (reemplazan prompt() y confirm()) ----------

const CLASE_ACEPTAR = 'px-4 py-2 text-sm text-white rounded-lg font-semibold';
let resolverDialogo = null;
let configDialogo = {};

function cerrarDialogo(valor) {
    cerrarModal('modal-dialogo');
    const resolver = resolverDialogo;
    resolverDialogo = null;
    resolver?.(valor);
}

function campoDialogo() {
    return document.getElementById(
        configDialogo.tipo === 'password' ? 'dialogo-campo-password' : 'dialogo-campo-texto'
    );
}

function mostrarErrorDialogo(texto) {
    const el = document.getElementById('dialogo-error');
    el.textContent = texto;
    el.classList.toggle('hidden', !texto);
}

// Devuelve una promesa con el texto escrito ('' si el diálogo no tiene campo) o null si se cancela.
//   etiqueta: si se indica, el diálogo muestra un campo (texto o contraseña).
//   obligatorio: el campo no puede quedar vacío.
//   validar(valor): devuelve un mensaje de error, o '' si el valor es correcto.
export function pedirDialogo({
    titulo, mensaje = '', etiqueta = null, tipo = 'texto', obligatorio = false,
    maxLength = 500, textoAceptar = 'Aceptar', peligro = false, validar = null
}) {
    return new Promise((resolve) => {
        resolverDialogo?.(null); // si había otro abierto, se cancela
        resolverDialogo = resolve;
        configDialogo = { tipo, obligatorio, validar, etiqueta };

        document.getElementById('dialogo-titulo').textContent = titulo;
        const msg = document.getElementById('dialogo-mensaje');
        msg.textContent = mensaje;
        msg.classList.toggle('hidden', !mensaje);

        const esPassword = tipo === 'password';
        document.getElementById('dialogo-campo-contenedor').classList.toggle('hidden', !etiqueta);
        document.getElementById('dialogo-etiqueta').textContent = etiqueta || '';
        document.getElementById('dialogo-etiqueta').htmlFor =
            esPassword ? 'dialogo-campo-password' : 'dialogo-campo-texto';
        document.getElementById('dialogo-campo-texto').classList.toggle('hidden', esPassword);
        document.getElementById('dialogo-campo-password').classList.toggle('hidden', !esPassword);

        const campo = campoDialogo();
        campo.value = '';
        campo.maxLength = maxLength;
        mostrarErrorDialogo('');

        const aceptar = document.getElementById('dialogo-aceptar');
        aceptar.textContent = textoAceptar;
        aceptar.className = `${CLASE_ACEPTAR} ${peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`;

        abrirModal('modal-dialogo');
        (etiqueta ? campo : aceptar).focus();
    });
}

// Devuelve true si la persona acepta y false si cancela.
export const confirmar = (opciones) =>
    pedirDialogo({ ...opciones, etiqueta: null }).then(valor => valor !== null);

document.getElementById('form-dialogo')?.addEventListener('submit', (e) => {
    e.preventDefault();
    let valor = '';
    if (configDialogo.etiqueta) {
        const campo = campoDialogo();
        valor = configDialogo.tipo === 'password' ? campo.value : campo.value.trim();
        const error = configDialogo.obligatorio && !valor
            ? 'Este campo es obligatorio.'
            : (configDialogo.validar ? configDialogo.validar(valor) : '');
        if (error) {
            mostrarErrorDialogo(error);
            campo.focus();
            return;
        }
    }
    cerrarDialogo(valor);
});
document.getElementById('dialogo-cancelar')?.addEventListener('click', () => cerrarDialogo(null));
document.getElementById('modal-dialogo')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) cerrarDialogo(null); // clic fuera del cuadro
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && resolverDialogo) cerrarDialogo(null);
});

mostrarFlash();
iconos();
