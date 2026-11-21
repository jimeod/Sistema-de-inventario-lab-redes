const authService = require('../services/auth.service');
const { asyncHandler, ErrorNegocio } = require('../utils/errors');

const login = asyncHandler(async (req, res) => {
    const { correo, password } = req.body;
    if (typeof correo !== 'string' || typeof password !== 'string' || !correo || !password) {
        throw new ErrorNegocio('Correo y contraseña son obligatorios');
    }
    res.json(await authService.login(correo, password));
});

const registro = asyncHandler(async (req, res) => {
    // Cualquier "rol" enviado por el cliente se ignora: el rol lo decide el servidor.
    const { nombre, correo, password } = req.body;
    const codigoEncargado = typeof req.body.codigoEncargado === 'string'
        ? req.body.codigoEncargado.trim()
        : undefined;

    if (typeof nombre !== 'string' || typeof correo !== 'string' || typeof password !== 'string' ||
        !nombre.trim() || !correo.trim() || !password) {
        throw new ErrorNegocio('Nombre, correo y contraseña son obligatorios');
    }

    const resultado = await authService.registrar({ nombre, correo, password, codigoEncargado });
    res.status(201).json({ mensaje: 'Cuenta creada correctamente', ...resultado });
});

const perfil = (req, res) => res.json(req.usuario);

const cambiarPassword = asyncHandler(async (req, res) => {
    const { passwordActual, passwordNueva } = req.body;
    const resultado = await authService.cambiarPassword(
        req.usuario.idUsuario, passwordActual, passwordNueva
    );
    res.json({ mensaje: 'Contraseña actualizada correctamente', ...resultado });
});

module.exports = { login, registro, perfil, cambiarPassword };
