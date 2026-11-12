function escribir(nivel, mensaje, extra = {}) {
    const linea = JSON.stringify({
        fecha: new Date().toISOString(),
        nivel,
        mensaje,
        ...extra
    });
    (nivel === 'error' ? process.stderr : process.stdout).write(linea + '\n');
}

module.exports = {
    info: (mensaje, extra) => escribir('info', mensaje, extra),
    aviso: (mensaje, extra) => escribir('aviso', mensaje, extra),
    error: (mensaje, extra) => escribir('error', mensaje, extra)
};
