const router = require('express').Router();
const controller = require('../controllers/articulos.controller');
const upload = require('../middlewares/upload.middleware');
const { autenticar, permitirRoles } = require('../middlewares/auth.middleware');

router.use(autenticar);


router.get('/', controller.listar);
router.get('/:id', controller.consultar);

router.post('/', permitirRoles('ENCARGADO'), controller.registrar);
router.put('/:id', permitirRoles('ENCARGADO'), controller.editar);
router.patch('/:id/desactivar', permitirRoles('ENCARGADO'), controller.desactivar);
router.post('/:id/foto', permitirRoles('ENCARGADO'), upload.single('foto'), controller.subirFoto);

module.exports = router;