const path = require('path');
const fs = require('fs-extra');

// Directory-name must exist, and Directory-name must point to valid directory
async function validatePathName (dir) {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    let files = await fs.readdir(dir);

    // recursively validate files within sub-folders
    for (const file of files) {
      const filePathWithPrefix = `${dir}/${file}`;

      // eslint-disable-next-line security/detect-non-literal-fs-filename
      if (fs.lstatSync(filePathWithPrefix).isDirectory()) {
        let newFilesInDirectory = await validatePathName(`${filePathWithPrefix}`);
        newFilesInDirectory = newFilesInDirectory.map((filename) => `${file}/${filename}`);
        files.splice(files.indexOf(file), 1);
        files = files.concat(newFilesInDirectory);
      }
    }

    return files;
  } catch (err) {
    if (err.name.startsWith('TypeError')) {
      err.subMessage = `Must include a directory name in the command 'convert-json-schemas-to-graphql-types <directory-name>'`;
    }

    if (err.errno === -2) {
      err.subMessage = `The path name "${err.path}" is not a valid directory`;
    }

    throw err;
  }
}

// If a file holds an array of schema, each array element must be an object-type
function validateArrayOfSchema (jsonArray, file) {
  jsonArray.forEach(function (schema, index) {
    if (!(schema instanceof Object) || Array.isArray(schema)) {
      const err = new Error('Each entry in the JSON array must be an object type');
      err.subMessage = `Check element with index ${index} in file ${file}`;
      throw err;
    }
  });
}

// Each file must have .json extension, and each file must be syntactically correct
async function validateJSONSyntax (file, dir) {
  if (path.extname(file) !== '.json') {
    const err = new Error(`All files in directory must have .json extension`);
    err.subLocation = dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`;
    throw err;
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const fileContent = await fs.readFile(path.join(dir, file));
    const parsedFileContent = JSON.parse(fileContent);

    if (Array.isArray(parsedFileContent)) {
      validateArrayOfSchema(parsedFileContent, file);
    }

    return parsedFileContent;
  } catch (err) {
    if (err.subMessage) throw err; // Specific error from above
    err.subMessage = `Invalid JSON syntax in file '${file}'`;
    err.subLocation = dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`;
    throw err;
  }
}

// Schema must contain an id or $id key to give it a graphQL type name, and top-level schema must be object type
function validateTopLevelId (typeName, schema) {
  if (!typeName) {
    const err = new Error(`JSON-Schema must have a key 'id' or '$id' to identify the top-level schema`);
    err.subLocation = `JSON schema starting with ${JSON.stringify(schema).substring(0, 25)}...`;
    throw err;
  }

  if (schema.type !== 'object') {
    const err = new Error(`Top-level type must be 'object', not '${schema.type}'`);
    err.subLocation = `JSON schema starting with ${JSON.stringify(schema).substring(0, 25)}...`;
    throw err;
  }
}

function validateTypeName (typeName, normalizedTypeName) {
  if (!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(normalizedTypeName)) {
    const err = new Error(`The id of ${typeName} does not convert into a valid GraphQL type name`);
    err.subMessage = `The ID or .json file-name must match the regular expression /^[_a-zA-Z][_a-zA-Z0-9]*$/ but ${normalizedTypeName} does not`;
    throw err;
  }
}

// If there are definitions, each definition must have a type defined
function validateDefinitions (definitions) {
  for (const key in definitions) {
    // eslint-disable-next-line security/detect-object-injection
    if (!definitions[key].type) {
      const err = new Error(`Each key in definitions must have a declared type`);
      err.subLocation = `Definition for "${key}" schema`;
      throw err;
    }
  }
}

module.exports = {
  validatePathName,
  validateJSONSyntax,
  validateTopLevelId,
  validateTypeName,
  validateDefinitions
};
