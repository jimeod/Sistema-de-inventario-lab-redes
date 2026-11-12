const { ErrorNegocio } = require('./errors');


const CAMPOS = ['existencias', 'disponibles', 'prestados', 'reservados', 'danados', 'libres'];

const entero = v => (Number.isInteger(v) && v >= 0 ? v : 0);


function contadores(articulo) {
    const disponibles = entero(articulo.disponibles);
    const reservados = entero(articulo.reservados);
    return {
        existencias: entero(articulo.existencias),
        disponibles,
        prestados: entero(articulo.prestados),
        reservados,
        danados: entero(articulo.danados),
        libres: Math.max(disponibles - reservados, 0)
    };
}

function exigirCantidad(n) {
    if (!Number.isInteger(n) || n <= 0) {
        throw new ErrorNegocio('La cantidad debe ser un entero positivo');
    }
}


function reservar(c, n, nombre = 'el artículo') {
    exigirCantidad(n);
    if (n > c.libres) {
        throw new ErrorNegocio(
            `Existencias libres insuficientes para ${nombre}. Libres: ${c.libres}`, 409
        );
    }
    return { ...c, reservados: c.reservados + n, libres: c.libres - n };
}


function liberar(c, n, nombre = 'el artículo') {
    exigirCantidad(n);
    if (n > c.reservados) {
        throw new ErrorNegocio(`Reservas inconsistentes para ${nombre}`, 409);
    }
    return { ...c, reservados: c.reservados - n, libres: c.libres + n };
}


function entregar(c, n, tipo, conReserva, nombre = 'el artículo') {
    exigirCantidad(n);
    const r = { ...c };
    if (conReserva) {
        if (n > r.reservados) throw new ErrorNegocio(`Reservas inconsistentes para ${nombre}`, 409);
        r.reservados -= n;
    } else if (n > r.libres) {
        throw new ErrorNegocio(
            `Existencias libres insuficientes para ${nombre}. Libres: ${r.libres}`, 409
        );
    }
    r.disponibles -= n;
    r.libres = r.disponibles - r.reservados;
    if (tipo === 'PRESTABLE') r.prestados += n;
    else r.existencias -= n;
    return r;
}


function devolver(c, n, { buenas, danadas, faltantes }, nombre = 'el artículo') {
    if (buenas + danadas + faltantes !== n) {
        throw new ErrorNegocio(
            `Para ${nombre} buenas + dañadas + faltantes debe ser ${n}`
        );
    }
    if (n > c.prestados) throw new ErrorNegocio(`Préstamos inconsistentes para ${nombre}`, 409);
    const r = { ...c };
    r.prestados -= n;
    r.disponibles += buenas;
    r.danados += danadas;
    r.existencias -= faltantes;
    r.libres = r.disponibles - r.reservados;
    return r;
}

module.exports = { CAMPOS, contadores, reservar, liberar, entregar, devolver };
