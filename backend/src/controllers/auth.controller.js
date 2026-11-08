const authService = require('../services/auth.service');
const { asyncHandler, ErrorNegocio } = require('../utils/errors');

const login = asyncHandler(async (req, res) => {
    const { correo, password } = req.body;
    if (!correo || !password) {
        throw new ErrorNegocio('Correo y contraseña son obligatorios');
    }
    res.json(await authService.login(correo, password));
});

const perfil = (req, res) => res.json(req.usuario);

module.exports = { login, perfil };