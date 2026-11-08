const solicitudesService = require('../services/solicitudes.service');


async function consultar(req, res) {
    try {
        const { id } = req.params;

        const solicitud = await solicitudesService.obtenerSolicitudPorId(id);

        if (!solicitud) {
            return res.status(404).json({
                mensaje: 'Solicitud no encontrada'
            });
        }

        return res.status(200).json(solicitud);

    } catch (error) {
        console.error('Error al consultar solicitud:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar solicitud'
        });
    }
}



async function listarPorUsuario(req, res) {
    try {
        const { idUsuario } = req.params;

        const solicitudes = await solicitudesService.obtenerSolicitudesPorUsuario(
            idUsuario
        );

        return res.status(200).json(solicitudes);

    } catch (error) {
        console.error('Error al consultar solicitudes del usuario:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar solicitudes del usuario'
        });
    }
}



async function listarPorEstado(req, res) {
    try {
        const { estado } = req.params;

        const estadosPermitidos = [
            'PENDIENTE',
            'APROBADA',
            'RECHAZADA',
            'ENTREGADA',
            'DEVUELTA'
        ];

        if (!estadosPermitidos.includes(estado)) {
            return res.status(400).json({
                mensaje: 'Estado de solicitud no válido'
            });
        }

        const solicitudes = await solicitudesService.obtenerSolicitudesPorEstado(
            estado
        );

        return res.status(200).json(solicitudes);

    } catch (error) {
        console.error('Error al consultar solicitudes por estado:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar solicitudes por estado'
        });
    }
}



async function registrar(req, res) {
    try {
        const { idSolicitante, articulos, observaciones } = req.body;

        if (!idSolicitante || !articulos) {
            return res.status(400).json({
                mensaje: 'El solicitante y los artículos son obligatorios'
            });
        }

        const solicitud = await solicitudesService.crearSolicitud({
            idSolicitante,
            articulos,
            observaciones
        });

        return res.status(201).json({
            mensaje: 'Solicitud registrada correctamente',
            solicitud
        });

    } catch (error) {
        console.error('Error al registrar solicitud:', error);

        if (
            error.message.includes('no existe') ||
            error.message.includes('inactivo')
        ) {
            return res.status(404).json({
                mensaje: error.message
            });
        }

        if (
            error.message.includes('insuficientes') ||
            error.message.includes('obligatorios') ||
            error.message.includes('duplicados') ||
            error.message.includes('positiva') ||
            error.message.includes('al menos')
        ) {
            return res.status(400).json({
                mensaje: error.message
            });
        }

        return res.status(500).json({
            mensaje: 'Error al registrar solicitud'
        });
    }
}


module.exports = {
    consultar,
    listarPorUsuario,
    listarPorEstado,
    registrar
};