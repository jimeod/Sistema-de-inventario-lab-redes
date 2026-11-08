const {
    ScanCommand,
    GetCommand,
    PutCommand,
    UpdateCommand
} = require('@aws-sdk/lib-dynamodb');


const db = require('../config/aws');

const TABLE = process.env.DYNAMODB_TABLE_ARTICULOS;

async function obtenerArticulos() {
    const resultado = await db.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: 'activo = :activo',
        ExpressionAttributeValues: {
            ':activo': true
        }
    }));

    return resultado.Items || [];
}

async function obtenerArticuloPorId(idArticulo) {
    const resultado = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { idArticulo }
    }));

    return resultado.Item || null;
}

async function crearArticulo(datos) {
    const articulo = {
        idArticulo: `ART-${require('crypto').randomUUID()}`,
        nombre: datos.nombre,
        categoria: datos.categoria,
        ubicacion: datos.ubicacion,
        tipo: datos.tipo,
        existencias: Number(datos.existencias),
        disponibles: Number(datos.existencias),
        prestados: 0,
        condicion: datos.condicion || 'BUENO',
        fotoKey: null,
        activo: true
    };

    await db.send(new PutCommand({
        TableName: TABLE,
        Item: articulo,
        ConditionExpression: 'attribute_not_exists(idArticulo)'
    }));

    return articulo;
}

async function actualizarArticulo(idArticulo, datos) {
    const camposPermitidos = [
        'nombre',
        'categoria',
        'ubicacion',
        'condicion'
    ];

    const campos = Object.keys(datos).filter(
        campo => camposPermitidos.includes(campo)
    );

    if (campos.length === 0) {
        throw new Error('No hay campos válidos para actualizar');
    }

    const expresiones = campos.map(
        (campo, i) => `#campo${i} = :valor${i}`
    );

    const nombres = {};
    const valores = {};

    campos.forEach((campo, i) => {
        nombres[`#campo${i}`] = campo;
        valores[`:valor${i}`] = datos[campo];
    });

    const resultado = await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { idArticulo },
        UpdateExpression: `SET ${expresiones.join(', ')}`,
        ExpressionAttributeNames: nombres,
        ExpressionAttributeValues: valores,
        ConditionExpression: 'attribute_exists(idArticulo)',
        ReturnValues: 'ALL_NEW'
    }));

    return resultado.Attributes;
}

async function desactivarArticulo(idArticulo) {
    const resultado = await db.send(new UpdateCommand({
        TableName: TABLE,
        Key: { idArticulo },
        UpdateExpression: 'SET activo = :activo',
        ExpressionAttributeValues: {
            ':activo': false
        },
        ConditionExpression: 'attribute_exists(idArticulo)',
        ReturnValues: 'ALL_NEW'
    }));

    return resultado.Attributes;
}

module.exports = {
    obtenerArticulos,
    obtenerArticuloPorId,
    crearArticulo,
    actualizarArticulo,
    desactivarArticulo
};