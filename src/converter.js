const {
  GraphQLObjectType, GraphQLString, GraphQLInt,
  GraphQLFloat, GraphQLList, GraphQLBoolean, GraphQLEnumType
} = require('graphql');
const isEmpty = require('lodash/isEmpty');
const keyBy = require('lodash/keyBy');
const toUpper = require('lodash/toUpper');
const mapValues = require('lodash/mapValues');
const uppercamelcase = require('uppercamelcase');

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
  return toUpper(value).replace(/[^_a-zA-Z0-9]/g, '_');
}

function buildEnumType (attributeName, enumValues) {
  const enumName = uppercamelcase(attributeName);
  return new GraphQLEnumType({
    name: enumName,
    values: mapValues(keyBy(enumValues, toSafeEnumKey), function (value) {
      return {value};
    })
  });
}

function mapType (context, attributeDefinition, attributeName) {
  if (attributeDefinition.type === 'array') {
    const elementType = mapType(context, attributeDefinition.items, attributeName);
    return GraphQLList(elementType);
  }

  const enumValues = attributeDefinition.enum;
  if (enumValues) {
    if (attributeDefinition.type !== 'string') {
      throw new Error(`The attribute ${attributeName} not supported because only conversion of string based enumertions are implemented`);
    }

    return buildEnumType(attributeName, enumValues);
  }

  const typeReference = attributeDefinition.$ref;
  if (typeReference) {
    const referencedType = context.types[typeReference];
    if (!referencedType) {
      throw new UnknownTypeReference(`The referenced type ${typeReference} is unknown`);
    }
    return referencedType;
  }

  return mapBasicAttributeType(attributeDefinition.type, attributeName);
}

function fieldsFromSchema (context, parentTypeName, schema) {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString
      }
    };
  }

  return mapValues(schema.properties, function (attributeDefinition, attributeName) {
    const qualifiedAttributeName = `${parentTypeName}.${attributeName}`;
    return {type: mapType(context, attributeDefinition, qualifiedAttributeName)};
  });
}

function convert (context, schema) {
  const typeName = schema.id || schema.title;
  const graphQlType = new GraphQLObjectType({
    name: typeName,
    fields: () => fieldsFromSchema(context, typeName, schema)
  });

  if (schema.id) {
    context.types[schema.id] = graphQlType;
  }

  return graphQlType;
}

function newContext () {
  return {
    types: []
  };
}

class UnknownTypeReference extends Error {
  constructor (message) {
    super(message);
    this.name = 'UnknownTypeReference';
  }
}

module.exports = {
  UnknownTypeReference,
  newContext,
  convert
};
