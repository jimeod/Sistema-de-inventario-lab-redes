
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const opciones = {
    region: process.env.AWS_REGION || 'us-east-1'
};

if (process.env.DYNAMODB_ENDPOINT) {
    opciones.endpoint = process.env.DYNAMODB_ENDPOINT;
    opciones.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local'
    };
}

const client = new DynamoDBClient(opciones);

const db = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});

module.exports = db;
