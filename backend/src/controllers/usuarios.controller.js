const usuariosService = require('../services/usuarios.service');


async function listar(req, res) {
    try {
        const usuarios = await usuariosService.obtenerUsuarios();

        return res.status(200).json(usuarios);

    } catch (error) {
        console.error('Error al listar usuarios:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar usuarios'
        });
    }
}


async function consultar(req, res) {
    try {
        const { id } = req.params;

        const usuario = await usuariosService.obtenerUsuarioPorId(id);

        if (!usuario) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        return res.status(200).json(usuario);

    } catch (error) {
        console.error('Error al consultar usuario:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar usuario'
        });
    }
}


async function registrar(req, res) {
    try {
        const { nombre, correo, rol } = req.body;

        if (!nombre || !correo || !rol) {
            return res.status(400).json({
                mensaje: 'Nombre, correo y rol son obligatorios'
            });
        }

        const usuario = await usuariosService.crearUsuario({
            nombre,
            correo,
            rol
        });

        return res.status(201).json({
            mensaje: 'Usuario registrado correctamente',
            usuario
        });

    } catch (error) {
        console.error('Error al registrar usuario:', error);

        return res.status(500).json({
            mensaje: 'Error al registrar usuario'
        });
    }
}


async function editar(req, res) {
    try {
        const { id } = req.params;

        const usuario = await usuariosService.actualizarUsuario(
            id,
            req.body
        );

        return res.status(200).json({
            mensaje: 'Usuario actualizado correctamente',
            usuario
        });

    } catch (error) {
        console.error('Error al actualizar usuario:', error);

        if (error.name === 'ConditionalCheckFailedException') {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        return res.status(500).json({
            mensaje: 'Error al actualizar usuario'
        });
    }
}


async function desactivar(req, res) {
    try {
        const { id } = req.params;

        const usuario = await usuariosService.desactivarUsuario(id);

        return res.status(200).json({
            mensaje: 'Usuario desactivado correctamente',
            usuario
        });

    } catch (error) {
        console.error('Error al desactivar usuario:', error);

        if (error.name === 'ConditionalCheckFailedException') {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        return res.status(500).json({
            mensaje: 'Error al desactivar usuario'
        });
    }
}

module.exports = {
    listar,
    consultar,
    registrar,
    editar,
    desactivar
};