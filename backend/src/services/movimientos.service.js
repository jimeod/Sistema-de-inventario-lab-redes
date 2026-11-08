
const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const db = require('../config/aws');
 
const TABLE = process.env.DYNAMODB_TABLE_MOVIMIENTOS || 'Movimientos';

function construirMovimiento({
    idArticulo, idSolicitud, idSolicitante, idEncargado, tipoMovimiento,
    cantidad, motivo, saldoAntes, saldoDespues, detalle
}) {
    const ahora = new Date().toISOString();
    return {
        idArticulo,
        fechaMovimiento: `${ahora}#${crypto.randomUUID()}`,
        fecha: ahora,
        tipoMovimiento, // SOLICITUD | APROBACION | RECHAZO | ENTREGA | DEVOLUCION | AJUSTE
        idSolicitud,
        idSolicitante,
        idEncargado,
        cantidad,
        motivo,
        saldoAntes,
        saldoDespues,
        detalle
    };
}
 
function itemTransaccion(movimiento) {
    return { Put: { TableName: TABLE, Item: movimiento } };
}
 

async function registrarMovimiento(datos) {
    const movimiento = construirMovimiento(datos);
    await db.send(new PutCommand({ TableName: TABLE, Item: movimiento }));
    return movimiento;
}
 
async function obtenerPorArticulo(idArticulo) {
    const r = await db.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'idArticulo = :id',
        ExpressionAttributeValues: { ':id': idArticulo },
        ScanIndexForward: false
    }));
    return r.Items || [];
}
 
async function obtenerPorSolicitante(idSolicitante) {
    const r = await db.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'MovimientosPorSolicitante',
        KeyConditionExpression: 'idSolicitante = :id',
        ExpressionAttributeValues: { ':id': idSolicitante },
        ScanIndexForward: false
    }));
    return r.Items || [];
}
 
module.exports = {
    TABLE, construirMovimiento, itemTransaccion,
    registrarMovimiento, obtenerPorArticulo, obtenerPorSolicitante
};
