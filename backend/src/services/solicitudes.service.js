const {
    GetCommand,
    TransactWriteCommand
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const db = require('../config/aws');
const { ErrorNegocio } = require('../utils/errors');
const { consultarTodo, motivosCancelacion } = require('../utils/dynamo');
const { exigirTexto } = require('../utils/validaciones');

const usuariosService = require('./usuarios.service');
const articulosService = require('./articulos.service');
const movimientosService = require('./movimientos.service');

const TABLE = process.env.DYNAMODB_TABLE_SOLICITUDES;
const T_CONTADORES = process.env.DYNAMODB_TABLE_CONTADORES || 'Contadores';

const CONTADOR_FOLIOS = 'folio-solicitudes';
const REINTENTOS_FOLIO = 5;

const MAX_ARTICULOS_DISTINTOS = 20;
const ESTADOS = [
    'PENDIENTE', 'APROBADA', 'ENTREGADA', 'DEVUELTA', 'RECHAZADA', 'CANCELADA', 'CERRADA'
];


function normalizarSolicitud(item) {
    if (!item) return null;
    return { ...item, folio: item.folio || item.idSolicitudes };
}

function formatearFolio(numero) {
    return `SOL-${String(numero).padStart(4, '0')}`;
}

async function obtenerSolicitudPorId(idSolicitudes) {
    if (typeof idSolicitudes !== 'string' || !idSolicitudes) return null;
    const resultado = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { idSolicitudes }
    }));

    return normalizarSolicitud(resultado.Item);
}

async function obtenerSolicitudesPorUsuario(idSolicitante) {
    const items = await consultarTodo({
        TableName: TABLE,
        IndexName: 'SolicitudesPorUsuario',
        KeyConditionExpression: 'idSolicitante = :idSolicitante',
        ExpressionAttributeValues: {
            ':idSolicitante': idSolicitante
        },
        ScanIndexForward: false
    });
    return items.map(normalizarSolicitud);
}

async function obtenerSolicitudesPorEstado(estado) {
    const items = await consultarTodo({
        TableName: TABLE,
        IndexName: 'SolicitudesPorEstado',
        KeyConditionExpression: '#estado = :estado',
        ExpressionAttributeNames: {
            '#estado': 'estado'
        },
        ExpressionAttributeValues: {
            ':estado': estado
        },
        ScanIndexForward: false
    });
    return items.map(normalizarSolicitud);
}

async function leerContadorFolios() {
    const r = await db.send(new GetCommand({
        TableName: T_CONTADORES,
        Key: { nombre: CONTADOR_FOLIOS },
        ConsistentRead: true
    }));
    return r.Item ? r.Item.valor : 0;
}


function itemContador(actual, siguiente) {
    return {
        Update: {
            TableName: T_CONTADORES,
            Key: { nombre: CONTADOR_FOLIOS },
            UpdateExpression: 'SET valor = :siguiente',
            ConditionExpression: actual === 0
                ? 'attribute_not_exists(nombre)'
                : 'valor = :actual',
            ExpressionAttributeValues: actual === 0
                ? { ':siguiente': siguiente }
                : { ':siguiente': siguiente, ':actual': actual }
        }
    };
}

async function crearSolicitud(datos) {
    const usuario = await usuariosService.obtenerUsuarioPorId(datos.idSolicitante);
    if (!usuario || !usuario.activo) {
        throw new ErrorNegocio('El usuario no existe o está inactivo', 404);
    }

    const practica = exigirTexto(datos.practica, 'práctica', { max: 200 });
    const observaciones = datos.observaciones === undefined || datos.observaciones === ''
        ? ''
        : exigirTexto(datos.observaciones, 'observaciones', { max: 500 });

    if (!Array.isArray(datos.articulos) || datos.articulos.length === 0) {
        throw new ErrorNegocio('La solicitud debe incluir al menos un artículo');
    }

    for (const a of datos.articulos) {
        if (!a || typeof a !== 'object' || typeof a.idArticulo !== 'string' || !a.idArticulo ||
            !Number.isInteger(a.cantidad) || a.cantidad <= 0) {
            throw new ErrorNegocio('Cada artículo debe tener un ID y una cantidad entera positiva');
        }
    }

    const idsArticulos = datos.articulos.map(a => a.idArticulo);
    if (new Set(idsArticulos).size !== idsArticulos.length) {
        throw new ErrorNegocio('No se permiten artículos duplicados en una solicitud');
    }
    if (idsArticulos.length > MAX_ARTICULOS_DISTINTOS) {
        throw new ErrorNegocio(
            `Una solicitud admite máximo ${MAX_ARTICULOS_DISTINTOS} artículos distintos`
        );
    }

    const articulosSolicitud = [];
    const articulosCompletos = [];
    for (const { idArticulo, cantidad } of datos.articulos) {
        const articulo = await articulosService.obtenerArticuloPorId(idArticulo);

        if (!articulo || !articulo.activo) {
            throw new ErrorNegocio(`El artículo ${idArticulo} no existe o está inactivo`, 404);
        }
        if (cantidad > articulo.libres) {
            throw new ErrorNegocio(
                `Existencias insuficientes para ${articulo.nombre}. Libres: ${articulo.libres}`
            );
        }

        articulosSolicitud.push({
            idArticulo: articulo.idArticulo,
            clave: articulo.clave,
            nombre: articulo.nombre,
            tipo: articulo.tipo,
            cantidad
        });
        articulosCompletos.push(articulo);
    }

    const idSolicitudes = `SOL-${crypto.randomUUID()}`;
    const fechaSolicitud = new Date().toISOString();

    for (let intento = 1; intento <= REINTENTOS_FOLIO; intento++) {
        const actual = await leerContadorFolios();
        const folio = formatearFolio(actual + 1);

        const solicitud = {
            idSolicitudes,
            folio,
            idSolicitante: usuario.idUsuario,
            nombreSolicitante: usuario.nombre,
            fechaSolicitud,
            estado: 'PENDIENTE',
            practica,
            articulos: articulosSolicitud,
            observaciones
        };

        
        const items = [
            itemContador(actual, actual + 1),
            {
                Put: {
                    TableName: TABLE,
                    Item: solicitud,
                    ConditionExpression: 'attribute_not_exists(idSolicitudes)'
                }
            }
        ];
        articulosCompletos.forEach((articulo, k) => {
            items.push(movimientosService.itemTransaccion(movimientosService.construirMovimiento({
                articulo,
                solicitud,
                solicitante: usuario,
                tipoMovimiento: 'SOLICITUD',
                cantidad: articulosSolicitud[k].cantidad,
                motivo: practica,
                antes: articulo,
                despues: articulo
            })));
        });

        try {
            await db.send(new TransactWriteCommand({ TransactItems: items }));
            return solicitud;
        } catch (err) {
            const folioOcupado = err.name === 'TransactionCanceledException' &&
                motivosCancelacion(err)[0] === 'ConditionalCheckFailed';
            if (!folioOcupado || intento === REINTENTOS_FOLIO) throw err;
            
        }
    }
}

module.exports = {
    MAX_ARTICULOS_DISTINTOS,
    formatearFolio,
    ESTADOS,
    obtenerSolicitudPorId,
    obtenerSolicitudesPorUsuario,
    obtenerSolicitudesPorEstado,
    crearSolicitud
};
