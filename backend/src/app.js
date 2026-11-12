const express = require('express');
const cors = require('cors');

const articulosRoutes = require('./routes/articulos.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const solicitudesRoutes = require('./routes/solicitudes.routes');
const authRoutes = require('./routes/auth.routes');
const movimientosRoutes = require('./routes/movimientos.routes');
const {
    inicializarBody, rutaNoEncontrada, manejarErrores
} = require('./middlewares/error.middleware');

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(inicializarBody);

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'API del inventario funcionando correctamente'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/articulos', articulosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/movimientos', movimientosRoutes);


app.use(rutaNoEncontrada);
app.use(manejarErrores);

module.exports = app;
