
const {
    ScanCommand,
    GetCommand,
    PutCommand,
    UpdateCommand
} = require('@aws-sdk/lib-dynamodb');

const db = require('../config/aws');

const TABLE = process.env.DYNAMODB_TABLE_USUARIOS;


async function obtenerUsuarios() {
    const resultado = await db.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: 'activo = :activo',
        ExpressionAttributeValues: {
            ':activo': true
        }
    }));

    return resultado.Items || [];
}


async function obtenerUsuarioPorId(idUsuario) {
    const resultado = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { idUsuario }
    }));

    return resultado.Item || null;
}


async function crearUsuario(datos) {
    const usuario = {
        idUsuario: `USR-${require('crypto').randomUUID()}`,
        nombre: datos.nombre,
        correo: datos.correo,
        rol: datos.rol,
        activo: true,
        fechaRegistro: new Date().toISOString()
    };

    await db.send(new PutCommand({
        TableName: TABLE,
        Item: usuario,
        ConditionExpression: 'attribute_not_exists(idUsuario)'
    }));

    return usuario;
}


async function actualizarUsuario(idUsuario, datos) {
    const camposPermitidos = ['nombre', 'correo', 'rol'];

    const campos = Object.keys(datos).filter(campo =>
        camposPermitidos.includes(campo)
    );

    if (campos.length === 0) {
        throw new Error('No hay campos válidos para actualizar');
    }

    const expresiones = campos.map((campo, i) =>
        `#campo${i} = :valor${i}`
    );

    const nombres = {};
    const valores = {};

    campos.forEach((campo, i) => {
        nombres[`#campo${i}`] = campo;
        valores[`:valor${i}`] = datos[campo];
    });

    const resultado = await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { idUsuario },
        UpdateExpression: `SET ${expresiones.join(', ')}`,
        ExpressionAttributeNames: nombres,
        ExpressionAttributeValues: valores,
        ConditionExpression: 'attribute_exists(idUsuario)',
        ReturnValues: 'ALL_NEW'
    }));

    return resultado.Attributes;
}


async function desactivarUsuario(idUsuario) {
    const resultado = await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { idUsuario },
        UpdateExpression: 'SET activo = :activo',
        ExpressionAttributeValues: {
            ':activo': false
        },
        ConditionExpression: 'attribute_exists(idUsuario)',
        ReturnValues: 'ALL_NEW'
    }));

    return resultado.Attributes;
}

module.exports = {
    obtenerUsuarios,
    obtenerUsuarioPorId,
    crearUsuario,
    actualizarUsuario,
    desactivarUsuario
};
