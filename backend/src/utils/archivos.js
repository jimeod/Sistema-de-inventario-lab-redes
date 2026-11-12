const FIRMAS = [
    {
        mime: 'image/jpeg', ext: 'jpg', imagen: true,
        coincide: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    },
    {
        mime: 'image/png', ext: 'png', imagen: true,
        coincide: b => b.length >= 8 &&
            [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)
    },
    {
        mime: 'image/webp', ext: 'webp', imagen: true,
        coincide: b => b.length >= 12 &&
            b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
    },
    {
        mime: 'application/pdf', ext: 'pdf', imagen: false,
        coincide: b => b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-'
    }
];

function detectarTipo(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    const firma = FIRMAS.find(f => f.coincide(buffer));
    return firma ? { mime: firma.mime, ext: firma.ext, imagen: firma.imagen } : null;
}

module.exports = { detectarTipo };
