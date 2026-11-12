const { ErrorNegocio } = require('./errors');

const ROLES = ['SOLICITANTE', 'ENCARGADO'];
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; 

const REGEX_CORREO = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function exigirTexto(valor, campo, { min = 1, max = 120 } = {}) {
    if (typeof valor !== 'string') {
        throw new ErrorNegocio(`El campo ${campo} es obligatorio y debe ser texto`);
    }
    const limpio = valor.trim().replace(/\s+/g, ' ');
    if (limpio.length < min || limpio.length > max) {
        throw new ErrorNegocio(`El campo ${campo} debe tener entre ${min} y ${max} caracteres`);
    }
    return limpio;
}

function normalizarCorreo(valor) {
    if (typeof valor !== 'string') {
        throw new ErrorNegocio('El correo es obligatorio y debe ser texto');
    }
    const correo = valor.trim().toLowerCase();
    if (correo.length > 254 || !REGEX_CORREO.test(correo)) {
        throw new ErrorNegocio('El correo no tiene un formato válido');
    }
    return correo;
}

function validarRol(rol) {
    if (!ROLES.includes(rol)) {
        throw new ErrorNegocio('Rol no válido. Usa SOLICITANTE o ENCARGADO');
    }
    return rol;
}

function validarPassword(password, campo = 'La contraseña') {
    if (typeof password !== 'string') {
        throw new ErrorNegocio(`${campo} es obligatoria y debe ser texto`);
    }
    if (password.length < PASSWORD_MIN) {
        throw new ErrorNegocio(`${campo} debe tener al menos ${PASSWORD_MIN} caracteres`);
    }
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX) {
        throw new ErrorNegocio(`${campo} no puede exceder ${PASSWORD_MAX} bytes`);
    }
    return password;
}

module.exports = {
    ROLES, PASSWORD_MIN, PASSWORD_MAX,
    exigirTexto, normalizarCorreo, validarRol, validarPassword
};
