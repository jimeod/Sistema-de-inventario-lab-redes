const {
    GetCommand,
    UpdateCommand,
    TransactWriteCommand
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const db = require('../config/aws');
const { ErrorNegocio } = require('../utils/errors');
const { escanearTodo, motivosCancelacion } = require('../utils/dynamo');
const { exigirTexto } = require('../utils/validaciones');
const { CAMPOS, contadores, reabastecer, darDeBaja } = require('../utils/inventario');
const movimientosService = require('./movimientos.service');

const TABLE = process.env.DYNAMODB_TABLE_ARTICULOS;

const TIPOS = ['PRESTABLE', 'CONSUMIBLE'];
const CONDICIONES = ['BUENO', 'REGULAR', 'DANADO'];


const PREFIJO_INDICE = 'CLAVE#';
const TIPO_INDICE = 'INDICE_CLAVE';
const SOLO_ARTICULOS = 'attribute_exists(idArticulo) AND attribute_not_exists(tipoRegistro)';
const REGEX_CLAVE = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;

function normalizarClave(valor) {
    if (typeof valor !== 'string') {
        throw new ErrorNegocio('La clave es obligatoria y debe ser texto');
    }
    const clave = valor.trim().toUpperCase();
    if (!REGEX_CLAVE.test(clave)) {
        throw new ErrorNegocio(
            'La clave debe tener de 2 a 30 caracteres: letras, números, guion o guion bajo'
        );
    }
    return clave;
}

function itemIndiceClave(clave, idArticulo) {
    return {
        idArticulo: `${PREFIJO_INDICE}${clave}`,
        tipoRegistro: TIPO_INDICE,
        clave,
        idArticuloReferencia: idArticulo,
        fechaRegistro: new Date().toISOString()
    };
}


function normalizarArticulo(item) {
    if (!item || item.tipoRegistro) return null;
    return { ...item, clave: item.clave || null, ...contadores(item) };
}

async function obtenerArticulos() {
    const items = await escanearTodo({
        TableName: TABLE,
        FilterExpression: 'activo = :activo AND attribute_not_exists(tipoRegistro)',
        ExpressionAttributeValues: {
            ':activo': true
        }
    });
    return items.map(normalizarArticulo);
}

async function obtenerCrudo(idArticulo) {
    if (typeof idArticulo !== 'string' || !idArticulo || idArticulo.startsWith(PREFIJO_INDICE)) {
        return null;
    }
    const resultado = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { idArticulo }
    }));
    return resultado.Item && !resultado.Item.tipoRegistro ? resultado.Item : null;
}

async function obtenerArticuloPorId(idArticulo) {
    return normalizarArticulo(await obtenerCrudo(idArticulo));
}

async function obtenerArticuloPorClave(claveCruda) {
    if (typeof claveCruda !== 'string' || !claveCruda.trim()) return null;
    const clave = claveCruda.trim().toUpperCase();
    const r = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { idArticulo: `${PREFIJO_INDICE}${clave}` }
    }));
    return r.Item ? obtenerArticuloPorId(r.Item.idArticuloReferencia) : null;
}


async function migrarSiHaceFalta(idArticulo) {
    const crudo = await obtenerCrudo(idArticulo);
    if (!crudo) return null;

    const completo = ['reservados', 'danados', 'libres'].every(k => crudo[k] !== undefined);
    if (completo) return normalizarArticulo(crudo);

    try {
        await db.send(new UpdateCommand({
            TableName: TABLE,
            Key: { idArticulo },
            UpdateExpression:
                'SET reservados = if_not_exists(reservados, :cero), ' +
                'danados = if_not_exists(danados, :cero), ' +
                'libres = disponibles - if_not_exists(reservados, :cero)',
            ConditionExpression: `${SOLO_ARTICULOS} AND attribute_not_exists(libres)`,
            ExpressionAttributeValues: { ':cero': 0 }
        }));
    } catch (err) {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
    }
    return obtenerArticuloPorId(idArticulo);
}


function itemActualizarContadores(antes, despues, { exigirActivo = false } = {}) {
    const nombres = {};
    const valores = {};
    const sets = [];
    const condiciones = [SOLO_ARTICULOS];

    CAMPOS.forEach(campo => {
        nombres[`#${campo}`] = campo;
        valores[`:n_${campo}`] = despues[campo];
        valores[`:a_${campo}`] = antes[campo];
        sets.push(`#${campo} = :n_${campo}`);
        condiciones.push(`#${campo} = :a_${campo}`);
    });
    if (exigirActivo) {
        nombres['#activo'] = 'activo';
        valores[':si'] = true;
        condiciones.push('#activo = :si');
    }

    return {
        Update: {
            TableName: TABLE,
            Key: { idArticulo: antes.idArticulo },
            UpdateExpression: `SET ${sets.join(', ')}`,
            ConditionExpression: condiciones.join(' AND '),
            ExpressionAttributeNames: nombres,
            ExpressionAttributeValues: valores
        }
    };
}

async function crearArticulo(datos, actor) {
    if (!TIPOS.includes(datos.tipo)) {
        throw new ErrorNegocio('El tipo debe ser PRESTABLE o CONSUMIBLE');
    }
    if (datos.condicion !== undefined && !CONDICIONES.includes(datos.condicion)) {
        throw new ErrorNegocio('La condición debe ser BUENO, REGULAR o DANADO');
    }
    if (!Number.isInteger(datos.existencias) || datos.existencias < 0) {
        throw new ErrorNegocio('Las existencias deben ser un entero mayor o igual a 0');
    }

    const clave = normalizarClave(datos.clave);
    const idArticulo = `ART-${crypto.randomUUID()}`;
    const articulo = {
        idArticulo,
        clave,
        nombre: exigirTexto(datos.nombre, 'nombre', { max: 120 }),
        categoria: exigirTexto(datos.categoria, 'categoría', { max: 80 }),
        ubicacion: exigirTexto(datos.ubicacion, 'ubicación', { max: 80 }),
        tipo: datos.tipo,
        existencias: datos.existencias,
        disponibles: datos.existencias,
        prestados: 0,
        reservados: 0,
        danados: 0,
        libres: datos.existencias,
        condicion: datos.condicion || 'BUENO',
        fotoKey: null,
        activo: true
    };

    const alta = movimientosService.construirMovimiento({
        articulo, encargado: actor, tipoMovimiento: 'ALTA',
        cantidad: articulo.existencias, motivo: 'Alta del artículo',
        antes: contadores({}), despues: articulo
    });

    try {
        await db.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Put: {
                        TableName: TABLE,
                        Item: itemIndiceClave(clave, idArticulo),
                        ConditionExpression: 'attribute_not_exists(idArticulo)'
                    }
                },
                {
                    Put: {
                        TableName: TABLE,
                        Item: articulo,
                        ConditionExpression: 'attribute_not_exists(idArticulo)'
                    }
                },
                movimientosService.itemTransaccion(alta)
            ]
        }));
    } catch (err) {
        if (err.name === 'TransactionCanceledException' &&
            motivosCancelacion(err)[0] === 'ConditionalCheckFailed') {
            throw new ErrorNegocio(`Ya existe un artículo con la clave ${clave}`, 409);
        }
        throw err;
    }

    return articulo;
}

async function actualizarArticulo(idArticulo, datos) {
    const existente = await obtenerCrudo(idArticulo);
    if (!existente) throw new ErrorNegocio('Artículo no encontrado', 404);

    const cambios = {};
    if (datos.nombre !== undefined) cambios.nombre = exigirTexto(datos.nombre, 'nombre', { max: 120 });
    if (datos.categoria !== undefined) cambios.categoria = exigirTexto(datos.categoria, 'categoría', { max: 80 });
    if (datos.ubicacion !== undefined) cambios.ubicacion = exigirTexto(datos.ubicacion, 'ubicación', { max: 80 });
    if (datos.condicion !== undefined) {
        if (!CONDICIONES.includes(datos.condicion)) {
            throw new ErrorNegocio('La condición debe ser BUENO, REGULAR o DANADO');
        }
        cambios.condicion = datos.condicion;
    }

    
    let claveNueva = null;
    if (datos.clave !== undefined) {
        claveNueva = normalizarClave(datos.clave);
    } else if (!existente.clave) {
        claveNueva = `ART-${idArticulo.replace(/^ART-/, '').replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    }
    const cambiaClave = claveNueva && claveNueva !== existente.clave;
    if (cambiaClave) cambios.clave = claveNueva;

    const campos = Object.keys(cambios);
    if (campos.length === 0) {
        throw new ErrorNegocio('No hay campos válidos para actualizar');
    }

    const nombres = {};
    const valores = {};
    campos.forEach((campo, i) => {
        nombres[`#campo${i}`] = campo;
        valores[`:valor${i}`] = cambios[campo];
    });

    const actualizar = {
        TableName: TABLE,
        Key: { idArticulo },
        UpdateExpression: `SET ${campos.map((_, i) => `#campo${i} = :valor${i}`).join(', ')}`,
        ExpressionAttributeNames: nombres,
        ExpressionAttributeValues: valores,
        ConditionExpression: SOLO_ARTICULOS
    };

    if (!cambiaClave) {
        try {
            const r = await db.send(new UpdateCommand({ ...actualizar, ReturnValues: 'ALL_NEW' }));
            return normalizarArticulo(r.Attributes);
        } catch (err) {
            if (err.name === 'ConditionalCheckFailedException') {
                throw new ErrorNegocio('Artículo no encontrado', 404);
            }
            throw err;
        }
    }

    
    const items = [{
        Put: {
            TableName: TABLE,
            Item: itemIndiceClave(claveNueva, idArticulo),
            ConditionExpression: 'attribute_not_exists(idArticulo)'
        }
    }, { Update: actualizar }];
    if (existente.clave) {
        items.push({
            Delete: {
                TableName: TABLE,
                Key: { idArticulo: `${PREFIJO_INDICE}${existente.clave}` }
            }
        });
    }

    try {
        await db.send(new TransactWriteCommand({ TransactItems: items }));
    } catch (err) {
        if (err.name === 'TransactionCanceledException') {
            const motivos = motivosCancelacion(err);
            if (motivos[0] === 'ConditionalCheckFailed') {
                throw new ErrorNegocio(`Ya existe un artículo con la clave ${claveNueva}`, 409);
            }
            if (motivos[1] === 'ConditionalCheckFailed') {
                throw new ErrorNegocio('Artículo no encontrado', 404);
            }
        }
        throw err;
    }
    return obtenerArticuloPorId(idArticulo);
}

async function actualizarFotoArticulo(idArticulo, fotoKey) {
    try {
        const resultado = await db.send(new UpdateCommand({
            TableName: TABLE,
            Key: { idArticulo },
            UpdateExpression: 'SET fotoKey = :fotoKey',
            ExpressionAttributeValues: { ':fotoKey': fotoKey },
            ConditionExpression: SOLO_ARTICULOS,
            ReturnValues: 'ALL_OLD'
        }));
        return {
            articulo: normalizarArticulo({ ...resultado.Attributes, fotoKey }),
            fotoAnterior: resultado.Attributes.fotoKey || null
        };
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            throw new ErrorNegocio('Artículo no encontrado', 404);
        }
        throw err;
    }
}

async function desactivarArticulo(idArticulo) {
    const a = await migrarSiHaceFalta(idArticulo);
    if (!a) throw new ErrorNegocio('Artículo no encontrado', 404);
    if (a.prestados > 0 || a.reservados > 0) {
        throw new ErrorNegocio(
            'No se puede desactivar: tiene unidades prestadas o reservadas por solicitudes abiertas',
            409
        );
    }

    try {
        const resultado = await db.send(new UpdateCommand({
            TableName: TABLE,
            Key: { idArticulo },
            UpdateExpression: 'SET activo = :activo',
            
            ConditionExpression: `${SOLO_ARTICULOS} AND prestados = :cero AND reservados = :cero`,
            ExpressionAttributeValues: { ':activo': false, ':cero': 0 },
            ReturnValues: 'ALL_NEW'
        }));
        return normalizarArticulo(resultado.Attributes);
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            throw new ErrorNegocio(
                'No se pudo desactivar: el artículo cambió. Verifica e intenta de nuevo.', 409
            );
        }
        throw err;
    }
}


async function ajustarExistencias(idArticulo, tipoMovimiento, datos, actor) {
    const cantidad = datos.cantidad;
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw new ErrorNegocio('La cantidad debe ser un entero positivo');
    }
    const motivo = exigirTexto(datos.motivo, 'motivo', { min: 3, max: 500 });

    const articulo = await migrarSiHaceFalta(idArticulo);
    if (!articulo) throw new ErrorNegocio('Artículo no encontrado', 404);

    const antes = contadores(articulo);
    let despues;
    if (tipoMovimiento === 'REABASTECIMIENTO') {
        if (!articulo.activo) {
            throw new ErrorNegocio('El artículo está inactivo; no se puede reabastecer', 409);
        }
        despues = reabastecer(antes, cantidad);
    } else {
        despues = darDeBaja(antes, cantidad, articulo.nombre);
    }

    const movimiento = movimientosService.construirMovimiento({
        articulo, encargado: actor, tipoMovimiento, cantidad, motivo, antes, despues
    });

    await db.send(new TransactWriteCommand({
        TransactItems: [
            itemActualizarContadores({ ...antes, idArticulo }, despues),
            movimientosService.itemTransaccion(movimiento)
        ]
    }));

    return obtenerArticuloPorId(idArticulo);
}

const reabastecerArticulo = (idArticulo, datos, actor) =>
    ajustarExistencias(idArticulo, 'REABASTECIMIENTO', datos, actor);

const darDeBajaArticulo = (idArticulo, datos, actor) =>
    ajustarExistencias(idArticulo, 'BAJA', datos, actor);

module.exports = {
    reabastecerArticulo,
    darDeBajaArticulo,
    TIPOS,
    CONDICIONES,
    normalizarClave,
    normalizarArticulo,
    obtenerArticulos,
    obtenerArticuloPorId,
    obtenerArticuloPorClave,
    migrarSiHaceFalta,
    itemActualizarContadores,
    crearArticulo,
    actualizarArticulo,
    actualizarFotoArticulo,
    desactivarArticulo
};
