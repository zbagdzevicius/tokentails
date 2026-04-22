## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Restore backup locally

`mongorestore --db=tokentails ./backup --gzip`

## Save backup locally

`mongodump --out ./backup --db=tokentails --gzip`

## Restore backup remotelly

`mongorestore --gzip --db=tokentails ./backup/tokentails-2023-08-12 --uri=url`

## Save backup remotelly

`mongodump --gzip --out=./backup/tokentails-2023-08-12 --db=tokentails --uri=url`
