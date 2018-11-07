const path = require('path');
const fs = require('fs-extra');

// Directory-name must exist, and Directory-name must point to valid directory
async function validatePathName (dir) {
  try {
    const files = await fs.readdir(dir);
    return files;
  } catch (err) {
    if (err.name === 'TypeError [ERR_INVALID_ARG_TYPE]') {
      err.subMessage = `Must include a directory name in the command 'convert-json-schemas-to-graphql-types <directory-name>'`;
    }

    if (err.errno === -2) {
      err.subMessage = `The path name "${err.path}" is not a valid directory`;
    }

    throw err;
  }
}

// Each file must have .json extension, and each file must be syntactically correct, and no file is an array of schema
async function validateJSONSyntax (file, dir) {
  if (path.extname(file) !== '.json') {
    const err = new TypeError(`All files in directory must have .json extension`);
    err.subLocation = `${dir}/${file}`;
    throw err;
  }

  try {
    const fileContent = await fs.readFile(path.join(dir, file));
    const parsedFileContent = JSON.parse(fileContent);
    if (JSON.stringify(parsedFileContent).startsWith('[')) {
      const err = new TypeError(`File '${file}' contents cannot start with '[' character`);
      err.subMessage = `Each file must only include only one json-schema, not an array of schema`;
      err.subLocation = `${dir}/${file}`;
      throw err;
    }

    return parsedFileContent;
  } catch (err) {
    if (err.subMessage) throw err; // Specific error from above
    err.subMessage = `Invalid JSON syntax in file '${file}'`;
    err.subLocation = `${dir}/${file}`;
    throw err;
  }
}

// Schema must contain an id or $id key to give it a graphQL type name, and top-level schema must be object type
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

// If there are definitions, each definition must have a type defined
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
