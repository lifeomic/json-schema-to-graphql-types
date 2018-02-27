const {
  GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLNonNull,
  GraphQLInputObjectType, GraphQLFloat, GraphQLList, GraphQLBoolean, GraphQLEnumType
} = require('graphql');
const isEmpty = require('lodash/isEmpty');
const keyBy = require('lodash/keyBy');
const mapValues = require('lodash/mapValues');
const map = require('lodash/map');
const includes = require('lodash/includes');
const uppercamelcase = require('uppercamelcase');
const camelcase = require('camelcase');
const escodegen = require('escodegen');

const INPUT_SUFFIX = 'In';

function mapBasicAttributeType (type, attributeName) {
  switch (type) {
    case 'string': return GraphQLString;
    case 'integer': return GraphQLInt;
    case 'number': return GraphQLFloat;
    case 'boolean': return GraphQLBoolean;
    default: throw new Error(`A JSON Schema attribute type ${type} on attribute ${attributeName} does not have a known GraphQL mapping`);
  }
}

function toSafeEnumKey (value) {
  if (/^[0-9]/.test(value)) {
    value = 'VALUE_' + value;
  }
  return value.replace(/[^_a-zA-Z0-9]/g, '_');
}

function buildEnumType (context, attributeName, enumValues) {
  const enumName = uppercamelcase(attributeName);
  const graphqlToJsonMap = keyBy(enumValues, toSafeEnumKey);

  context.enumMaps.set(attributeName, graphqlToJsonMap);
  const enumType = new GraphQLEnumType({
    name: enumName,
    values: mapValues(graphqlToJsonMap, function (value) {
      return {value};
    })
  });

  context.enumTypes.set(attributeName, enumType);
  return enumType;
}

function mapType (context, attributeDefinition, attributeName, buildingInputType) {
  if (attributeDefinition.type === 'array') {
    const elementType = mapType(context, attributeDefinition.items, attributeName, buildingInputType);
    return GraphQLList(GraphQLNonNull(elementType));
  }

  const enumValues = attributeDefinition.enum;
  if (enumValues) {
    if (attributeDefinition.type !== 'string') {
      throw new Error(`The attribute ${attributeName} not supported because only conversion of string based enumertions are implemented`);
    }

    const existingEnum = context.enumTypes.get(attributeName);
    if (existingEnum) {
      return existingEnum;
    }
    return buildEnumType(context, attributeName, enumValues);
  }

  const typeReference = attributeDefinition.$ref;
  if (typeReference) {
    const typeMap = buildingInputType ? context.inputs : context.types;
    const referencedType = typeMap.get(typeReference);
    if (!referencedType) {
      throw new UnknownTypeReference(`The referenced type ${typeReference} is unknown`);
    }
    return referencedType;
  }

  return mapBasicAttributeType(attributeDefinition.type, attributeName);
}

function fieldsFromSchema (context, parentTypeName, schema, buildingInputType) {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString
      }
    };
  }

  return mapValues(schema.properties, function (attributeDefinition, attributeName) {
    const qualifiedAttributeName = `${parentTypeName}.${attributeName}`;
    const type = mapType(context, attributeDefinition, qualifiedAttributeName, buildingInputType);
    const modifiedType = includes(schema.required, attributeName) ? GraphQLNonNull(type) : type;
    return {type: modifiedType};
  });
}

function convert (context, schema) {
  const typeName = schema.id || schema.title;
  const graphQlType = new GraphQLObjectType({
    name: typeName,
    fields: () => fieldsFromSchema(context, typeName, schema)
  });

  const graphQlInputType = new GraphQLInputObjectType({
    name: typeName + INPUT_SUFFIX,
    fields: () => fieldsFromSchema(context, typeName, schema, true)
  });

  if (schema.id) {
    context.types.set(typeName, graphQlType);
    context.inputs.set(typeName, graphQlInputType);
  }

  return {output: graphQlType, input: graphQlInputType};
}

function newContext () {
  return {
    types: new Map(),
    inputs: new Map(),
    enumTypes: new Map(),
    enumMaps: new Map()
  };
}

class UnknownTypeReference extends Error {
  constructor (message) {
    super(message);
    this.name = 'UnknownTypeReference';
  }
}

function getConvertEnumFromGraphQLCode (context, attributePath) {
  const valueMap = context.enumMaps.get(attributePath);

  const cases = map(valueMap, function (jsonValue, graphQlValue) {
    return {
      type: 'SwitchCase',
      test: {type: 'Literal', value: graphQlValue},
      consequent: [{
        type: 'ReturnStatement',
        argument: {type: 'Literal', value: jsonValue}
      }]
    };
  });

  const functionName = camelcase(`convert${attributePath}FromGraphQL`);

  const valueIdentifier = { type: 'Identifier', name: 'value' };
  return escodegen.generate({
    type: 'FunctionDeclaration',
    id: { type: 'Identifier', name: functionName },
    params: [ valueIdentifier ],
    body: {
      type: 'BlockStatement',
      body: [ {
        type: 'SwitchStatement',
        discriminant: valueIdentifier,
        cases
      }]
    }
  });
}

module.exports = {
  INPUT_SUFFIX,
  UnknownTypeReference,
  newContext,
  convert,
  getConvertEnumFromGraphQLCode
};
