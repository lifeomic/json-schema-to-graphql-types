const {GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLFloat, GraphQLList} = require('graphql');
const isEmpty = require('lodash/isEmpty');
const mapValues = require('lodash/mapValues');

function mapBasicAttributeType (type) {
  switch (type) {
    case 'string': return GraphQLString;
    case 'integer': return GraphQLInt;
    case 'number': return GraphQLFloat;
    default: throw new Error(`A JSON Schema attribute type ${type} does not have a known GraphQL mapping`);
  }
}

function fieldsFromSchema (schema) {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString
      }
    };
  }

  return mapValues(schema.properties, function (attributeDefinition, key) {
    if (attributeDefinition.type === 'array') {
      const elementType = mapBasicAttributeType(attributeDefinition.items.type);
      return {
        type: GraphQLList(elementType)
      };
    }

    return {type: mapBasicAttributeType(attributeDefinition.type)};
  });
}

function convert (schema) {
  return new GraphQLObjectType({
    name: schema.id || schema.title,
    fields: fieldsFromSchema(schema)
  });
}

module.exports = convert;
