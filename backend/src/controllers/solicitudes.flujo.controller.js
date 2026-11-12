const flujo = require('../services/solicitudes.flujo.service');
const { asyncHandler } = require('../utils/errors');

const aprobar = asyncHandler(async (req, res) => {
    const solicitud = await flujo.aprobar(req.params.id, req.usuario, req.body.motivo);
    res.json({ mensaje: 'Solicitud aprobada', solicitud });
});

const rechazar = asyncHandler(async (req, res) => {
    const solicitud = await flujo.rechazar(req.params.id, req.usuario, req.body.motivo);
    res.json({ mensaje: 'Solicitud rechazada', solicitud });
});

const entregar = asyncHandler(async (req, res) => {
    const solicitud = await flujo.entregar(req.params.id, req.usuario);
    res.json({ mensaje: 'Entrega registrada', solicitud });
});

const devolver = asyncHandler(async (req, res) => {
    const solicitud = await flujo.devolver(req.params.id, req.usuario, req.body);
    res.json({ mensaje: 'Devolución registrada', solicitud });
});

const cancelar = asyncHandler(async (req, res) => {
    const solicitud = await flujo.cancelar(req.params.id, req.usuario, req.body.motivo);
    res.json({ mensaje: 'Solicitud cancelada', solicitud });
});

const cerrar = asyncHandler(async (req, res) => {
    const solicitud = await flujo.cerrar(req.params.id, req.usuario);
    res.json({ mensaje: 'Solicitud cerrada', solicitud });
});

module.exports = { aprobar, rechazar, cancelar, entregar, devolver, cerrar };