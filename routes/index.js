const express = require('express');
const app = express.Router();

require('./endpoints/User')(app);

module.exports = app;