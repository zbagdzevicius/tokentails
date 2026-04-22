require('dotenv').config();

const config = {
    mongodb: {
        url: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        databaseName: 'tokentails',
        // databaseName: 'tokentails-test',
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    },
    migrationsDir: `migrations/tokentails`,
    changelogCollectionName: 'changelog',
};

module.exports = config;
