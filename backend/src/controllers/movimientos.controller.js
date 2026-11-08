const movimientosService = require('../services/movimientos.service');
const { asyncHandler } = require('../utils/errors');

const porArticulo = asyncHandler(async (req, res) => {
    res.json(await movimientosService.obtenerPorArticulo(req.params.id));
});

const porSolicitante = asyncHandler(async (req, res) => {
    res.json(await movimientosService.obtenerPorSolicitante(req.params.id));
});

module.exports = { porArticulo, porSolicitante };