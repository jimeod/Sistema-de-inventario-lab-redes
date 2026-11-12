const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../config/aws');

const solicitudesService = require('./solicitudes.service');
const articulosService = require('./articulos.service');
const movimientos = require('./movimientos.service');
const inventario = require('../utils/inventario');
const { ErrorNegocio } = require('../utils/errors');
const { exigirTexto } = require('../utils/validaciones');

const T_SOLICITUDES = process.env.DYNAMODB_TABLE_SOLICITUDES;



async function cargarSolicitud(id) {
    const s = await solicitudesService.obtenerSolicitudPorId(id);
    if (!s) throw new ErrorNegocio('Solicitud no encontrada', 404);
    return s;
}

function exigirEstado(solicitud, ...esperados) {
    if (!esperados.includes(solicitud.estado)) {
        throw new ErrorNegocio(
            `La solicitud está ${solicitud.estado}; para esta operación debe estar ${esperados.join(' o ')}`,
            409
        );
    }
}


async function cargarArticulos(solicitud) {
    const mapa = {};
    for (const item of solicitud.articulos) {
        const art = await articulosService.migrarSiHaceFalta(item.idArticulo);
        if (!art) throw new ErrorNegocio(`El artículo ${item.nombre} ya no existe`, 404);
        mapa[item.idArticulo] = art;
    }
    return mapa;
}

async function ejecutar(items) {
    await db.send(new TransactWriteCommand({ TransactItems: items }));
}

function textoOpcional(valor, campo, max = 500) {
    if (valor === undefined || valor === null || valor === '') return '';
    return exigirTexto(valor, campo, { max });
}


function itemSolicitud(solicitud, nuevoEstado, campos) {
    const nombres = { '#estado': 'estado' };
    const valores = { ':nuevo': nuevoEstado, ':actual': solicitud.estado };
    const sets = ['#estado = :nuevo'];
    Object.entries(campos).forEach(([campo, valor], i) => {
        nombres[`#c${i}`] = campo;
        valores[`:v${i}`] = valor;
        sets.push(`#c${i} = :v${i}`);
    });
    return {
        Update: {
            TableName: T_SOLICITUDES,
            Key: { idSolicitudes: solicitud.idSolicitudes },
            UpdateExpression: `SET ${sets.join(', ')}`,
            ConditionExpression: '#estado = :actual',
            ExpressionAttributeNames: nombres,
            ExpressionAttributeValues: valores
        }
    };
}


function itemsPorArticulo({
    solicitud, arts, encargado, tipoMovimiento, motivo, exigirActivo, calcular, solo
}) {
    const items = [];
    for (const item of solicitud.articulos) {
        if (solo && !solo(item)) continue;
        const a = arts[item.idArticulo];
        const antes = inventario.contadores(a);
        const { despues, detalle } = calcular(item, antes, a);

        if (despues !== antes) {
            items.push(articulosService.itemActualizarContadores(
                { ...antes, idArticulo: a.idArticulo }, despues, { exigirActivo }
            ));
        }
        items.push(movimientos.itemTransaccion(movimientos.construirMovimiento({
            articulo: a,
            solicitud,
            solicitante: { idUsuario: solicitud.idSolicitante, nombre: solicitud.nombreSolicitante },
            encargado,
            tipoMovimiento,
            cantidad: item.cantidad,
            motivo,
            antes,
            despues,
            detalle
        })));
    }
    return items;
}

const datosEncargado = encargado => ({
    idEncargado: encargado.idUsuario,
    nombreEncargado: encargado.nombre
});



async function aprobar(idSolicitud, encargado, motivoCrudo) {
    const motivo = textoOpcional(motivoCrudo, 'motivo');
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'PENDIENTE');
    const arts = await cargarArticulos(s);

    for (const item of s.articulos) {
        if (!arts[item.idArticulo].activo) {
            throw new ErrorNegocio(`El artículo ${arts[item.idArticulo].nombre} está inactivo`);
        }
    }

    const items = [itemSolicitud(s, 'APROBADA', {
        ...datosEncargado(encargado),
        fechaResolucion: new Date().toISOString(),
        motivoResolucion: motivo,
        reservaAplicada: true
    })];

    items.push(...itemsPorArticulo({
        solicitud: s, arts, encargado, tipoMovimiento: 'APROBACION', motivo,
        exigirActivo: true,
        calcular: (item, antes, a) => ({ despues: inventario.reservar(antes, item.cantidad, a.nombre) })
    }));

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}

async function rechazar(idSolicitud, encargado, motivoCrudo) {
    const motivo = exigirTexto(motivoCrudo, 'motivo del rechazo', { max: 500 });
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'PENDIENTE');
    const arts = await cargarArticulos(s);

    const items = [itemSolicitud(s, 'RECHAZADA', {
        ...datosEncargado(encargado),
        fechaResolucion: new Date().toISOString(),
        motivoResolucion: motivo
    })];

    
    items.push(...itemsPorArticulo({
        solicitud: s, arts, encargado, tipoMovimiento: 'RECHAZO', motivo,
        calcular: (item, antes) => ({ despues: antes })
    }));

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}


async function cancelar(idSolicitud, actor, motivoCrudo) {
    const motivo = textoOpcional(motivoCrudo, 'motivo');
    const s = await cargarSolicitud(idSolicitud);

    if (actor.rol !== 'ENCARGADO' && s.idSolicitante !== actor.idUsuario) {
        throw new ErrorNegocio('No tienes permisos para cancelar esta solicitud', 403);
    }
    exigirEstado(s, 'PENDIENTE', 'APROBADA');

    const arts = await cargarArticulos(s);
    
    const liberaReserva = s.estado === 'APROBADA' && s.reservaAplicada === true;

    const items = [itemSolicitud(s, 'CANCELADA', {
        fechaCancelacion: new Date().toISOString(),
        idCancelo: actor.idUsuario,
        nombreCancelo: actor.nombre,
        motivoCancelacion: motivo
    })];

    items.push(...itemsPorArticulo({
        solicitud: s, arts, encargado: actor.rol === 'ENCARGADO' ? actor : undefined,
        tipoMovimiento: 'CANCELACION', motivo,
        calcular: (item, antes, a) => ({
            despues: liberaReserva ? inventario.liberar(antes, item.cantidad, a.nombre) : antes,
            detalle: { estadoAnterior: s.estado, canceladaPor: actor.idUsuario }
        })
    }));

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}



async function entregar(idSolicitud, encargado) {
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'APROBADA');
    const arts = await cargarArticulos(s);

    const conReserva = s.reservaAplicada === true;
    const hayPrestables = s.articulos.some(a => a.tipo === 'PRESTABLE');
    const ahora = new Date().toISOString();

    
    const items = [itemSolicitud(s, hayPrestables ? 'ENTREGADA' : 'CERRADA', {
        fechaEntrega: ahora,
        idEncargadoEntrega: encargado.idUsuario,
        nombreEncargadoEntrega: encargado.nombre,
        ...(hayPrestables ? {} : { fechaCierre: ahora })
    })];

    items.push(...itemsPorArticulo({
        solicitud: s, arts, encargado, tipoMovimiento: 'ENTREGA',
        calcular: (item, antes, a) => ({
            despues: inventario.entregar(antes, item.cantidad, a.tipo, conReserva, a.nombre),
            detalle: { tipo: a.tipo }
        })
    }));

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}



function validarReporte(prestables, datos) {
    if (!Array.isArray(datos.articulos)) {
        throw new ErrorNegocio('Debes indicar el estado de devolución de cada artículo prestable');
    }
    const permitidos = new Set(prestables.map(p => p.idArticulo));
    const vistos = new Set();
    for (const r of datos.articulos) {
        if (!r || typeof r !== 'object' || typeof r.idArticulo !== 'string') {
            throw new ErrorNegocio('Cada reporte de devolución debe incluir idArticulo');
        }
        if (!permitidos.has(r.idArticulo)) {
            throw new ErrorNegocio(`El artículo ${r.idArticulo} no es un prestable de esta solicitud`);
        }
        if (vistos.has(r.idArticulo)) {
            throw new ErrorNegocio(`El artículo ${r.idArticulo} aparece repetido en la devolución`);
        }
        vistos.add(r.idArticulo);
    }

    const porId = Object.fromEntries(datos.articulos.map(r => [r.idArticulo, r]));
    for (const item of prestables) {
        const d = porId[item.idArticulo];
        if (!d) throw new ErrorNegocio(`Falta el reporte de devolución de ${item.nombre}`);
        const { buenas, danadas, faltantes } = d;
        if (![buenas, danadas, faltantes].every(n => Number.isInteger(n) && n >= 0)) {
            throw new ErrorNegocio(`Cantidades inválidas para ${item.nombre}`);
        }
        if (buenas + danadas + faltantes !== item.cantidad) {
            throw new ErrorNegocio(
                `Para ${item.nombre} buenas + dañadas + faltantes debe ser ${item.cantidad}`
            );
        }
    }
    return porId;
}

async function devolver(idSolicitud, encargado, datos) {
    const observaciones = textoOpcional(datos.observaciones, 'observaciones');
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'ENTREGADA');

    const prestables = s.articulos.filter(a => a.tipo === 'PRESTABLE');
    if (prestables.length === 0) {
        throw new ErrorNegocio('La solicitud solo tiene consumibles; no requiere devolución');
    }
    const porId = validarReporte(prestables, datos);
    const arts = await cargarArticulos(s);

    const items = [itemSolicitud(s, 'DEVUELTA', {
        fechaDevolucion: new Date().toISOString(),
        idEncargadoDevolucion: encargado.idUsuario,
        nombreEncargadoDevolucion: encargado.nombre,
        observacionesDevolucion: observaciones,
        devolucion: prestables.map(p => ({
            idArticulo: p.idArticulo,
            clave: p.clave || null,
            nombre: p.nombre,
            cantidad: p.cantidad,
            buenas: porId[p.idArticulo].buenas,
            danadas: porId[p.idArticulo].danadas,
            faltantes: porId[p.idArticulo].faltantes
        }))
    })];

    items.push(...itemsPorArticulo({
        solicitud: s, arts, encargado, tipoMovimiento: 'DEVOLUCION', motivo: observaciones,
        solo: item => item.tipo === 'PRESTABLE',
        calcular: (item, antes, a) => {
            const { buenas, danadas, faltantes } = porId[item.idArticulo];
            return {
                despues: inventario.devolver(antes, item.cantidad, { buenas, danadas, faltantes }, a.nombre),
                detalle: { buenas, danadas, faltantes }
            };
        }
    }));

    await ejecutar(items);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}


async function cerrar(idSolicitud, encargado) {
    const s = await cargarSolicitud(idSolicitud);
    exigirEstado(s, 'DEVUELTA');

    await ejecutar([itemSolicitud(s, 'CERRADA', {
        fechaCierre: new Date().toISOString(),
        idEncargadoCierre: encargado.idUsuario,
        nombreEncargadoCierre: encargado.nombre
    })]);
    return solicitudesService.obtenerSolicitudPorId(idSolicitud);
}

module.exports = { aprobar, rechazar, cancelar, entregar, devolver, cerrar };
