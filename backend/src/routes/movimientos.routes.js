const router = require('express').Router();
const controller = require('../controllers/movimientos.controller');
const { autenticar, permitirRoles, propioOEncargado } = require('../middlewares/auth.middleware');

router.use(autenticar);

router.get('/articulo/:id', permitirRoles('ENCARGADO'), controller.porArticulo);
router.get('/solicitante/:id', propioOEncargado('id'), controller.porSolicitante);
router.get('/solicitud/:id', controller.porSolicitud);

module.exports = router;