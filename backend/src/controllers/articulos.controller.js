const articulosService = require('../services/articulos.service');

async function listar(req, res) {
    try {
        const articulos = await articulosService.obtenerArticulos();
        res.json(articulos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al consultar artículos' });
    }
}

async function consultar(req, res) {
    try {
        const articulo = await articulosService.obtenerArticuloPorId(
            req.params.id
        );

        if (!articulo) {
            return res.status(404).json({ mensaje: 'Artículo no encontrado' });
        }

        res.json(articulo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al consultar el artículo' });
    }
}

async function registrar(req, res) {
    try {
        const { nombre, categoria, ubicacion, tipo, existencias } = req.body;

        if (!nombre || !categoria || !ubicacion ||
            !['PRESTABLE', 'CONSUMIBLE'].includes(tipo) ||
            !Number.isInteger(existencias) || existencias < 0) {
            return res.status(400).json({
                mensaje: 'Verifica los datos del artículo'
            });
        }

        const articulo = await articulosService.crearArticulo(req.body);

        res.status(201).json({
            mensaje: 'Artículo registrado correctamente',
            articulo
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al registrar el artículo' });
    }
}

async function editar(req, res) {
    try {
        const articulo = await articulosService.actualizarArticulo(
            req.params.id,
            req.body
        );

        res.json({
            mensaje: 'Artículo actualizado correctamente',
            articulo
        });
    } catch (error) {
        console.error(error);
        const noExiste = error.name === 'ConditionalCheckFailedException';
        res.status(noExiste ? 404 : 400).json({
            mensaje: noExiste ? 'Artículo no encontrado' : error.message
        });
    }
}

async function desactivar(req, res) {
    try {
        const articulo = await articulosService.desactivarArticulo(
            req.params.id
        );

        res.json({
            mensaje: 'Artículo desactivado correctamente',
            articulo
        });
    } catch (error) {
        console.error(error);
        const noExiste = error.name === 'ConditionalCheckFailedException';
        res.status(noExiste ? 404 : 500).json({
            mensaje: noExiste ? 'Artículo no encontrado' : 'Error al desactivar'
        });
    }
}

module.exports = { listar, consultar, registrar, editar, desactivar };
