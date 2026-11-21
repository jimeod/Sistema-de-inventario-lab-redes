// Gestión de usuarios (solo encargado).
import { apiFetch, obtenerUsuario, obtenerToken, guardarSesion } from './api.js';
import {
    escapeHtml, formatearFecha, mostrarToast, abrirModal, cerrarModal, registrarAcciones, enviando,
    pedirDialogo, confirmar
} from './ui.js';

const enc = encodeURIComponent;
let usuariosCargados = [];

// Lista de usuarios activos; la reutilizan otras secciones (filtros y "a nombre de").
export const listarUsuarios = () => apiFetch('/usuarios');

export async function cargarUsuarios() {
    try {
        usuariosCargados = await listarUsuarios();
        const yo = obtenerUsuario().idUsuario;
        document.getElementById('tabla-usuarios').innerHTML = usuariosCargados.map(u => `
            <tr class="hover:bg-slate-50">
                <td class="px-5 py-3 font-medium">${escapeHtml(u.nombre)}</td>
                <td class="px-5 py-3 text-slate-500">${escapeHtml(u.correo)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded text-xs font-semibold ${u.rol === 'ENCARGADO' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${escapeHtml(u.rol)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-500">${escapeHtml(formatearFecha(u.fechaRegistro))}</td>
                <td class="px-5 py-3 text-right space-x-2">
                    <button data-accion="editar-usuario" data-id="${escapeHtml(u.idUsuario)}" class="text-xs text-slate-700 hover:underline">Editar</button>
                    <button data-accion="reset-password" data-id="${escapeHtml(u.idUsuario)}" class="text-xs text-indigo-600 hover:underline">Reset Pass</button>
                    ${u.idUsuario !== yo ? `<button data-accion="desactivar-usuario" data-id="${escapeHtml(u.idUsuario)}" class="text-xs text-red-600 hover:underline">Desactivar</button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ---------- Nuevo usuario ----------

const formNuevo = document.getElementById('form-nuevo-usuario');
formNuevo.addEventListener('submit', async (e) => {
    e.preventDefault();
    await enviando(formNuevo, async () => {
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
            formNuevo.reset();
            mostrarToast('Usuario creado');
            cargarUsuarios();
        } catch (err) {
            mostrarToast(err.message, 'error');
        }
    });
});

// ---------- Editar usuario ----------

function abrirEdicion(id) {
    const u = usuariosCargados.find(x => x.idUsuario === id);
    if (!u) return;
    const propio = id === obtenerUsuario().idUsuario;

    document.getElementById('edit-usr-id').value = u.idUsuario;
    document.getElementById('edit-usr-nombre').value = u.nombre;
    document.getElementById('edit-usr-correo').value = u.correo;
    document.getElementById('edit-usr-rol').value = u.rol;
    // El backend no deja cambiar el rol de la propia cuenta.
    document.getElementById('edit-usr-rol').disabled = propio;
    document.getElementById('edit-usr-rol-ayuda').classList.toggle('hidden', !propio);
    abrirModal('modal-editar-usuario');
}

const formEditar = document.getElementById('form-editar-usuario');
formEditar.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('edit-usr-id').value;
    const actual = usuariosCargados.find(x => x.idUsuario === id);
    if (!actual) {
        cerrarModal('modal-editar-usuario');
        return;
    }
    const propio = id === obtenerUsuario().idUsuario;

    // Solo se envía lo que cambió (el backend rechaza un PUT sin campos).
    const nuevos = {
        nombre: document.getElementById('edit-usr-nombre').value.trim(),
        correo: document.getElementById('edit-usr-correo').value.trim().toLowerCase(),
        ...(propio ? {} : { rol: document.getElementById('edit-usr-rol').value })
    };
    const cambios = {};
    for (const [campo, nuevo] of Object.entries(nuevos)) {
        if (nuevo !== actual[campo]) cambios[campo] = nuevo;
    }
    if (Object.keys(cambios).length === 0) {
        mostrarToast('No hay cambios que guardar', 'error');
        return;
    }

    await enviando(formEditar, async () => {
        try {
            await apiFetch(`/usuarios/${enc(id)}`, { method: 'PUT', body: JSON.stringify(cambios) });
            cerrarModal('modal-editar-usuario');
            mostrarToast('Usuario actualizado');
            if (propio) await refrescarSesionPropia();
            cargarUsuarios();
        } catch (err) {
            mostrarToast(err.message, 'error');
        }
    });
});

// Si el encargado edita su propia cuenta, se actualiza lo que muestra el encabezado.
async function refrescarSesionPropia() {
    try {
        const perfil = await apiFetch('/auth/perfil');
        guardarSesion(obtenerToken(), perfil);
        document.getElementById('user-nombre').textContent = perfil.nombre;
        document.getElementById('user-correo').textContent = perfil.correo;
    } catch { /* el encabezado se actualizará en la próxima carga */ }
}

// ---------- Contraseña y baja ----------

async function resetPasswordUsuario(id) {
    const usuario = usuariosCargados.find(x => x.idUsuario === id);
    const elegida = await pedirDialogo({
        titulo: 'Restablecer contraseña',
        mensaje: `${usuario ? `Cuenta de ${usuario.nombre}. ` : ''}Escribe la contraseña nueva o déjala vacía para generar una temporal.`,
        etiqueta: 'Contraseña nueva (mínimo 8 caracteres)',
        tipo: 'password',
        maxLength: 72,
        textoAceptar: 'Restablecer',
        validar: (v) => (v && v.length < 8 ? 'Debe tener al menos 8 caracteres.' : '')
    });
    if (elegida === null) return; // canceló

    try {
        const res = await apiFetch(`/usuarios/${enc(id)}/restablecer-password`, {
            method: 'POST',
            body: JSON.stringify(elegida ? { passwordNueva: elegida } : {})
        });
        if (res.passwordTemporal) {
            mostrarPasswordTemporal(res.passwordTemporal);
        } else {
            mostrarToast('Contraseña restablecida');
        }
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// La contraseña temporal se muestra una sola vez, con botón para copiarla.
function mostrarPasswordTemporal(password) {
    document.getElementById('pass-temporal-valor').value = password;
    abrirModal('modal-password-temporal');
}

async function copiarPasswordTemporal() {
    const campo = document.getElementById('pass-temporal-valor');
    try {
        await navigator.clipboard.writeText(campo.value);
        mostrarToast('Contraseña copiada');
    } catch {
        campo.select();
        mostrarToast('No se pudo copiar solo: ya está seleccionada, copia con Ctrl+C', 'error');
    }
}

function cerrarPasswordTemporal() {
    document.getElementById('pass-temporal-valor').value = ''; // no se deja en la página
    cerrarModal('modal-password-temporal');
}

async function desactivarUsuario(id) {
    const usuario = usuariosCargados.find(x => x.idUsuario === id);
    const acepta = await confirmar({
        titulo: 'Desactivar usuario',
        mensaje: `¿Desactivar la cuenta${usuario ? ` de ${usuario.nombre}` : ''}? Ya no podrá iniciar sesión.`,
        textoAceptar: 'Desactivar',
        peligro: true
    });
    if (!acepta) return;
    try {
        await apiFetch(`/usuarios/${enc(id)}/desactivar`, { method: 'PATCH' });
        mostrarToast('Usuario desactivado');
        cargarUsuarios();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

registrarAcciones({
    'editar-usuario': (d) => abrirEdicion(d.id),
    'reset-password': (d) => resetPasswordUsuario(d.id),
    'desactivar-usuario': (d) => desactivarUsuario(d.id),
    'copiar-password-temporal': copiarPasswordTemporal,
    'cerrar-password-temporal': cerrarPasswordTemporal
});
