const { test } = require('ava');

const validators = require('../src/error-handling');
const dummyData = require('./dummy-data/pass.json');

test('successfully grabs files from directory', async function (test) {
  const files = await validators.validatePathName('./test/dummy-data');
  const expectedFiles = ['pass.json', 'fail-1.json', 'fail-2.json'];
  test.deepEqual(files.sort(), expectedFiles.sort());
});

test('throws error if no directory specified', async function (test) {
  try {
    await validators.validatePathName();
    test.fail('Should have thrown error');
  } catch (err) {
    test.is(err.name.startsWith('TypeError'), true);
    test.is(err.subMessage, `Must include a directory name in the command 'convert-json-schemas-to-graphql-types <directory-name>'`);
  }
});

test('throws error if invalid directory is specified', async function (test) {
  const pathName = 'INVALID';
  try {
    await validators.validatePathName(pathName);
    test.fail('Should have thrown error');
  } catch (err) {
    test.is(err.errno, -2);
    test.is(err.subMessage, `The path name "${pathName}" is not a valid directory`);
  }
});

test('should return json data from .json file', async function (test) {
  const file = await validators.validateJSONSyntax('pass.json', './test/dummy-data');
  test.is(file['$id'], dummyData['$id']);
  test.is(file.type, dummyData.type);
  test.deepEqual(file.properties, dummyData.properties);
});

test('throws error if files are not all .json', async function (test) {
  const directory = './src';
  try {
    await validators.validateJSONSyntax('converter.js', directory);
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message, `All files in directory must have .json extension`);
    test.is(err.subLocation, `./src/converter.js`);
  }

  try {
    await validators.validateJSONSyntax('converter.js', `${directory}/`);
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message, `All files in directory must have .json extension`);
    test.is(err.subLocation, `./src/converter.js`);
  }
});

test('throws error if .json file is an Array containing an invalid schema', async function (test) {
  const file = 'fail-1.json';
  const directory = './test/dummy-data';
  try {
    await validators.validateJSONSyntax(file, directory);
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message, 'Each entry in the JSON array must be an object type');
    test.is(err.subMessage, `Check element with index 1 in file ${file}`);
  }

  try {
    await validators.validateJSONSyntax(file, `${directory}/`);
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message, 'Each entry in the JSON array must be an object type');
    test.is(err.subMessage, `Check element with index 1 in file ${file}`);
  }
});

test('throws error if json syntax is incorrect', async function (test) {
  const file = 'fail-2.json';
  try {
    await validators.validateJSONSyntax(file, './test/dummy-data');
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message.startsWith('Unexpected token'), true);
    test.is(err.subMessage, `Invalid JSON syntax in file '${file}'`);
    test.is(err.subLocation, `./test/dummy-data/${file}`);
  }

  try {
    await validators.validateJSONSyntax(file, './test/dummy-data/');
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message.startsWith('Unexpected token'), true);
    test.is(err.subMessage, `Invalid JSON syntax in file '${file}'`);
    test.is(err.subLocation, `./test/dummy-data/${file}`);
  }
});

test('throws error if typeName is not defined', function (test) {
  const badSchema = {
    type: 'string'
  };
  const typeName = badSchema.id;

  try {
    validators.validateTopLevelId(typeName, badSchema);
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message, `JSON-Schema must have a key 'id' or '$id' to identify the top-level schema`);
    test.is(err.subLocation, `JSON file starting with ${JSON.stringify(badSchema).substring(0, 25)}...`);
  }
});

test('throws error if top-level type is not object', function (test) {
  const badSchema = {
    id: 'some-id',
    type: 'string'
  };
  const typeName = badSchema.id;

  try {
    validators.validateTopLevelId(typeName, badSchema);
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message, `Top-level type must be 'object', not '${badSchema.type}'`);
    test.is(err.subLocation, `JSON file starting with ${JSON.stringify(badSchema).substring(0, 25)}...`);
  }
});

test('throws error if a normalized type name is not a valid GraphQL type name', function (test) {
  const badTypeName = 'boo(k';
  const normalizedBadTypeName = 'Boo(k';
  try {
    validators.validateTypeName(badTypeName, normalizedBadTypeName);
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message, `The id of ${badTypeName} does not convert into a valid GraphQL type name`);
    test.is(err.subMessage, `The ID or .json file-name must match the regular expression /^[_a-zA-Z][_a-zA-Z0-9]*$/ but ${normalizedBadTypeName} does not`);
  }
});

test('throws error if definitions have no type defined', function (test) {
  const badSchema = {
    id: 'badSchema',
    type: 'object',
    definitions: {
      attribute: 'noType',
      properties: {
        attribute: {
          type: 'string'
        }
      }
    },
    properties: {
      attribute: {
        type: 'string'
      }
    }
  };

  try {
    validators.validateDefinitions(badSchema.definitions);
    test.fail('Should throw error');
  } catch (err) {
    test.is(err.message, `Each key in definitions must have a declared type`);
    test.is(err.subLocation, `Definition for "attribute" schema`);
  }
});
