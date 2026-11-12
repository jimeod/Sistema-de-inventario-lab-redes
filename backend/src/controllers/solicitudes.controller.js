const solicitudesService = require('../services/solicitudes.service');
const { asyncHandler, ErrorNegocio } = require('../utils/errors');

const consultar = asyncHandler(async (req, res) => {
    const solicitud = await solicitudesService.obtenerSolicitudPorId(req.params.id);
    if (!solicitud) throw new ErrorNegocio('Solicitud no encontrada', 404);

    
    if (req.usuario.rol !== 'ENCARGADO' && solicitud.idSolicitante !== req.usuario.idUsuario) {
        throw new ErrorNegocio('No tienes permisos para ver esta solicitud', 403);
    }
    res.status(200).json(solicitud);
});

const listarPorUsuario = asyncHandler(async (req, res) => {
    const solicitudes = await solicitudesService.obtenerSolicitudesPorUsuario(req.params.idUsuario);
    res.status(200).json(solicitudes);
});

const listarPorEstado = asyncHandler(async (req, res) => {
    const { estado } = req.params;
    if (!solicitudesService.ESTADOS.includes(estado)) {
        throw new ErrorNegocio('Estado de solicitud no válido');
    }
    const solicitudes = await solicitudesService.obtenerSolicitudesPorEstado(estado);
    res.status(200).json(solicitudes);
});

const registrar = asyncHandler(async (req, res) => {
    const { articulos, observaciones, practica } = req.body;

    if (!practica || !articulos) {
        throw new ErrorNegocio('La práctica y los artículos son obligatorios');
    }

    
    const idSolicitante =
        req.usuario.rol === 'ENCARGADO' && req.body.idSolicitante
            ? req.body.idSolicitante
            : req.usuario.idUsuario;

    const solicitud = await solicitudesService.crearSolicitud({
        idSolicitante, articulos, observaciones, practica
    });

    res.status(201).json({ mensaje: 'Solicitud registrada correctamente', solicitud });
});

module.exports = { consultar, listarPorUsuario, listarPorEstado, registrar };
