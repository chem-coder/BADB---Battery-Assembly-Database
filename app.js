const express        = require('express');
const path           = require('path');
const errorHandler   = require('./middleware/errorHandler');
const registerRoutes = require('./routes/index');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

registerRoutes(app);
app.use(errorHandler);

module.exports = app;
