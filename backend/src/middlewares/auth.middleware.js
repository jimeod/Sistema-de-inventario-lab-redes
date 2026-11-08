const jwt = require('jsonwebtoken');
const { ErrorNegocio } = require('../utils/errors');

function autenticar(req, res, next) {
    const header = req.headers.authorization || '';
    const [tipo, token] = header.split(' ');
 
    if (tipo !== 'Bearer' || !token) {
        return next(new ErrorNegocio('Debes iniciar sesión', 401));
    }
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = {
            idUsuario: payload.idUsuario,
            nombre: payload.nombre,
            rol: payload.rol
        };
        next();
    } catch {
        next(new ErrorNegocio('Sesión inválida o expirada', 401));
    }
}

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
 
