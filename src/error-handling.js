const path = require('path');
const fs = require('fs-extra');

function validatePathName (dir) {
  return fs.readdir(dir)
    .then(function (res) {
      return Promise.resolve(res);
    })
    .catch(function (err) {
      if (err.name === 'TypeError [ERR_INVALID_ARG_TYPE]') {
        err.subMessage = `Must include a directory name in the command 'convert-json-schemas-to-graphql-types <directory-name>'`;
      } else if (err.errno === -2) {
        err.subMessage = `The path name '${err.path}' is not a valid directory`;
      }

      throw err;
    });
}

function validateJSONSyntax (file, dir) {
  // Files must be .json
  if (path.extname(file) !== '.json') {
    const err = new TypeError(`All files in directory must have .json extension`);
    err.subLocation = `${dir + file}`;
    throw err;
  }

  return fs.readFile(path.join(dir, file))
    .then(function (fileContent) {
      const parsedFileContent = JSON.parse(fileContent);
      if (JSON.stringify(parsedFileContent).startsWith('[')) {
        const err = new TypeError(`File '${file}' contents cannot start with '[' character`);
        err.subMessage = `Each file must only include only one json-schema, not an array of schema`;
        err.subLocation = `${dir + file}`;
        throw err;
      }

      return Promise.resolve(parsedFileContent);
    })
    .catch(function (err) {
      if (err.subMessage) throw err; // Specific error from above
      err.subMessage = `Invalid JSON syntax in file '${file}'`;
      err.subLocation = `${dir + file}`;
      throw err;
    });
}

function validateTopLevelId (typeName, schema) {
  if (!typeName) {
    const err = new ReferenceError(`JSON-Schema must have a key 'id' or '$id' to identify the top-level schema`);
    err.subLocation = `JSON file starting with ${JSON.stringify(schema).substring(0, 25)}...`;
    throw err;
  }

  if (schema.type !== 'object') {
    const err = new SyntaxError(`Top-level type must be 'object', not '${schema.type}'`);
    err.subLocation = `JSON file starting with ${JSON.stringify(schema).substring(0, 25)}...`;
    throw err;
  }
}

function validateDefinitions (definitions) {
  for (const key in definitions) {
    if (!definitions[key].type) {
      const err = new SyntaxError(`Each key in definitions must have a declared type`);
      err.subLocation = `Definition for "${key}" schema`;
      throw err;
    }
  }
}

module.exports = {
  validatePathName,
  validateJSONSyntax,
  validateTopLevelId,
  validateDefinitions
};
