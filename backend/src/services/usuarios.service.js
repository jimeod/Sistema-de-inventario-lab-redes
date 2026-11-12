const {
    GetCommand, UpdateCommand, PutCommand, TransactWriteCommand
} = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = require('../config/aws');
const { ErrorNegocio } = require('../utils/errors');
const { escanearTodo } = require('../utils/dynamo');
const {
    exigirTexto, normalizarCorreo, validarRol, validarPassword
} = require('../utils/validaciones');

const TABLE = process.env.DYNAMODB_TABLE_USUARIOS;


const PREFIJO_INDICE = 'CORREO#';
const TIPO_INDICE = 'INDICE_CORREO';
const SOLO_USUARIOS = 'attribute_not_exists(tipoRegistro)';

function sinPassword(usuario) {
    if (!usuario || usuario.tipoRegistro) return null;
    const { passwordHash, ...resto } = usuario;
    return resto;
}

function itemIndice(correo, idUsuario) {
    return {
        idUsuario: `${PREFIJO_INDICE}${correo}`,
        tipoRegistro: TIPO_INDICE,
        correo,
        idUsuarioReferencia: idUsuario,
        fechaRegistro: new Date().toISOString()
    };
}

async function obtenerUsuarios() {
    const items = await escanearTodo({
        TableName: TABLE,
        FilterExpression: 'activo = :activo AND attribute_not_exists(tipoRegistro)',
        ExpressionAttributeValues: { ':activo': true }
    });
    return items.map(sinPassword);
}

async function obtenerUsuarioCompleto(idUsuario) {
    if (typeof idUsuario !== 'string' || !idUsuario || idUsuario.startsWith(PREFIJO_INDICE)) {
        return null;
    }
    const r = await db.send(new GetCommand({ TableName: TABLE, Key: { idUsuario } }));
    return r.Item && !r.Item.tipoRegistro ? r.Item : null;
}

async function obtenerUsuarioPorId(idUsuario) {
    return sinPassword(await obtenerUsuarioCompleto(idUsuario));
}


async function obtenerUsuarioPorCorreo(correoCrudo) {
    if (typeof correoCrudo !== 'string') return null;
    const correo = correoCrudo.trim().toLowerCase();
    if (!correo) return null;

    const indice = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { idUsuario: `${PREFIJO_INDICE}${correo}` }
    }));
    if (indice.Item) {
        return obtenerUsuarioCompleto(indice.Item.idUsuarioReferencia);
    }

    
    const encontrados = await escanearTodo({
        TableName: TABLE,
        FilterExpression: 'correo = :correo AND attribute_not_exists(tipoRegistro)',
        ExpressionAttributeValues: { ':correo': correo }
    });
    const usuario = encontrados[0] || null;
    if (usuario) {
        try {
            await db.send(new PutCommand({
                TableName: TABLE,
                Item: itemIndice(correo, usuario.idUsuario),
                ConditionExpression: 'attribute_not_exists(idUsuario)'
            }));
        } catch (err) {
            if (err.name !== 'ConditionalCheckFailedException') throw err;
        }
    }
    return usuario;
}

async function crearUsuario(datos) {
    const nombre = exigirTexto(datos.nombre, 'nombre', { min: 2, max: 100 });
    const correo = normalizarCorreo(datos.correo);
    const rol = validarRol(datos.rol);
    validarPassword(datos.password);

    if (await obtenerUsuarioPorCorreo(correo)) {
        throw new ErrorNegocio('Ya existe un usuario con ese correo', 409);
    }

    const usuario = {
        idUsuario: `USR-${crypto.randomUUID()}`,
        nombre,
        correo,
        rol,
        passwordHash: await bcrypt.hash(datos.password, 10),
        activo: true,
        fechaRegistro: new Date().toISOString()
    };

    try {
        await db.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Put: {
                        TableName: TABLE,
                        Item: usuario,
                        ConditionExpression: 'attribute_not_exists(idUsuario)'
                    }
                },
                {
                    Put: {
                        TableName: TABLE,
                        Item: itemIndice(correo, usuario.idUsuario),
                        ConditionExpression: 'attribute_not_exists(idUsuario)'
                    }
                }
            ]
        }));
    } catch (err) {
        if (err.name === 'TransactionCanceledException') {
            throw new ErrorNegocio('Ya existe un usuario con ese correo', 409);
        }
        throw err;
    }
    return sinPassword(usuario);
}

async function actualizarUsuario(idUsuario, datos, actor) {
    const actual = await obtenerUsuarioCompleto(idUsuario);
    if (!actual) throw new ErrorNegocio('Usuario no encontrado', 404);

    const cambios = {};
    if (datos.nombre !== undefined) {
        cambios.nombre = exigirTexto(datos.nombre, 'nombre', { min: 2, max: 100 });
    }
    if (datos.rol !== undefined) {
        cambios.rol = validarRol(datos.rol);
    }
    if (datos.correo !== undefined) {
        cambios.correo = normalizarCorreo(datos.correo);
    }
    if (Object.keys(cambios).length === 0) {
        throw new ErrorNegocio('No hay campos válidos para actualizar');
    }

    const esPropio = actor && actor.idUsuario === idUsuario;
    if (esPropio && cambios.rol !== undefined && cambios.rol !== actual.rol) {
        throw new ErrorNegocio('No puedes cambiar tu propio rol', 403);
    }

    const cambiaCorreo = cambios.correo !== undefined && cambios.correo !== actual.correo;
    if (cambiaCorreo) {
        const dueno = await obtenerUsuarioPorCorreo(cambios.correo);
        if (dueno && dueno.idUsuario !== idUsuario) {
            throw new ErrorNegocio('Ya existe un usuario con ese correo', 409);
        }
    }

    const nombres = { '#actualizado': 'fechaActualizacion' };
    const valores = { ':actualizado': new Date().toISOString() };
    const sets = ['#actualizado = :actualizado'];
    Object.entries(cambios).forEach(([campo, valor], i) => {
        nombres[`#c${i}`] = campo;
        valores[`:v${i}`] = valor;
        sets.push(`#c${i} = :v${i}`);
    });

    const actualizar = {
        TableName: TABLE,
        Key: { idUsuario },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: nombres,
        ExpressionAttributeValues: valores,
        ConditionExpression: `attribute_exists(idUsuario) AND ${SOLO_USUARIOS}`
    };

    try {
        if (cambiaCorreo) {
            await db.send(new TransactWriteCommand({
                TransactItems: [
                    { Update: actualizar },
                    { Delete: { TableName: TABLE, Key: { idUsuario: `${PREFIJO_INDICE}${actual.correo}` } } },
                    {
                        Put: {
                            TableName: TABLE,
                            Item: itemIndice(cambios.correo, idUsuario),
                            ConditionExpression: 'attribute_not_exists(idUsuario)'
                        }
                    }
                ]
            }));
        } else {
            await db.send(new UpdateCommand(actualizar));
        }
    } catch (err) {
        if (err.name === 'TransactionCanceledException') {
            throw new ErrorNegocio('Ya existe un usuario con ese correo', 409);
        }
        if (err.name === 'ConditionalCheckFailedException') {
            throw new ErrorNegocio('Usuario no encontrado', 404);
        }
        throw err;
    }
    return obtenerUsuarioPorId(idUsuario);
}

async function desactivarUsuario(idUsuario, actor) {
    if (actor && actor.idUsuario === idUsuario) {
        throw new ErrorNegocio('No puedes desactivar tu propia cuenta', 403);
    }
    try {
        const r = await db.send(new UpdateCommand({
            TableName: TABLE,
            Key: { idUsuario },
            UpdateExpression: 'SET activo = :a, fechaActualizacion = :f',
            ExpressionAttributeValues: { ':a': false, ':f': new Date().toISOString() },
            ConditionExpression: `attribute_exists(idUsuario) AND ${SOLO_USUARIOS}`,
            ReturnValues: 'ALL_NEW'
        }));
        return sinPassword(r.Attributes);
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            throw new ErrorNegocio('Usuario no encontrado', 404);
        }
        throw err;
    }
}


async function guardarPassword(idUsuario, hashAnterior, passwordNueva) {
    validarPassword(passwordNueva, 'La contraseña nueva');
    const ahora = new Date().toISOString();
    const valores = { ':h': await bcrypt.hash(passwordNueva, 10), ':f': ahora };
    let condicionHash = 'attribute_not_exists(passwordHash)';
    if (hashAnterior) {
        condicionHash = 'passwordHash = :anterior';
        valores[':anterior'] = hashAnterior;
    }
    try {
        await db.send(new UpdateCommand({
            TableName: TABLE,
            Key: { idUsuario },
            UpdateExpression: 'SET passwordHash = :h, passwordActualizadaEn = :f, fechaActualizacion = :f',
            ConditionExpression: `attribute_exists(idUsuario) AND ${SOLO_USUARIOS} AND ${condicionHash}`,
            ExpressionAttributeValues: valores
        }));
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            throw new ErrorNegocio('La contraseña cambió mientras se procesaba la solicitud. Intenta de nuevo', 409);
        }
        throw err;
    }
    return ahora;
}

async function cambiarPassword(idUsuario, passwordActual, passwordNueva) {
    if (typeof passwordActual !== 'string' || !passwordActual) {
        throw new ErrorNegocio('La contraseña actual es obligatoria');
    }
    validarPassword(passwordNueva, 'La contraseña nueva');

    const usuario = await obtenerUsuarioCompleto(idUsuario);
    if (!usuario) throw new ErrorNegocio('Usuario no encontrado', 404);
    if (!usuario.passwordHash || !(await bcrypt.compare(passwordActual, usuario.passwordHash))) {
        throw new ErrorNegocio('La contraseña actual es incorrecta', 401);
    }
    if (passwordActual === passwordNueva) {
        throw new ErrorNegocio('La contraseña nueva debe ser distinta de la actual');
    }
    await guardarPassword(idUsuario, usuario.passwordHash, passwordNueva);
    return obtenerUsuarioPorId(idUsuario);
}


async function restablecerPassword(idUsuario, passwordNueva) {
    const usuario = await obtenerUsuarioCompleto(idUsuario);
    if (!usuario) throw new ErrorNegocio('Usuario no encontrado', 404);

    const generada = passwordNueva === undefined;
    const password = generada ? crypto.randomBytes(9).toString('base64url') : passwordNueva;

    await guardarPassword(idUsuario, usuario.passwordHash, password);
    return { usuario: sinPassword(await obtenerUsuarioCompleto(idUsuario)), passwordTemporal: generada ? password : undefined };
}

module.exports = {
    obtenerUsuarios, obtenerUsuarioPorId, obtenerUsuarioPorCorreo, obtenerUsuarioCompleto,
    crearUsuario, actualizarUsuario, desactivarUsuario,
    cambiarPassword, restablecerPassword
};
