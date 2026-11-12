const router = require('express').Router();
const controller = require('../controllers/articulos.controller');
const { upload, exigirArchivoValido } = require('../middlewares/upload.middleware');
const { autenticar, permitirRoles } = require('../middlewares/auth.middleware');

router.use(autenticar);

router.get('/', controller.listar);
router.post('/', permitirRoles('ENCARGADO'), controller.registrar);

router.get('/:id', controller.consultar);
router.put('/:id', permitirRoles('ENCARGADO'), controller.editar);
router.patch('/:id/desactivar', permitirRoles('ENCARGADO'), controller.desactivar);
router.post(
    '/:id/foto',
    permitirRoles('ENCARGADO'),
    upload.single('foto'),
    exigirArchivoValido('imagen'),
    controller.subirFoto
);

module.exports = router;
