const path = require('path');
const fs = require('fs-extra');

function validatePathName (dir) {
  return fs.readdir(dir)
    .then(function (res) {
      return Promise.resolve(res);
    })
    .catch(function (err) {
      if (err.name === 'TypeError [ERR_INVALID_ARG_TYPE]') {
        err.displayMessage = `Must include a directory name in the command 'convert-json-schemas-to-graphql-types <directory-name>'`;
        err.specific = true;
      } else if (err.errno === -2) {
        err.displayMessage = `The path name '${err.path}' is not a valid directory`;
        err.specific = true;
      }

      throw err;
    });
}

function validateJSONSyntax (file, dir) {
  // Files must be .json
  if (path.extname(file) !== '.json') {
    const err = new TypeError();
    err.displayMessage = `All files in directory must have .json extension`;
    err.location = `${dir + file}`;
    err.specific = true;
    throw err;
  }

  return fs.readFile(path.join(dir, file))
    .then(function (fileContent) {
      const parsedFileContent = JSON.parse(fileContent);
      if (JSON.stringify(parsedFileContent).startsWith('[')) {
        const err = new TypeError(`File '${file}' contents cannot start with '[' character`);
        err.displayMessage = `Each file must only include only one json-schema, not an array of schema`;
        err.location = `${dir + file}`;
        err.specific = true;
        throw err;
      }

      return Promise.resolve(parsedFileContent);
    })
    .catch(function (err) {
      if (err.specific) throw err; // Specific error from above
      err.displayMessage = `Invalid JSON syntax in file '${file}'`;
      err.location = `${dir + file}`;
      err.specific = true;
      throw err;
    });
}

module.exports = {
  validatePathName,
  validateJSONSyntax
};
