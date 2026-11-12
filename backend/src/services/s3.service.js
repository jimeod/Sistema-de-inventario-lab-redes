const {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = require('../config/s3');
const { ErrorNegocio } = require('../utils/errors');

const BUCKET = process.env.S3_BUCKET_NAME;


async function subirArchivo(archivo, carpeta) {
    if (!archivo || !archivo.tipoDetectado) {
        throw new ErrorNegocio('El archivo no fue validado', 400);
    }
    const { ext, mime } = archivo.tipoDetectado;
    const key = `${carpeta}/${crypto.randomUUID()}.${ext}`;

    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: archivo.buffer,
        ContentType: mime,
        ServerSideEncryption: 'AES256'
    }));

    return key;
}

async function obtenerUrlArchivo(key) {
    const comando = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key
    });

    return await getSignedUrl(s3, comando, {
        expiresIn: 3600
    });
}

async function eliminarArchivo(key) {
    if (typeof key !== 'string' || !key) return;
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = {
    subirArchivo,
    obtenerUrlArchivo,
    eliminarArchivo
};
