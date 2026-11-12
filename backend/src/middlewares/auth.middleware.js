const jwt = require('jsonwebtoken');
const { ErrorNegocio, asyncHandler } = require('../utils/errors');
const usuariosService = require('../services/usuarios.service');


const autenticar = asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization || '';
    const [tipo, token] = header.split(' ');

    if (tipo !== 'Bearer' || !token) {
        throw new ErrorNegocio('Debes iniciar sesión', 401);
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        throw new ErrorNegocio('Sesión inválida o expirada', 401);
    }

    const usuario = await usuariosService.obtenerUsuarioPorId(payload.idUsuario);
    if (!usuario || !usuario.activo) {
        throw new ErrorNegocio('Sesión inválida o expirada', 401);
    }

    // Tokens emitidos antes de un cambio de contraseña dejan de valer
    if ((payload.pv || null) !== (usuario.passwordActualizadaEn || null)) {
        throw new ErrorNegocio('Sesión inválida o expirada', 401);
    }

    req.usuario = {
        idUsuario: usuario.idUsuario,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol
    };
    next();
});

function permitirRoles(...roles) {
    return (req, res, next) => {
        if (!req.usuario || !roles.includes(req.usuario.rol)) {
            return next(new ErrorNegocio('No tienes permisos para esta operación', 403));
        }
        next();
    };
}

function propioOEncargado(paramName = 'idUsuario') {
    return (req, res, next) => {
        if (req.usuario.rol === 'ENCARGADO' || req.usuario.idUsuario === req.params[paramName]) {
            return next();
        }
        next(new ErrorNegocio('No tienes permisos para consultar esta información', 403));
    };
}

module.exports = { autenticar, permitirRoles, propioOEncargado };
