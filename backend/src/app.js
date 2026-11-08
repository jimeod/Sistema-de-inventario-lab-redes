const express = require('express');
const cors = require('cors');

const articulosRoutes = require('./routes/articulos.routes');

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

module.exports = app;