const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(ajv);

// Cache compiled validators
const validators = {};

// Load contract schema and return middleware
function validate(schemaPath) {
  return (req, res, next) => {
    if (!validators[schemaPath]) {
      const schema = require(schemaPath);
      validators[schemaPath] = ajv.compile(schema);
    }

    const valid = validators[schemaPath](req.body);
    if (!valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validators[schemaPath].errors
      });
    }
    next();
  };
}

module.exports = { validate, ajv };
