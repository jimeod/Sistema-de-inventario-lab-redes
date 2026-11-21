// Cliente HTTP y almacenamiento de la sesión (token + usuario).
import { API_BASE, PAGINAS } from './config.js';

const K_TOKEN = 'token';
const K_USUARIO = 'usuario';

export const obtenerToken = () => localStorage.getItem(K_TOKEN);

export function obtenerUsuario() {
    try {
        return JSON.parse(localStorage.getItem(K_USUARIO) || 'null');
    } catch {
        return null;
    }
}

export function guardarSesion(token, usuario) {
    localStorage.setItem(K_TOKEN, token);
    localStorage.setItem(K_USUARIO, JSON.stringify(usuario));
}

export function actualizarToken(token) {
    localStorage.setItem(K_TOKEN, token);
}

export function limpiarSesion() {
    localStorage.removeItem(K_TOKEN);
    localStorage.removeItem(K_USUARIO);
}

// Rutas donde un 401 significa "datos incorrectos", no "sesión expirada".
const RUTAS_SIN_REDIRECCION = ['/auth/login', '/auth/registro', '/auth/cambiar-password'];

export async function apiFetch(ruta, opciones = {}) {
    const headers = { ...(opciones.headers || {}) };
    const token = obtenerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(opciones.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    let res;
    try {
        res = await fetch(`${API_BASE}${ruta}`, { ...opciones, headers });
    } catch {
        throw new Error('No se pudo conectar con el servidor');
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        if (res.status === 401 && !RUTAS_SIN_REDIRECCION.includes(ruta)) {
            limpiarSesion();
            location.replace(PAGINAS.login);
        }
        const err = new Error(data.mensaje || data.error || 'Error en la petición');
        err.status = res.status;
        throw err;
    }
    return data;
}
