const {
    ScanCommand, GetCommand, PutCommand, UpdateCommand
} = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = require('../config/aws');
const { ErrorNegocio } = require('../utils/errors');

const TABLE = process.env.DYNAMODB_TABLE_USUARIOS;
const ROLES = ['SOLICITANTE', 'ENCARGADO'];

function sinPassword(usuario) {
    if (!usuario) return null;
    const { passwordHash, ...resto } = usuario;
    return resto;
}

async function obtenerUsuarios() {
    const r = await db.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: 'activo = :activo',
        ExpressionAttributeValues: { ':activo': true }
    }));
    return (r.Items || []).map(sinPassword);
}

async function obtenerUsuarioPorId(idUsuario) {
    const r = await db.send(new GetCommand({ TableName: TABLE, Key: { idUsuario } }));
    return sinPassword(r.Item);
}

// Incluye passwordHash: solo para login
async function obtenerUsuarioPorCorreo(correo) {
    const r = await db.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: 'correo = :correo',
        ExpressionAttributeValues: { ':correo': correo.toLowerCase().trim() }
    }));
    return (r.Items || [])[0] || null;
}

async function crearUsuario(datos) {
    if (!ROLES.includes(datos.rol)) {
        throw new ErrorNegocio('Rol no válido. Usa SOLICITANTE o ENCARGADO');
    }
    if (!datos.password || datos.password.length < 6) {
        throw new ErrorNegocio('La contraseña debe tener al menos 6 caracteres');
    }
    const correo = datos.correo.toLowerCase().trim();
    if (await obtenerUsuarioPorCorreo(correo)) {
        throw new ErrorNegocio('Ya existe un usuario con ese correo', 409);
    }

    const usuario = {
        idUsuario: `USR-${crypto.randomUUID()}`,
        nombre: datos.nombre,
        correo,
        rol: datos.rol,
        passwordHash: await bcrypt.hash(datos.password, 10),
        activo: true,
        fechaRegistro: new Date().toISOString()
    };

    await db.send(new PutCommand({
        TableName: TABLE,
        Item: usuario,
        ConditionExpression: 'attribute_not_exists(idUsuario)'
    }));
    return sinPassword(usuario);
}

async function actualizarUsuario(idUsuario, datos) {
    if (datos.rol && !ROLES.includes(datos.rol)) {
        throw new ErrorNegocio('Rol no válido. Usa SOLICITANTE o ENCARGADO');
    }
    const permitidos = ['nombre', 'correo', 'rol'];
    const campos = Object.keys(datos).filter(c => permitidos.includes(c));
    if (campos.length === 0) throw new ErrorNegocio('No hay campos válidos para actualizar');

    const nombres = {}, valores = {};
    campos.forEach((c, i) => { nombres[`#c${i}`] = c; valores[`:v${i}`] = datos[c]; });

    const r = await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { idUsuario },
        UpdateExpression: `SET ${campos.map((_, i) => `#c${i} = :v${i}`).join(', ')}`,
        ExpressionAttributeNames: nombres,
        ExpressionAttributeValues: valores,
        ConditionExpression: 'attribute_exists(idUsuario)',
        ReturnValues: 'ALL_NEW'
    }));
    return sinPassword(r.Attributes);
}

async function desactivarUsuario(idUsuario) {
    const r = await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { idUsuario },
        UpdateExpression: 'SET activo = :a',
        ExpressionAttributeValues: { ':a': false },
        ConditionExpression: 'attribute_exists(idUsuario)',
        ReturnValues: 'ALL_NEW'
    }));
    return sinPassword(r.Attributes);
}

module.exports = {
    obtenerUsuarios, obtenerUsuarioPorId, obtenerUsuarioPorCorreo,
    crearUsuario, actualizarUsuario, desactivarUsuario
};