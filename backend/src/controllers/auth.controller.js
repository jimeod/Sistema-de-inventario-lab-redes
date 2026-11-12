const authService = require('../services/auth.service');
const { asyncHandler, ErrorNegocio } = require('../utils/errors');

const login = asyncHandler(async (req, res) => {
    const { correo, password } = req.body;
    if (typeof correo !== 'string' || typeof password !== 'string' || !correo || !password) {
        throw new ErrorNegocio('Correo y contraseña son obligatorios');
    }
    res.json(await authService.login(correo, password));
});

const perfil = (req, res) => res.json(req.usuario);

const cambiarPassword = asyncHandler(async (req, res) => {
    const { passwordActual, passwordNueva } = req.body;
    const resultado = await authService.cambiarPassword(
        req.usuario.idUsuario, passwordActual, passwordNueva
    );
    res.json({ mensaje: 'Contraseña actualizada correctamente', ...resultado });
});

module.exports = { login, perfil, cambiarPassword };
