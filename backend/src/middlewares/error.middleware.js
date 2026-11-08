const { ErrorNegocio } = require('../utils/errors');

function rutaNoEncontrada(req, res) {
    res.status(404).json({ mensaje: 'Ruta no encontrada' });
}


function manejarErrores(err, req, res, next) {
    if (err instanceof ErrorNegocio) {
        return res.status(err.status).json({ mensaje: err.message });
    }
    if (err.name === 'MulterError' || err.message === 'Formato de archivo no permitido') {
        return res.status(400).json({
            mensaje: err.code === 'LIMIT_FILE_SIZE'
                ? 'El archivo excede 5 MB'
                : err.message
        });
    }
    if (err.name === 'TransactionCanceledException') {
        return res.status(409).json({
            mensaje: 'La operación no se completó: el inventario o el estado de la solicitud cambió. Verifica e intenta de nuevo.'
        });
    }
    if (err.name === 'ConditionalCheckFailedException') {
        return res.status(404).json({ mensaje: 'Registro no encontrado' });
    }
    console.error(err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
}

module.exports = { rutaNoEncontrada, manejarErrores };