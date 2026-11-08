const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../config/aws');

const solicitudesService = require('./solicitudes.service');
const articulosService = require('./articulos.service');
const movimientos = require('./movimientos.service');
const { ErrorNegocio } = require('../utils/errors');

const T_SOLICITUDES = process.env.DYNAMODB_TABLE_SOLICITUDES;
const T_ARTICULOS = process.env.DYNAMODB_TABLE_ARTICULOS;



async function cargarSolicitud(id) {
    const s = await solicitudesService.obtenerSolicitudPorId(id);
    if (!s) throw new ErrorNegocio('Solicitud no encontrada', 404);
    return s;
}

function exigirEstado(solicitud, esperado) {
    if (solicitud.estado !== esperado) {
        throw new ErrorNegocio(
            `La solicitud está ${solicitud.estado}; para esta operación debe estar ${esperado}`,
            409
        );
    }
}


async function cargarArticulos(solicitud) {
    const mapa = {};
    for (const item of solicitud.articulos) {
        const art = await articulosService.obtenerArticuloPorId(item.idArticulo);
        if (!art) throw new ErrorNegocio(`El artículo ${item.idArticulo} ya no existe`, 404);
        mapa[item.idArticulo] = art;
    }
    return mapa;
}

async function ejecutar(items) {
    await db.send(new TransactWriteCommand({ TransactItems: items }));
}

// ---------- aprobar / rechazar ----------

async function aprobar(idSolicitud, encargado, motivo) {
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'PENDIENTE');

    const arts = await cargarArticulos(s);
    for (const item of s.articulos) {
        const a = arts[item.idArticulo];
        if (!a.activo) throw new ErrorNegocio(`El artículo ${a.nombre} está inactivo`);
        if (item.cantidad > a.disponibles) {
            throw new ErrorNegocio(
                `Existencias insuficientes para ${a.nombre}. Disponibles: ${a.disponibles}`
            );
        }
    }

    const items = [{
        Update: {
            TableName: T_SOLICITUDES,
            Key: { idSolicitudes: idSolicitud },
            UpdateExpression: 'SET #estado = :nuevo, idEncargado = :enc, nombreEncargado = :nom, fechaResolucion = :f, motivoResolucion = :m',
            ConditionExpression: '#estado = :actual',
            ExpressionAttributeNames: { '#estado': 'estado' },
            ExpressionAttributeValues: {
                ':nuevo': 'APROBADA', ':actual': 'PENDIENTE',
                ':enc': encargado.idUsuario, ':nom': encargado.nombre,
                ':f': new Date().toISOString(), ':m': motivo || ''
            }
        }
    }];

    for (const item of s.articulos) {
        const a = arts[item.idArticulo];
        items.push(movimientos.itemTransaccion(movimientos.construirMovimiento({
            idArticulo: a.idArticulo, idSolicitud, idSolicitante: s.idSolicitante,
            idEncargado: encargado.idUsuario, tipoMovimiento: 'APROBACION',
            cantidad: item.cantidad, motivo: motivo || '',
            saldoAntes: a.disponibles, saldoDespues: a.disponibles
        })));
    }

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}

async function rechazar(idSolicitud, encargado, motivo) {
    if (!motivo || !motivo.trim()) {
        throw new ErrorNegocio('El motivo del rechazo es obligatorio');
    }
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'PENDIENTE');
    const arts = await cargarArticulos(s);

    const items = [{
        Update: {
            TableName: T_SOLICITUDES,
            Key: { idSolicitudes: idSolicitud },
            UpdateExpression: 'SET #estado = :nuevo, idEncargado = :enc, nombreEncargado = :nom, fechaResolucion = :f, motivoResolucion = :m',
            ConditionExpression: '#estado = :actual',
            ExpressionAttributeNames: { '#estado': 'estado' },
            ExpressionAttributeValues: {
                ':nuevo': 'RECHAZADA', ':actual': 'PENDIENTE',
                ':enc': encargado.idUsuario, ':nom': encargado.nombre,
                ':f': new Date().toISOString(), ':m': motivo.trim()
            }
        }
    }];

    for (const item of s.articulos) {
        const a = arts[item.idArticulo];
        items.push(movimientos.itemTransaccion(movimientos.construirMovimiento({
            idArticulo: a.idArticulo, idSolicitud, idSolicitante: s.idSolicitante,
            idEncargado: encargado.idUsuario, tipoMovimiento: 'RECHAZO',
            cantidad: item.cantidad, motivo: motivo.trim(),
            saldoAntes: a.disponibles, saldoDespues: a.disponibles
        })));
    }

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}



async function entregar(idSolicitud, encargado) {
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'APROBADA');
    const arts = await cargarArticulos(s);

    const items = [{
        Update: {
            TableName: T_SOLICITUDES,
            Key: { idSolicitudes: idSolicitud },
            UpdateExpression: 'SET #estado = :nuevo, fechaEntrega = :f, idEncargadoEntrega = :enc',
            ConditionExpression: '#estado = :actual',
            ExpressionAttributeNames: { '#estado': 'estado' },
            ExpressionAttributeValues: {
                ':nuevo': 'ENTREGADA', ':actual': 'APROBADA',
                ':f': new Date().toISOString(), ':enc': encargado.idUsuario
            }
        }
    }];

    for (const item of s.articulos) {
        const a = arts[item.idArticulo];
        const c = item.cantidad;
        const prestable = a.tipo === 'PRESTABLE';

        if (c > a.disponibles) {
            throw new ErrorNegocio(
                `Existencias insuficientes para ${a.nombre}. Disponibles: ${a.disponibles}`
            );
        }

        
        items.push({
            Update: {
                TableName: T_ARTICULOS,
                Key: { idArticulo: a.idArticulo },
                UpdateExpression: prestable
                    ? 'SET disponibles = disponibles - :c, prestados = prestados + :c'
                    : 'SET disponibles = disponibles - :c, existencias = existencias - :c',
                // La condición evita inventario negativo aunque haya peticiones simultáneas
                ConditionExpression: 'disponibles >= :c',
                ExpressionAttributeValues: { ':c': c }
            }
        });

        items.push(movimientos.itemTransaccion(movimientos.construirMovimiento({
            idArticulo: a.idArticulo, idSolicitud, idSolicitante: s.idSolicitante,
            idEncargado: encargado.idUsuario, tipoMovimiento: 'ENTREGA',
            cantidad: c, saldoAntes: a.disponibles, saldoDespues: a.disponibles - c,
            detalle: { tipo: a.tipo }
        })));
    }

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}


async function devolver(idSolicitud, encargado, datos) {
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'ENTREGADA');

    const prestables = s.articulos.filter(a => a.tipo === 'PRESTABLE');
    if (prestables.length === 0) {
        throw new ErrorNegocio('La solicitud solo tiene consumibles; no requiere devolución');
    }
    if (!Array.isArray(datos.articulos)) {
        throw new ErrorNegocio('Debes indicar el estado de devolución de cada artículo prestable');
    }

    const porId = Object.fromEntries(datos.articulos.map(a => [a.idArticulo, a]));
    const arts = await cargarArticulos(s);

    const items = [{
        Update: {
            TableName: T_SOLICITUDES,
            Key: { idSolicitudes: idSolicitud },
            UpdateExpression: 'SET #estado = :nuevo, fechaDevolucion = :f, idEncargadoDevolucion = :enc, devolucion = :det, observacionesDevolucion = :obs',
            ConditionExpression: '#estado = :actual',
            ExpressionAttributeNames: { '#estado': 'estado' },
            ExpressionAttributeValues: {
                ':nuevo': 'DEVUELTA', ':actual': 'ENTREGADA',
                ':f': new Date().toISOString(), ':enc': encargado.idUsuario,
                ':det': prestables.map(p => ({
                    idArticulo: p.idArticulo,
                    buenas: porId[p.idArticulo]?.buenas,
                    danadas: porId[p.idArticulo]?.danadas,
                    faltantes: porId[p.idArticulo]?.faltantes
                })),
                ':obs': datos.observaciones || ''
            }
        }
    }];

    for (const item of prestables) {
        const d = porId[item.idArticulo];
        if (!d) throw new ErrorNegocio(`Falta el reporte de devolución de ${item.nombre}`);

        const { buenas, danadas, faltantes } = d;
        const validos = [buenas, danadas, faltantes].every(n => Number.isInteger(n) && n >= 0);
        if (!validos) {
            throw new ErrorNegocio(`Cantidades inválidas para ${item.nombre}`);
        }
        if (buenas + danadas + faltantes !== item.cantidad) {
            throw new ErrorNegocio(
                `Para ${item.nombre} buenas + dañadas + faltantes debe ser ${item.cantidad}`
            );
        }

        const a = arts[item.idArticulo];
        const c = item.cantidad;

        
        items.push({
            Update: {
                TableName: T_ARTICULOS,
                Key: { idArticulo: a.idArticulo },
                UpdateExpression: 'SET disponibles = disponibles + :b, prestados = prestados - :c, existencias = existencias - :f, danados = if_not_exists(danados, :cero) + :d',
                ConditionExpression: 'prestados >= :c',
                ExpressionAttributeValues: {
                    ':b': buenas, ':c': c, ':f': faltantes, ':d': danadas, ':cero': 0
                }
            }
        });

        items.push(movimientos.itemTransaccion(movimientos.construirMovimiento({
            idArticulo: a.idArticulo, idSolicitud, idSolicitante: s.idSolicitante,
            idEncargado: encargado.idUsuario, tipoMovimiento: 'DEVOLUCION',
            cantidad: c, saldoAntes: a.disponibles, saldoDespues: a.disponibles + buenas,
            motivo: datos.observaciones || '',
            detalle: { buenas, danadas, faltantes }
        })));
    }

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}

module.exports = { aprobar, rechazar, entregar, devolver };