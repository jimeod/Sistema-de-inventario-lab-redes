const usuariosService = require('../services/usuarios.service');
const { asyncHandler, ErrorNegocio } = require('../utils/errors');



const listar = asyncHandler(async (req, res) => {
    const usuarios = await usuariosService.obtenerUsuarios();
    res.status(200).json(usuarios);
});

const consultar = asyncHandler(async (req, res) => {
    const usuario = await usuariosService.obtenerUsuarioPorId(req.params.id);
    if (!usuario) throw new ErrorNegocio('Usuario no encontrado', 404);
    res.status(200).json(usuario);
});

const registrar = asyncHandler(async (req, res) => {
    const { nombre, correo, rol, password } = req.body;

    if (!nombre || !correo || !rol || !password) {
        throw new ErrorNegocio('Nombre, correo, rol y contraseña son obligatorios');
    }

    const usuario = await usuariosService.crearUsuario({ nombre, correo, rol, password });
    res.status(201).json({ mensaje: 'Usuario registrado correctamente', usuario });
});

const editar = asyncHandler(async (req, res) => {
    const usuario = await usuariosService.actualizarUsuario(req.params.id, req.body);
    res.status(200).json({ mensaje: 'Usuario actualizado correctamente', usuario });
});

const desactivar = asyncHandler(async (req, res) => {
    const usuario = await usuariosService.desactivarUsuario(req.params.id);
    res.status(200).json({ mensaje: 'Usuario desactivado correctamente', usuario });
});

module.exports = { listar, consultar, registrar, editar, desactivar };