const articulosService = require('../services/articulos.service');
const s3Service = require('../services/s3.service');
const logger = require('../utils/logger');
const { asyncHandler, ErrorNegocio } = require('../utils/errors');


async function conFotoUrl(articulo) {
    if (!articulo.fotoKey) return articulo;
    try {
        return { ...articulo, fotoUrl: await s3Service.obtenerUrlArchivo(articulo.fotoKey) };
    } catch (err) {
        logger.aviso('No se pudo firmar la URL de la foto', {
            idArticulo: articulo.idArticulo, detalle: err.message
        });
        return { ...articulo, fotoUrl: null };
    }
}

const listar = asyncHandler(async (req, res) => {
    const articulos = await articulosService.obtenerArticulos();
    res.json(await Promise.all(articulos.map(conFotoUrl)));
});

const consultar = asyncHandler(async (req, res) => {
    const articulo = await articulosService.obtenerArticuloPorId(req.params.id);
    if (!articulo) throw new ErrorNegocio('Artículo no encontrado', 404);

    res.status(200).json(await conFotoUrl(articulo));
});

const registrar = asyncHandler(async (req, res) => {
    const articulo = await articulosService.crearArticulo(req.body, req.usuario);
    res.status(201).json({ mensaje: 'Artículo registrado correctamente', articulo });
});

const editar = asyncHandler(async (req, res) => {
    const articulo = await articulosService.actualizarArticulo(req.params.id, req.body);
    res.json({ mensaje: 'Artículo actualizado correctamente', articulo });
});

const desactivar = asyncHandler(async (req, res) => {
    const articulo = await articulosService.desactivarArticulo(req.params.id);
    res.json({ mensaje: 'Artículo desactivado correctamente', articulo });
});


const subirFoto = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existente = await articulosService.obtenerArticuloPorId(id);
    if (!existente) throw new ErrorNegocio('Artículo no encontrado', 404);

    const fotoKey = await s3Service.subirArchivo(req.file, 'articulos');

    let resultado;
    try {
        resultado = await articulosService.actualizarFotoArticulo(id, fotoKey);
    } catch (err) {
        
        await s3Service.eliminarArchivo(fotoKey).catch(e =>
            logger.aviso('No se pudo limpiar la foto subida', { fotoKey, detalle: e.message }));
        throw err;
    }

   
    if (resultado.fotoAnterior && resultado.fotoAnterior !== fotoKey) {
        await s3Service.eliminarArchivo(resultado.fotoAnterior).catch(e =>
            logger.aviso('No se pudo eliminar la foto anterior', {
                fotoKey: resultado.fotoAnterior, detalle: e.message
            }));
    }

    const fotoUrl = await s3Service.obtenerUrlArchivo(fotoKey);
    res.status(200).json({
        mensaje: 'Fotografía subida correctamente',
        articulo: resultado.articulo,
        fotoUrl
    });
});

const reabastecer = asyncHandler(async (req, res) => {
    const articulo = await articulosService.reabastecerArticulo(req.params.id, req.body, req.usuario);
    res.json({ mensaje: 'Existencias actualizadas correctamente', articulo });
});

const darDeBaja = asyncHandler(async (req, res) => {
    const articulo = await articulosService.darDeBajaArticulo(req.params.id, req.body, req.usuario);
    res.json({ mensaje: 'Unidades dadas de baja correctamente', articulo });
});

module.exports = {
    listar, consultar, registrar, editar, desactivar, subirFoto, reabastecer, darDeBaja
};
