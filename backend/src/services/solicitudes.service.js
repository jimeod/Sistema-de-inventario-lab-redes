const {
    GetCommand,
    PutCommand,
    QueryCommand
} = require('@aws-sdk/lib-dynamodb');

const db = require('../config/aws');

const usuariosService = require('./usuarios.service');
const articulosService = require('./articulos.service');
const movimientosService = require('./movimientos.service');

const TABLE = process.env.DYNAMODB_TABLE_SOLICITUDES;



async function obtenerSolicitudPorId(idSolicitudes) {
    const resultado = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { idSolicitudes }
    }));

    return resultado.Item || null;
}



async function obtenerSolicitudesPorUsuario(idSolicitante) {
    const resultado = await db.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'SolicitudesPorUsuario',
        KeyConditionExpression: 'idSolicitante = :idSolicitante',
        ExpressionAttributeValues: {
            ':idSolicitante': idSolicitante
        },
        ScanIndexForward: false
    }));

    return resultado.Items || [];
}



async function obtenerSolicitudesPorEstado(estado) {
    const resultado = await db.send(new QueryCommand({
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
    }));

    return resultado.Items || [];
}



async function crearSolicitud(datos) {


    const usuario = await usuariosService.obtenerUsuarioPorId(
        datos.idSolicitante
    );

    if (!usuario || !usuario.activo) {
        throw new Error('El usuario no existe o está inactivo');
    }

    
    if (!Array.isArray(datos.articulos) || datos.articulos.length === 0) {
        throw new Error('La solicitud debe incluir al menos un artículo');
    }

    
    const idsArticulos = datos.articulos.map(
        articulo => articulo.idArticulo
    );

    if (new Set(idsArticulos).size !== idsArticulos.length) {
        throw new Error('No se permiten artículos duplicados en una solicitud');
    }

    const articulosSolicitud = [];

    
    for (const articuloSolicitado of datos.articulos) {

        const { idArticulo, cantidad } = articuloSolicitado;

        if (!idArticulo || !Number.isInteger(cantidad) || cantidad <= 0) {
            throw new Error('Cada artículo debe tener un ID y una cantidad entera positiva');
        }

        const articulo = await articulosService.obtenerArticuloPorId(
            idArticulo
        );

        if (!articulo || !articulo.activo) {
            throw new Error(`El artículo ${idArticulo} no existe o está inactivo`);
        }

        if (cantidad > articulo.disponibles) {
            throw new Error(
                `Existencias insuficientes para ${articulo.nombre}. Disponibles: ${articulo.disponibles}`
            );
        }

        articulosSolicitud.push({
            idArticulo: articulo.idArticulo,
            nombre: articulo.nombre,
            tipo: articulo.tipo,
            cantidad
        });
    }

    
    const solicitud = {
        idSolicitudes: `SOL-${require('crypto').randomUUID()}`,
        idSolicitante: usuario.idUsuario,
        nombreSolicitante: usuario.nombre,
        fechaSolicitud: new Date().toISOString(),
        estado: 'PENDIENTE',
        practica: datos.practica,
        articulos: articulosSolicitud,
        observaciones: datos.observaciones || ''
    };

    await db.send(new PutCommand({
        TableName: TABLE,
        Item: solicitud,
        ConditionExpression: 'attribute_not_exists(idSolicitudes)'
    }));

    
    for (const a of articulosSolicitud) {
        await movimientosService.registrarMovimiento({
            idArticulo: a.idArticulo,
            idSolicitud: solicitud.idSolicitudes,
            idSolicitante: usuario.idUsuario,
            tipoMovimiento: 'SOLICITUD',
            cantidad: a.cantidad,
            motivo: solicitud.practica
        });
    }

    return solicitud;
}


module.exports = {
    obtenerSolicitudPorId,
    obtenerSolicitudesPorUsuario,
    obtenerSolicitudesPorEstado,
    crearSolicitud
};