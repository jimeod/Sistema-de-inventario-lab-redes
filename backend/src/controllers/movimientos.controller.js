const movimientosService = require('../services/movimientos.service');
const solicitudesService = require('../services/solicitudes.service');
const { asyncHandler, ErrorNegocio } = require('../utils/errors');

const porArticulo = asyncHandler(async (req, res) => {
    res.json(await movimientosService.obtenerPorArticulo(req.params.id));
});

const porSolicitante = asyncHandler(async (req, res) => {
    res.json(await movimientosService.obtenerPorSolicitante(req.params.id));
});


const porSolicitud = asyncHandler(async (req, res) => {
    const solicitud = await solicitudesService.obtenerSolicitudPorId(req.params.id);
    if (!solicitud) throw new ErrorNegocio('Solicitud no encontrada', 404);

    if (req.usuario.rol !== 'ENCARGADO' && solicitud.idSolicitante !== req.usuario.idUsuario) {
        throw new ErrorNegocio('No tienes permisos para ver el historial de esta solicitud', 403);
    }
    res.json(await movimientosService.obtenerPorSolicitud(solicitud.idSolicitudes));
});

module.exports = { porArticulo, porSolicitante, porSolicitud };