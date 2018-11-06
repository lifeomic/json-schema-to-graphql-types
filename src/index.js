const { GraphQLSchema, GraphQLObjectType, GraphQLString } = require('graphql');

const { newContext, convert, UnknownTypeReference } = require('./converter');

function convertSchemas (context, schemas) {
  const referencedUnknownType = [];
  let successful = 0;
  for (const schema of schemas) {
    try {
      convert(context, schema);
      successful++;
    } catch (error) {
      if (error instanceof UnknownTypeReference) {
        console.error(error);
        referencedUnknownType.push(schema);
        continue;
      }

      throw error;
    }
  }

  if (successful > 0 && referencedUnknownType.length > 0) {
    convertSchemas(context, referencedUnknownType);
    return;
  }

  // If there is a type that was not handled, then attempt it
  // again just to generate an error for debugging
  if (referencedUnknownType.length > 0) {
    convert(context, referencedUnknownType[0]);
  }
}

function jsonSchemasToGraphqlSchema (schemas, withMutations = true) {
  const context = newContext();

  convertSchemas(context, schemas);

  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: () => {
      const result = {};
      for (const [name, type] of context.types.entries()) {
        // It's ok to ignore the object injection attack here because
        // the object being edited does not contain any private data to be
        // protected and none of the attributes will be used as functions
        // just a map of attribute to values.
        // eslint-disable-next-line security/detect-object-injection
        result[name] = {type};
      }
      return result;
    }
  });

  const mutationType = withMutations ? new GraphQLObjectType({
    name: 'Mutation',
    fields: () => {
      const result = {};
      for (const [name, type] of context.inputs.entries()) {
        // It's ok to ignore the object injection attack here because
        // the object being edited does not contain any private data to be
        // protected and none of the attributes will be used as functions
        // just a map of attribute to values.
        // eslint-disable-next-line security/detect-object-injection
        result[name] = {
          type: GraphQLString,
          args: {input: {type}}
        };
      }

      return result;
    }
  }) : null;
  const schema = new GraphQLSchema({query: queryType, mutation: mutationType});
  return schema;
}
module.exports = {
  jsonSchemasToGraphqlSchema
};
