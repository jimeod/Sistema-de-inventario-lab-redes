const express = require('express');
const router = express.Router();

const controller = require('../controllers/articulos.controller');
const upload = require('../middlewares/upload.middleware');

router.get('/', controller.listar);
router.get('/:id', controller.consultar);
router.post('/', controller.registrar);
router.put('/:id', controller.editar);
router.patch('/:id/desactivar', controller.desactivar);

router.post(
    '/:id/foto',
    upload.single('foto'),
    controller.subirFoto
);


module.exports = router;