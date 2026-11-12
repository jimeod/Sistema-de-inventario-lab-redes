require('dotenv').config();

const usuariosService = require('../src/services/usuarios.service');

async function main() {
    const id = 'USR-8b936a84-9048-494b-a07b-4952ad4100bf';

    const resultado = await usuariosService.restablecerPassword(id);

    console.log('Contraseña temporal:', resultado.passwordTemporal);
    console.log('Usuario:', resultado.usuario.correo);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
