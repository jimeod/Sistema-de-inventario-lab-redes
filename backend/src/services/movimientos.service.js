const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const db = require('../config/aws');
const { consultarTodo } = require('../utils/dynamo');
const { CAMPOS } = require('../utils/inventario');

const TABLE = process.env.DYNAMODB_TABLE_MOVIMIENTOS || 'Movimientos';

const TIPOS = [
    'ALTA', 'SOLICITUD', 'APROBACION', 'RECHAZO', 'CANCELACION', 'ENTREGA', 'DEVOLUCION'
];

const SOLO_NUEVOS = 'attribute_not_exists(idArticulo)';

let secuencia = 0;

function claveOrden(fechaIso) {
    secuencia = (secuencia + 1) % 1000000;
    return `${fechaIso}#${String(secuencia).padStart(6, '0')}-${crypto.randomUUID()}`;
}

function instantanea(c) {
    if (!c) return undefined;
    return Object.fromEntries(CAMPOS.map(k => [k, c[k]]));
}


function construirMovimiento({
    articulo, solicitud, solicitante, encargado, tipoMovimiento,
    cantidad, motivo, antes, despues, detalle
}) {
    const ahora = new Date().toISOString();
    return {
        idArticulo: articulo.idArticulo,
        fechaMovimiento: claveOrden(ahora),
        fecha: ahora,
        tipoMovimiento,
        claveArticulo: articulo.clave || null,
        nombreArticulo: articulo.nombre,
        tipoArticulo: articulo.tipo,
        idSolicitud: solicitud && solicitud.idSolicitudes,
        folio: solicitud && (solicitud.folio || solicitud.idSolicitudes),
        idSolicitante: solicitante && solicitante.idUsuario,
        nombreSolicitante: solicitante && solicitante.nombre,
        idEncargado: encargado && encargado.idUsuario,
        nombreEncargado: encargado && encargado.nombre,
        cantidad,
        motivo: motivo || '',
        antes: instantanea(antes),
        despues: instantanea(despues),
        
        saldoAntes: antes && antes.disponibles,
        saldoDespues: despues && despues.disponibles,
        detalle
    };
}

function itemTransaccion(movimiento) {
    return {
        Put: { TableName: TABLE, Item: movimiento, ConditionExpression: SOLO_NUEVOS }
    };
}

async function registrarMovimiento(datos) {
    const movimiento = construirMovimiento(datos);
    await db.send(new PutCommand({
        TableName: TABLE, Item: movimiento, ConditionExpression: SOLO_NUEVOS
    }));
    return movimiento;
}

async function obtenerPorArticulo(idArticulo) {
    return consultarTodo({
        TableName: TABLE,
        KeyConditionExpression: 'idArticulo = :id',
        ExpressionAttributeValues: { ':id': idArticulo },
        ScanIndexForward: false
    });
}

async function obtenerPorSolicitante(idSolicitante) {
    return consultarTodo({
        TableName: TABLE,
        IndexName: 'MovimientosPorSolicitante',
        KeyConditionExpression: 'idSolicitante = :id',
        ExpressionAttributeValues: { ':id': idSolicitante },
        ScanIndexForward: false
    });
}


async function obtenerPorSolicitud(idSolicitud) {
    return consultarTodo({
        TableName: TABLE,
        IndexName: 'MovimientosPorSolicitud',
        KeyConditionExpression: 'idSolicitud = :id',
        ExpressionAttributeValues: { ':id': idSolicitud },
        ScanIndexForward: true
    });
}

module.exports = {
    TABLE, TIPOS, construirMovimiento, itemTransaccion, registrarMovimiento,
    obtenerPorArticulo, obtenerPorSolicitante, obtenerPorSolicitud
};
