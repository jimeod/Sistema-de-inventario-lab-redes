const express = require('express');
const router = express.Router();

const controller = require('../controllers/solicitudes.controller');


router.post('/', controller.registrar);


router.get('/estado/:estado', controller.listarPorEstado);


router.get('/usuario/:idUsuario', controller.listarPorUsuario);


router.get('/:id', controller.consultar);

module.exports = router;