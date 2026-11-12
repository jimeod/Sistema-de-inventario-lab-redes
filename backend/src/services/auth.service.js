const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const usuariosService = require('./usuarios.service');
const { ErrorNegocio } = require('../utils/errors');

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


async function cambiarPassword(idUsuario, passwordActual, passwordNueva) {
    const usuario = await usuariosService.cambiarPassword(idUsuario, passwordActual, passwordNueva);
    return { token: firmarToken(usuario), usuario: datosPublicos(usuario) };
}

module.exports = { login, cambiarPassword, firmarToken };
