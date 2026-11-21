const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { autenticar } = require('../middlewares/auth.middleware');
const { limitarPeticiones } = require('../middlewares/limite.middleware');

// Máximo 5 registros por IP cada 15 minutos
const limiteRegistro = limitarPeticiones({
    ventanaMs: 15 * 60 * 1000,
    maximo: 5,
    mensaje: 'Demasiados intentos de registro. Intenta de nuevo más tarde'
});

router.post('/login', controller.login);
router.post('/registro', limiteRegistro, controller.registro);
router.get('/perfil', autenticar, controller.perfil);
router.post('/cambiar-password', autenticar, controller.cambiarPassword);

module.exports = router;
