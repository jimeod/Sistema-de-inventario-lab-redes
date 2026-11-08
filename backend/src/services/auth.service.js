const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const usuariosService = require('./usuarios.service');
const { ErrorNegocio } = require('../utils/errors');

async function login(correo, password) {
    const usuario = await usuariosService.obtenerUsuarioPorCorreo(correo || '');

    const valido = usuario && usuario.activo && usuario.passwordHash &&
        await bcrypt.compare(password || '', usuario.passwordHash);

    if (!valido) throw new ErrorNegocio('Correo o contraseña incorrectos', 401);

    const token = jwt.sign(
        { idUsuario: usuario.idUsuario, nombre: usuario.nombre, rol: usuario.rol },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );

    return {
        token,
        usuario: {
            idUsuario: usuario.idUsuario,
            nombre: usuario.nombre,
            correo: usuario.correo,
            rol: usuario.rol
        }
    };
}

module.exports = { login };