const {test} = require('ava');
const Ajv = require('ajv');
const {INPUT_SUFFIX, newContext, convert, UnknownTypeReference, getConvertEnumFromGraphQLCode} = require('../src/converter');
const {
  parse, execute, buildSchema, printSchema,
  GraphQLSchema, GraphQLObjectType, introspectionQuery
} = require('graphql');
const tmp = require('tmp-promise');
const fs = require('fs-extra');

function cannonicalize (introspectionResult) {
  introspectionResult.data.__schema.directives.sort(function (a, b) {
    return a.name < b.name;
  });

  for (const type of introspectionResult.data.__schema.types) {
    if (type.fields) {
      type.fields.sort(function (a, b) {
        return a.name < b.name;
      });
    }
    if (type.inputFields) {
      type.inputFields.sort(function (a, b) {
        return a.name < b.name;
      });
    }
  }
  return introspectionResult;
}

function makeSchemaForType (output, input) {
  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      findOne: { type: output }
    }
  });

  const mutationType = input ? new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      create: {
        args: {input: {type: input}},
        type: output
      }
    }
  }) : undefined;

  return new GraphQLSchema({query: queryType, mutation: mutationType});
}

async function compareSchemas (test, schema, expectedSchema) {
  const introspection = await execute({
    schema,
    document: parse(introspectionQuery)
  });

  const expectedIntrospection = await execute({
    schema: expectedSchema,
    document: parse(introspectionQuery)
  });

  test.deepEqual(cannonicalize(introspection), cannonicalize(expectedIntrospection));
}

async function testConversion (test, jsonSchema, expectedTypeName, expectedType, context, options = {}) {
  if (!options.skipValidation) {
    const ajv = new Ajv({schemaId: 'auto'});
    ajv.addSchema(jsonSchema);
  }

  context = context || newContext();
  const {output, input} = convert(context, jsonSchema);
  const schema = makeSchemaForType(output, options.skipInput ? undefined : input);

  const expectedSchema = buildSchema(`
    ${expectedType}
    type Query {
      findOne: ${expectedTypeName}
    }

    ${options.skipInput ? '' : `
    type Mutation {
      create(input: ${expectedTypeName}${INPUT_SUFFIX}): ${expectedTypeName}
    }`}
  `);

  compareSchemas(test, schema, expectedSchema);
}

test('empty object', async function (test) {
  const emptyType = {
    id: 'Empty',
    type: 'object',
    properties: { }
  };

  const expectedType = `type Empty {
    _typesWithoutFieldsAreNotAllowed_: String
  }
  input Empty${INPUT_SUFFIX} {
    _typesWithoutFieldsAreNotAllowed_: String
  }
  `;

  await testConversion(test, emptyType, 'Empty', expectedType);
});

async function testAttrbuteType (test, jsonType, graphQLType, options) {
  const simpleType = {
    id: 'Simple',
    type: 'object',
    properties: {
      attribute: {type: jsonType}
    }
  };

  const expectedType = `
  type Simple {
    attribute: ${graphQLType}
  }
  input Simple${INPUT_SUFFIX} {
    attribute: ${graphQLType}
  }
  `;

  await testConversion(test, simpleType, 'Simple', expectedType, undefined, options);
}

test('string attributes', async function (test) {
  await testAttrbuteType(test, 'string', 'String');
});

test('integer attributes', async function (test) {
  await testAttrbuteType(test, 'integer', 'Int');
});

test('float attributes', async function (test) {
  await testAttrbuteType(test, 'number', 'Float');
});

test('boolean attributes', async function (test) {
  await testAttrbuteType(test, 'boolean', 'Boolean');
});

test('fail on unknown types attributes', async function (test) {
  const assertion = testAttrbuteType(test, 'unknown', 'unknown', {skipValidation: true});
  await test.throws(assertion, 'A JSON Schema attribute type unknown on attribute Simple.attribute does not have a known GraphQL mapping');
});

test('array attributes', async function (test) {
  const simpleType = {
    id: 'Array',
    type: 'object',
    properties: {
      attribute: {
        type: 'array',
        items: {
          type: 'integer'
        }
      }
    }
  };

  const expectedType = `type Array {
    attribute: [Int!]
  }

  input Array${INPUT_SUFFIX} {
    attribute: [Int!]
  }
  `;

  await testConversion(test, simpleType, 'Array', expectedType);
});

test('array of objects', async function (test) {
  const simpleType = {
    id: 'Array',
    type: 'object',
    properties: {
      attribute: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            firstAttribute: {
              type: 'integer'
            }
          }
        }
      }
    }
  };

  const expectedType = `
    type ArrayAttributeItem {
      firstAttribute: Int
    }
    type Array {
      attribute: [ArrayAttributeItem!]
    }

    input ArrayAttributeItem${INPUT_SUFFIX} {
      firstAttribute: Int
    }
    input Array${INPUT_SUFFIX} {
      attribute: [ArrayAttributeItem${INPUT_SUFFIX}!]
    }
  `;

  await testConversion(test, simpleType, 'Array', expectedType);
});

test('object attribute', async function (test) {
  const simpleType = {
    id: 'Object',
    type: 'object',
    properties: {
      attribute: {
        type: 'object',
        properties: {
          firstField: {
            type: 'integer'
          },
          secondField: {
            type: 'integer'
          }
        }
      }
    }
  };

  const expectedType = `
  type ObjectAttribute {
    firstField: Int
    secondField: Int
  }
  input ObjectAttribute${INPUT_SUFFIX} {
    firstField: Int
    secondField: Int
  }
  type Object {
    attribute: ObjectAttribute
  }

  input Object${INPUT_SUFFIX} {
    attribute: ObjectAttribute${INPUT_SUFFIX}
  }
  `;

  await testConversion(test, simpleType, 'Object', expectedType);
});

test('$id attribute', async function (test) {
  const simpleType = {
    '$id': 'Simple',
    type: 'object',
    properties: {
      attribute: {
        type: 'string'
      }
    }
  };

  const expectedType = `
  type Simple {
    attribute: String
  }
  input Simple${INPUT_SUFFIX} {
    attribute: String
  }
  `;

  await testConversion(test, simpleType, 'Simple', expectedType);
});

test('required attributes', async function (test) {
  const simpleType = {
    id: 'Array',
    type: 'object',
    properties: {
      attribute1: {
        type: 'integer'
      },
      attribute2: {
        type: 'integer'
      },
      attribute3: {
        type: 'integer'
      }
    },
    required: ['attribute1', 'attribute3']
  };

  const expectedType = `type Array {
    attribute1: Int!
    attribute2: Int
    attribute3: Int!
  }

  input Array${INPUT_SUFFIX} {
    attribute1: Int!
    attribute2: Int
    attribute3: Int!
  }
  `;

  await testConversion(test, simpleType, 'Array', expectedType);
});

test('Unknown $ref attribute type', async function (test) {
  const simpleType = {
    id: 'Ref',
    type: 'object',
    properties: {
      attribute: {
        $ref: 'UnknownType'
      }
    }
  };

  const expectedType = `type Ref {
    attribute: UnknownType
  }`;

  const schema = testConversion(test, simpleType, 'Ref', expectedType);
  await test.throws(schema, UnknownTypeReference);
});

test('Unknown $ref attribute type from external URI', async function (test) {
  const simpleType = {
    id: 'Ref',
    type: 'object',
    properties: {
      attribute: {
        $ref: 'http://UnknownType.schema.json'
      }
    }
  };

  const expectedType = `type Ref {
    attribute: UnknownType
  }`;

  const schema = testConversion(test, simpleType, 'Ref', expectedType);
  await test.throws(schema, UnknownTypeReference);
});

test('Known $ref attribute type', async function (test) {
  const otherType = {
    id: 'OtherType',
    type: 'object',
    properties: {
      attribute: {
        type: 'string'
      }
    }
  };

  const refType = {
    id: 'Ref',
    type: 'object',
    properties: {
      attribute: {
        $ref: 'OtherType'
      }
    }
  };

  const expectedType = `
  type OtherType {
    attribute: String
  }

  input OtherType${INPUT_SUFFIX} {
    attribute: String
  }

  type Ref {
    attribute: OtherType
  }

  input Ref${INPUT_SUFFIX} {
    attribute: OtherType${INPUT_SUFFIX}
  }`;

  const context = newContext();
  convert(context, otherType);
  await testConversion(test, refType, 'Ref', expectedType, context);
});

test('Known $ref array attribute type', async function (test) {
  const otherType = {
    id: 'OtherType',
    type: 'object',
    properties: {
      attribute: {
        type: 'string'
      }
    }
  };

  const refType = {
    id: 'Ref',
    type: 'object',
    properties: {
      attribute: {
        type: 'array',
        items: {
          $ref: 'OtherType'
        }
      }
    }
  };

  const expectedType = `
  type OtherType {
    attribute: String
  }

  input OtherType${INPUT_SUFFIX} {
    attribute: String
  }

  type Ref {
    attribute: [OtherType!]
  }

  input Ref${INPUT_SUFFIX} {
    attribute: [OtherType${INPUT_SUFFIX}!]
  }`;

  const context = newContext();
  convert(context, otherType);
  await testConversion(test, refType, 'Ref', expectedType, context);
});

test('Circular $ref attribute types', async function (test) {
  const leftType = {
    id: 'Left',
    type: 'object',
    properties: {
      right: {
        $ref: 'Right'
      }
    }
  };

  const rightType = {
    id: 'Right',
    type: 'object',
    properties: {
      left: {
        $ref: 'Left'
      }
    }
  };

  const expectedType = `
  type Right {
    left: Left
  }

  type Left {
    right: Right
  }

  input Right${INPUT_SUFFIX} {
    left: Left${INPUT_SUFFIX}
  }

  input Left${INPUT_SUFFIX}{
    right: Right${INPUT_SUFFIX}
  }
  `;

  const context = newContext();
  convert(context, rightType);
  await testConversion(test, leftType, 'Left', expectedType, context);
});

test('Enumeration attribute types', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      height: {
        type: 'string',
        enum: ['tall', 'average', 'short']
      }
    }
  };

  const expectedType = `
  enum PersonHeight {
    tall, average, short
  }
  type Person {
    height: PersonHeight
  }
  input Person${INPUT_SUFFIX} {
    height: PersonHeight
  }`;

  const context = newContext();
  await testConversion(test, personType, 'Person', expectedType, context);
});

test('Enumeration attribute with forbidden characters', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      height: {
        type: 'string',
        enum: ['super-tall', 'average', 'really-really-short']
      }
    }
  };

  const expectedType = `
  enum PersonHeight {
    super_tall, average, really_really_short
  }
  type Person {
    height: PersonHeight
  }
  input Person${INPUT_SUFFIX} {
    height: PersonHeight
  }`;

  const context = newContext();
  await testConversion(test, personType, 'Person', expectedType, context);
});

test('Enumeration attribute with comparison symbols', async function (test) {
  const personType = {
    id: 'Comparator',
    type: 'object',
    properties: {
      operator: {
        type: 'string',
        enum: ['<', '<=', '>=', '>']
      }
    }
  };

  const expectedType = `
  enum ComparatorOperator {
    LT, LTE, GTE, GT
  }
  type Comparator {
    operator: ComparatorOperator
  }
  input Comparator${INPUT_SUFFIX} {
    operator: ComparatorOperator
  }`;

  const context = newContext();
  await testConversion(test, personType, 'Comparator', expectedType, context);
});

test('Enumeration attribute with numeric keys', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      age: {
        type: 'string',
        enum: ['1', '10', '100']
      }
    }
  };

  const expectedType = `
  enum PersonAge {
    VALUE_1, VALUE_10, VALUE_100
  }
  type Person {
    age: PersonAge
  }
  input Person${INPUT_SUFFIX} {
    age: PersonAge
  }
  `;

  const context = newContext();
  await testConversion(test, personType, 'Person', expectedType, context);
});

test('Enumeration attribute with unsupported type', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      age: {
        type: 'integer',
        enum: [1, 2, 3]
      }
    }
  };

  const context = newContext();
  const assertion = testConversion(test, personType, 'Person', null, context);
  await test.throws(assertion, 'The attribute Person.age not supported because only conversion of string based enumertions are implemented');
});

test('Enumeration conversion function', async function (test) {
  const personType = {
    id: 'Person',
    type: 'object',
    properties: {
      age: {
        type: 'string',
        enum: ['1', '10', '100']
      }
    }
  };

  const context = newContext();
  const {output, input} = convert(context, personType);
  // Make a schema an print it just to force the field 'thunks'
  // to be resolved
  const schema = makeSchemaForType(output, input);
  printSchema(schema);

  const convertCode = getConvertEnumFromGraphQLCode(context, 'Person.age');

  const convertModule = await tmp.file();
  // It is ok to ignore this non-literal require because the path is coming from
  // the temp file creation code above.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.writeFile(convertModule.fd, `module.exports = ${convertCode}`);
  // It is ok to ignore this non-literal require because the path is coming from
  // the temp file creation code above.
  // eslint-disable-next-line security/detect-non-literal-require
  const fromGraphQl = require(convertModule.path);
  test.is(fromGraphQl('VALUE_1'), '1');
  test.is(fromGraphQl('VALUE_10'), '10');
  test.is(fromGraphQl('VALUE_100'), '100');
});

test('map switch schemas to unions', async function (test) {
  const parentType = {
    id: 'Parent',
    type: 'object',
    properties: {
      type: {
        type: 'string'
      },
      name: {
        type: 'string'
      }
    }
  };

  const childType = {
    id: 'Child',
    type: 'object',
    properties: {
      type: {
        type: 'string'
      },
      name: {
        type: 'string'
      },
      parent: {
        $ref: 'Parent'
      },
      bestFriend: {
        $ref: 'ParentOrChild'
      },
      friends: {
        type: 'array',
        items: {
          $ref: 'ParentOrChild'
        }
      }
    }
  };

  const unionType = {
    id: 'ParentOrChild',
    type: 'object',
    switch: [
      {
        if: {
          properties: {
            type: {
              constant: 'Parent'
            }
          }
        },
        then: {
          $ref: 'Parent'
        }
      },
      {
        if: {
          properties: {
            type: {
              constant: 'Child'
            }
          }
        },
        then: {
          $ref: 'Child'
        }
      }
    ]
  };

  const expectedType = `
  type Parent {
    name: String
    type: String
  }
  type Child {
    name: String
    type: String
    parent: Parent
    bestFriend: ParentOrChild
    friends: [ParentOrChild!]
  }
  union ParentOrChild = Parent | Child
  input Parent${INPUT_SUFFIX} {
    name: String
    type: String
  }
  input Child${INPUT_SUFFIX} {
    name: String
    type: String
    parent: Parent${INPUT_SUFFIX}
  }
  `;

  const context = newContext();
  convert(context, unionType);
  convert(context, parentType);
  await testConversion(test, childType, 'Child', expectedType, context);
});

test('definitions refs', async function (test) {
  const type = {
    id: 'Ref',
    type: 'object',
    definitions: {
      otherType: {
        type: 'object',
        properties: {
          attribute: {
            type: 'string'
          }
        }
      }
    },
    properties: {
      attribute: {
        $ref: '#/definitions/otherType'
      }
    }
  };

  const expectedType = `
  type DefinitionOtherType {
    attribute: String
  }

  input DefinitionOtherType${INPUT_SUFFIX} {
    attribute: String
  }

  type Ref {
    attribute: DefinitionOtherType
  }

  input Ref${INPUT_SUFFIX} {
    attribute: DefinitionOtherType${INPUT_SUFFIX}
  }`;

  const context = newContext();
  await testConversion(test, type, 'Ref', expectedType, context);
});

test('oneOf', async function (test) {
  const type = {
    id: 'OneOf',
    type: 'object',
    properties: {
      anAttribute: { type: 'string' },
      attribute: {
        oneOf: [
          {
            type: 'object',
            properties: {
              first: { type: 'string' }
            }
          },
          {
            type: 'object',
            properties: {
              second: { type: 'string' }
            }
          }
        ]
      }
    }
  };

  const expectedType = `
    type OneOfAttributeSwitch0 {
      first: String
    }
    type OneOfAttributeSwitch1 {
      second: String
    }
    union OneOfAttribute = OneOfAttributeSwitch0 | OneOfAttributeSwitch1
    type OneOf {
      anAttribute: String
      attribute: OneOfAttribute
    }
    input OneOfIn {
      anAttribute: String
    }
  `;

  const context = newContext();
  await testConversion(test, type, 'OneOf', expectedType, context);
});

test('oneOf $ref', async function (test) {
  const type = {
    id: 'OneOf',
    type: 'object',
    definitions: {
      first: {
        type: 'object',
        properties: {
          first: { type: 'string' }
        }
      },
      second: {
        type: 'object',
        properties: {
          second: { type: 'string' }
        }
      }
    },
    properties: {
      anAttribute: { type: 'string' },
      attribute: {
        oneOf: [
          {
            $ref: '#/definitions/first'
          },
          {
            $ref: '#/definitions/second'
          }
        ]
      }
    }
  };

  const expectedType = `
    type DefinitionFirst {
      first: String
    }
    type DefinitionSecond {
      second: String
    }
    union OneOfAttribute = DefinitionFirst | DefinitionSecond
    type OneOf {
      anAttribute: String
      attribute: OneOfAttribute
    }
    input OneOfIn {
      anAttribute: String
    }
  `;

  const context = newContext();
  await testConversion(test, type, 'OneOf', expectedType, context);
});
