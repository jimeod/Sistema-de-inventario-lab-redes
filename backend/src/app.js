const express = require('express');
const cors = require('cors');

const articulosRoutes = require('./routes/articulos.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const solicitudesRoutes = require('./routes/solicitudes.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'API del inventario funcionando correctamente'
    });
});

app.use('/api/articulos', articulosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/solicitudes', solicitudesRoutes);

module.exports = app;