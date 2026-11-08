const express = require('express');
const router = express.Router();

const controller = require('../controllers/articulos.controller');

router.get('/', controller.listar);
router.get('/:id', controller.consultar);
router.post('/', controller.registrar);
router.put('/:id', controller.editar);
router.patch('/:id/desactivar', controller.desactivar);

module.exports = router;