const { ErrorNegocio } = require('../utils/errors');
const logger = require('../utils/logger');

// Express 5 deja req.body en undefined cuando no hay cuerpo: se normaliza a {}.
function inicializarBody(req, res, next) {
    if (req.body === undefined || req.body === null) {
        req.body = {};
    }
    if (typeof req.body !== 'object' || Array.isArray(req.body)) {
        return next(new ErrorNegocio('El cuerpo de la solicitud debe ser un objeto JSON', 400));
    }
    next();
}

function rutaNoEncontrada(req, res) {
    res.status(404).json({ mensaje: 'Ruta no encontrada' });
}

function manejarErrores(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err instanceof ErrorNegocio) {
        return res.status(err.status).json({ mensaje: err.message });
    }

    // Errores de body-parser
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ mensaje: 'El JSON enviado no es válido' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ mensaje: 'El cuerpo de la solicitud es demasiado grande' });
    }
    if (err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') {
        return res.status(415).json({ mensaje: 'Codificación de la solicitud no soportada' });
    }
    if (err.type === 'request.aborted' || err.type === 'request.size.invalid') {
        return res.status(400).json({ mensaje: 'La solicitud no se recibió completa' });
    }

    // Errores de multer
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ mensaje: 'El archivo excede 5 MB' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ mensaje: `Campo de archivo inesperado: ${err.field}` });
        }
        return res.status(400).json({ mensaje: 'No se pudo procesar el archivo enviado' });
    }

    if (err.name === 'TransactionCanceledException') {
        return res.status(409).json({
            mensaje: 'La operación no se completó: el inventario o el estado de la solicitud cambió. Verifica e intenta de nuevo.'
        });
    }
    if (err.name === 'ConditionalCheckFailedException') {
        return res.status(409).json({
            mensaje: 'La operación no se pudo completar porque el registro cambió o no existe'
        });
    }

    logger.error('Error inesperado', {
        metodo: req.method,
        ruta: req.originalUrl ? req.originalUrl.split('?')[0] : undefined,
        usuario: req.usuario && req.usuario.idUsuario,
        error: err && err.name,
        detalle: err && err.message,
        stack: err && err.stack
    });
    res.status(500).json({ mensaje: 'Error interno del servidor' });
}

module.exports = { inicializarBody, rutaNoEncontrada, manejarErrores };
