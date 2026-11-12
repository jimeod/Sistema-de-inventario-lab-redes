const { ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../config/aws');


async function recorrerPaginas(Comando, params) {
    const items = [];
    let clave;
    do {
        const r = await db.send(new Comando({ ...params, ExclusiveStartKey: clave }));
        items.push(...(r.Items || []));
        clave = r.LastEvaluatedKey;
    } while (clave);
    return items;
}

const escanearTodo = params => recorrerPaginas(ScanCommand, params);
const consultarTodo = params => recorrerPaginas(QueryCommand, params);


function motivosCancelacion(err) {
    return (err && err.CancellationReasons || []).map(m => (m && m.Code) || null);
}

module.exports = { escanearTodo, consultarTodo, motivosCancelacion };
