const multer = require('multer');
const { ErrorNegocio } = require('../utils/errors');
const { detectarTipo } = require('../utils/archivos');


const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 }
});


function exigirArchivoValido(...permitidos) {
    const aceptaImagen = permitidos.includes('imagen');
    const aceptaPdf = permitidos.includes('pdf');
    const descripcion = [aceptaImagen && 'JPG, PNG o WEBP', aceptaPdf && 'PDF']
        .filter(Boolean).join(' o ');

    return (req, res, next) => {
        if (!req.file) {
            return next(new ErrorNegocio('Debes adjuntar un archivo'));
        }
        const tipo = detectarTipo(req.file.buffer);
        const valido = tipo && ((tipo.imagen && aceptaImagen) || (!tipo.imagen && aceptaPdf));
        if (!valido) {
            return next(new ErrorNegocio(`El archivo no es válido. Formatos permitidos: ${descripcion}`));
        }
        req.file.tipoDetectado = tipo;
        next();
    };
}

module.exports = { upload, exigirArchivoValido };
