require('dotenv').config();
const usuariosService = require('../services/usuarios.service');
 
(async () => {
    const [nombre, correo, password, rol = 'ENCARGADO'] = process.argv.slice(2);
    if (!nombre || !correo || !password) {
        console.error('Uso: node scripts/crear-encargado.js "Nombre" correo password [rol]');
        process.exit(1);
    }
    const u = await usuariosService.crearUsuario({ nombre, correo, password, rol });
    console.log('Usuario creado:', u);
})().catch(e => { console.error(e.message); process.exit(1); });