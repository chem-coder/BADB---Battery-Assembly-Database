const express = require('express');
const pool = require('./db');

const app = express();
const PORT = 3000;

const usersRoutes = require('./routes/users');
const projectsRoutes = require('./routes/projects');
const separatorsRoutes = require('./routes/separators');
const structuresRoutes = require('./routes/structures');
const electrolytesRoutes = require('./routes/electrolytes');
const materialsRoutes = require('./routes/materials');
const recipesRoutes = require('./routes/recipes');
const tapesRoutes = require('./routes/tapes');
const referenceRoutes = require('./routes/reference');
const batteriesRoutes = require('./routes/batteries');
const electrodesRoutes = require('./routes/electrodes');


// middleware
app.use(express.json());    // w/o this, req.body would be undefined
app.use(express.static('public'));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}); 

// connect route modules
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/separators', separatorsRoutes);
app.use('/api/structures', structuresRoutes);
app.use('/api/electrolytes', electrolytesRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/tapes', tapesRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/batteries', batteriesRoutes);
app.use('/api/electrodes', electrodesRoutes);


// quick check - temporary
pool.query('SELECT 1')
  .then(() => console.log('Postgres connected'))
  .catch(err => console.error('Postgres connection error', err));


// ** ~~~~~~~~~~ ** ROUTES ** ~~~~~~~~~~ **
// have been moved to /routes as modules


// Start server
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});