const {GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLFloat} = require('graphql');
const isEmpty = require('lodash/isEmpty');
const mapValues = require('lodash/mapValues');

function mapAttributeType (type) {
  switch (type) {
    case 'string': return GraphQLString;
    case 'integer': return GraphQLInt;
    case 'number': return GraphQLFloat;
    default: throw new Error(`A JSON Schema attribute type ${type} does not have a known GraphQL mapping`);
  };
}

function fieldsFromSchema (schema) {
  if (isEmpty(schema.properties)) {
    return {
      _typesWithoutFieldsAreNotAllowed_: {
        type: GraphQLString
      }
    }; 
  }

  return mapValues(schema.properties, function (type, key) {
    return {type: mapAttributeType(type)};
  });
}

function convert (schema) {
  return new GraphQLObjectType({
    name: schema.title,
    fields: fieldsFromSchema(schema)
  });
}

module.exports = convert;