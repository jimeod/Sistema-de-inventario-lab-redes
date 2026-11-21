const { ErrorNegocio } = require('../utils/errors');

// Limitador simple en memoria, por IP. Suficiente para una sola instancia del servidor;
// si algún día corres varias, conviene moverlo a un almacén compartido (p. ej. Redis).
function limitarPeticiones({ ventanaMs, maximo, mensaje }) {
    const registros = new Map();

    setInterval(() => {
        const ahora = Date.now();
        for (const [clave, r] of registros) {
            if (r.reinicio <= ahora) registros.delete(clave);
        }
    }, ventanaMs).unref();

    return (req, res, next) => {
        const ahora = Date.now();
        const clave = req.ip;

        let r = registros.get(clave);
        if (!r || r.reinicio <= ahora) {
            r = { cuenta: 0, reinicio: ahora + ventanaMs };
            registros.set(clave, r);
        }

        r.cuenta += 1;
        if (r.cuenta > maximo) {
            res.set('Retry-After', String(Math.ceil((r.reinicio - ahora) / 1000)));
            return next(new ErrorNegocio(mensaje, 429));
        }
        next();
    };
}

module.exports = { limitarPeticiones };
