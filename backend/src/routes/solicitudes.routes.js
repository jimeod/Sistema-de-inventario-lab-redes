const router = require('express').Router();
const controller = require('../controllers/solicitudes.controller');
const flujo = require('../controllers/solicitudes.flujo.controller');
const { autenticar, permitirRoles, propioOEncargado } = require('../middlewares/auth.middleware');

router.use(autenticar);


router.post('/', controller.registrar);
router.get('/usuario/:idUsuario', propioOEncargado('idUsuario'), controller.listarPorUsuario);
router.get('/:id', controller.consultar); 


router.get('/estado/:estado', permitirRoles('ENCARGADO'), controller.listarPorEstado);
router.patch('/:id/aprobar', permitirRoles('ENCARGADO'), flujo.aprobar);
router.patch('/:id/rechazar', permitirRoles('ENCARGADO'), flujo.rechazar);
router.patch('/:id/entregar', permitirRoles('ENCARGADO'), flujo.entregar);
router.patch('/:id/devolver', permitirRoles('ENCARGADO'), flujo.devolver);

module.exports = router;