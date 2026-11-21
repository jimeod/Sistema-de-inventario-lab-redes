const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const usuariosService = require('./usuarios.service');
const { ErrorNegocio } = require('../utils/errors');
const { normalizarCorreo } = require('../utils/validaciones');

function firmarToken(usuario) {
    return jwt.sign(
        {
            idUsuario: usuario.idUsuario,
            nombre: usuario.nombre,
            rol: usuario.rol,
            
            pv: usuario.passwordActualizadaEn || null
        },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '8h' }
    );
}

function datosPublicos(usuario) {
    return {
        idUsuario: usuario.idUsuario,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol
    };
}

async function login(correo, password) {
    const usuario = await usuariosService.obtenerUsuarioPorCorreo(correo);

    const valido = usuario && usuario.activo && usuario.passwordHash &&
        await bcrypt.compare(password, usuario.passwordHash);

    if (!valido) throw new ErrorNegocio('Correo o contraseña incorrectos', 401);

    return { token: firmarToken(usuario), usuario: datosPublicos(usuario) };
}


// Dominios de correo permitidos para el registro público, separados por coma.
// Ej. REGISTRO_DOMINIOS_PERMITIDOS=uaq.mx,alumnos.uaq.mx  (vacío = cualquier dominio)
function dominiosPermitidos() {
    return (process.env.REGISTRO_DOMINIOS_PERMITIDOS || '')
        .split(',')
        .map(d => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean);
}

// Un encargado solo puede registrarse con el código secreto definido en CODIGO_ENCARGADO.
// Si la variable no existe, el registro de encargados queda deshabilitado.
function exigirCodigoEncargado(codigo) {
    const esperado = process.env.CODIGO_ENCARGADO;
    if (!esperado) {
        throw new ErrorNegocio('El registro de encargados no está habilitado', 403);
    }
    // Se comparan hashes de igual longitud para que la comparación sea de tiempo constante.
    const hash = valor => crypto.createHash('sha256').update(String(valor)).digest();
    if (!crypto.timingSafeEqual(hash(codigo), hash(esperado))) {
        throw new ErrorNegocio('Código de encargado incorrecto', 403);
    }
}

// Registro público. El rol NUNCA viene del cliente: es SOLICITANTE, salvo que
// se presente el código de encargado correcto.
async function registrar({ nombre, correo, password, codigoEncargado }) {
    const correoNormalizado = normalizarCorreo(correo);

    const permitidos = dominiosPermitidos();
    if (permitidos.length > 0) {
        const dominio = correoNormalizado.split('@')[1];
        if (!permitidos.includes(dominio)) {
            throw new ErrorNegocio(
                `Solo se permiten correos institucionales (${permitidos.map(d => '@' + d).join(', ')})`,
                403
            );
        }
    }

    let rol = 'SOLICITANTE';
    if (codigoEncargado) {
        exigirCodigoEncargado(codigoEncargado);
        rol = 'ENCARGADO';
    }

    const usuario = await usuariosService.crearUsuario({
        nombre,
        correo: correoNormalizado,
        password,
        rol
    });

    return { token: firmarToken(usuario), usuario: datosPublicos(usuario) };
}

async function cambiarPassword(idUsuario, passwordActual, passwordNueva) {
    const usuario = await usuariosService.cambiarPassword(idUsuario, passwordActual, passwordNueva);
    return { token: firmarToken(usuario), usuario: datosPublicos(usuario) };
}

module.exports = { login, registrar, cambiarPassword, firmarToken };
