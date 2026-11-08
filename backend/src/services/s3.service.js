const {
    PutObjectCommand,
    GetObjectCommand
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = require('../config/s3');

const BUCKET = process.env.S3_BUCKET_NAME;

// Subir un archivo a S3
async function subirArchivo(archivo, carpeta) {
    const extension = archivo.originalname.split('.').pop();
    const nombreArchivo = `${require('crypto').randomUUID()}.${extension}`;
    const key = `${carpeta}/${nombreArchivo}`;

    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: archivo.buffer,
        ContentType: archivo.mimetype
    }));

    return key;
}

// Generar URL temporal para visualizar un archivo
async function obtenerUrlArchivo(key) {
    const comando = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key
    });

    return await getSignedUrl(s3, comando, {
        expiresIn: 3600
    });
}

module.exports = {
    subirArchivo,
    obtenerUrlArchivo
};