const { handle } = require('../src/server');

module.exports = (req, res) => {
  handle(req, res);
};
