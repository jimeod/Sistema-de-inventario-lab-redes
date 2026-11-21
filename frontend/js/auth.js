// Flujos de autenticación: login, registro, cierre de sesión y cambio de contraseña.
// Este módulo se carga en login.html, registro.html e index.html; cada formulario
// solo se activa si existe en la página actual.
import { PAGINAS } from './config.js';
import {
    apiFetch, guardarSesion, actualizarToken, limpiarSesion, obtenerToken, obtenerUsuario
} from './api.js';
import { mostrarToast, cerrarModal, enviando, guardarFlash } from './ui.js';

export const esEncargado = () => obtenerUsuario()?.rol === 'ENCARGADO';

export function cerrarSesion() {
    limpiarSesion();
    // El carrito guardado es de la sesión de quien sale: no debe quedar para el siguiente.
    Object.keys(sessionStorage)
        .filter(k => k.startsWith('carrito:'))
        .forEach(k => sessionStorage.removeItem(k));
    location.replace(PAGINAS.login);
}

// Para index.html: valida el token con el backend y devuelve el usuario vigente.
// Si no hay sesión (o expiró), redirige a login.html y devuelve null.
export async function exigirSesion() {
    if (!obtenerToken() || !obtenerUsuario()) {
        location.replace(PAGINAS.login);
        return null;
    }
    try {
        const perfil = await apiFetch('/auth/perfil');
        guardarSesion(obtenerToken(), perfil);
        return perfil;
    } catch (err) {
        if (err.status === 401) return null; // apiFetch ya redirigió
        mostrarToast(err.message, 'error');
        return obtenerUsuario(); // sin conexión: se usa el usuario guardado
    }
}

// Para login.html y registro.html: si ya hay sesión, entra directo a la app.
function redirigirSiHaySesion() {
    if (obtenerToken() && obtenerUsuario()) location.replace(PAGINAS.app);
}

function entrar(data) {
    guardarSesion(data.token, data.usuario);
    guardarFlash(`Bienvenido, ${data.usuario.nombre}`);
    location.replace(PAGINAS.app);
}

const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');
if (formLogin || formRegistro) redirigirSiHaySesion();

formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = document.getElementById('login-correo').value;
    const password = document.getElementById('login-password').value;

    await enviando(formLogin, async () => {
        try {
            const data = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ correo, password })
            });
            entrar(data);
        } catch (err) {
            mostrarToast(err.message, 'error');
        }
    });
});

// Muestra u oculta el campo del código según la casilla "Soy encargado".
const chkEncargado = document.getElementById('reg-es-encargado');
chkEncargado?.addEventListener('change', () => {
    const input = document.getElementById('reg-codigo');
    document.getElementById('reg-codigo-contenedor').classList.toggle('hidden', !chkEncargado.checked);
    input.required = chkEncargado.checked;
    if (!chkEncargado.checked) input.value = '';
});

// Contrato del backend:  POST /api/auth/registro
//   { nombre, correo, password, codigoEncargado? }
// El rol lo decide el servidor: sin código válido la cuenta es SOLICITANTE.
// Responde igual que el login ({ token, usuario }).
formRegistro?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('reg-nombre').value;
    const correo = document.getElementById('reg-correo').value;
    const password = document.getElementById('reg-password').value;
    const confirmar = document.getElementById('reg-confirmar').value;

    if (password !== confirmar) {
        mostrarToast('Las contraseñas no coinciden', 'error');
        return;
    }

    const codigoEncargado = chkEncargado?.checked
        ? document.getElementById('reg-codigo').value.trim()
        : '';
    if (chkEncargado?.checked && !codigoEncargado) {
        mostrarToast('Ingresa el código de encargado', 'error');
        return;
    }

    await enviando(formRegistro, async () => {
        try {
            const data = await apiFetch('/auth/registro', {
                method: 'POST',
                body: JSON.stringify({
                    nombre, correo, password,
                    ...(codigoEncargado ? { codigoEncargado } : {})
                })
            });
            if (data.token && data.usuario) {
                entrar(data);
            } else {
                guardarFlash('Cuenta creada. Ya puedes iniciar sesión.');
                location.replace(PAGINAS.login);
            }
        } catch (err) {
            mostrarToast(err.message, 'error');
        }
    });
});

const formPassword = document.getElementById('form-cambiar-password');
formPassword?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await enviando(formPassword, async () => {
        try {
            const data = await apiFetch('/auth/cambiar-password', {
                method: 'POST',
                body: JSON.stringify({
                    passwordActual: document.getElementById('pass-actual').value,
                    passwordNueva: document.getElementById('pass-nueva').value
                })
            });
            actualizarToken(data.token);
            cerrarModal('modal-password');
            formPassword.reset();
            mostrarToast('Contraseña actualizada');
        } catch (err) {
            mostrarToast(err.message, 'error');
        }
    });
});
