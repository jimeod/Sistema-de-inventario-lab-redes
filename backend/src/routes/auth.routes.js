const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { autenticar } = require('../middlewares/auth.middleware');
 
router.post('/login', controller.login);
router.get('/perfil', autenticar, controller.perfil);
 
module.exports = router;
 