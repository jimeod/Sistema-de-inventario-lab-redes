const router = require('express').Router();
const controller = require('../controllers/usuarios.controller');
const { autenticar, permitirRoles } = require('../middlewares/auth.middleware');

router.use(autenticar, permitirRoles('ENCARGADO'));

router.get('/', controller.listar);
router.post('/', controller.registrar);

router.get('/:id', controller.consultar);
router.put('/:id', controller.editar);
router.patch('/:id/desactivar', controller.desactivar);
router.post('/:id/restablecer-password', controller.restablecerPassword);

module.exports = router;
