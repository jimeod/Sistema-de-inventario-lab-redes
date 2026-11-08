class ErrorNegocio extends Error {
    constructor(mensaje, status = 400) {
        super(mensaje);
        this.name = 'ErrorNegocio';
        this.status = status;
    }
}

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ErrorNegocio, asyncHandler };