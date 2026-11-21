// Punto de entrada de index.html: valida la sesión, arma el menú y navega entre secciones.
import { exigirSesion, cerrarSesion, esEncargado } from './auth.js';
import { registrarAcciones } from './ui.js';
import { cargarArticulos } from './catalogo.js';
import { cargarSolicitudes, iniciarAvisoPendientes } from './solicitudes.js';
import { cargarMovimientos } from './movimientos.js';
import { cargarUsuarios } from './usuarios.js';

const SECCIONES = {
    catalogo: cargarArticulos,
    solicitudes: cargarSolicitudes,
    movimientos: cargarMovimientos,
    usuarios: cargarUsuarios
};

const NAV_BASE = 'nav-btn px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5';
const NAV_ACTIVO = `${NAV_BASE} bg-indigo-800 text-white`;
const NAV_INACTIVO = `${NAV_BASE} text-indigo-200 hover:bg-indigo-800/60`;

function navegar(seccion) {
    if (!SECCIONES[seccion] || (seccion === 'usuarios' && !esEncargado())) seccion = 'catalogo';

    Object.keys(SECCIONES).forEach(s => {
        document.getElementById(`sec-${s}`).classList.toggle('hidden', s !== seccion);
        const btn = document.getElementById(`nav-${s}`);
        if (btn) {
            const solo = btn.classList.contains('solo-encargado') ? ' solo-encargado' : '';
            const oculto = btn.classList.contains('hidden') ? ' hidden' : '';
            btn.className = (s === seccion ? NAV_ACTIVO : NAV_INACTIVO) + solo + oculto;
        }
    });
    SECCIONES[seccion]();
}

async function iniciar() {
    const usuario = await exigirSesion();
    if (!usuario) return;

    document.getElementById('user-nombre').textContent = usuario.nombre;
    document.getElementById('user-correo').textContent = usuario.correo;
    document.getElementById('badge-rol').textContent = usuario.rol;

    document.querySelectorAll('.solo-encargado').forEach(el => {
        el.classList.toggle('hidden', usuario.rol !== 'ENCARGADO');
    });

    document.getElementById('vista-app').classList.remove('hidden');
    navegar('catalogo');
    iniciarAvisoPendientes();
}

registrarAcciones({
    'navegar': (d) => navegar(d.seccion),
    'cerrar-sesion': cerrarSesion
});

// Otros módulos piden navegar sin importar este archivo (evita dependencias circulares).
window.addEventListener('app:navegar', (e) => navegar(e.detail));

iniciar();
