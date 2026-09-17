# Token Tails Backend

NestJS 9 API over MongoDB. Full documentation: [docs/BACKEND.md](../docs/BACKEND.md),
[docs/API.md](../docs/API.md), [docs/DATA_MODEL.md](../docs/DATA_MODEL.md).

```bash
cp .env.example .env     # variable list in docs/BACKEND.md
npm install
npm run dev              # http://localhost:3005
npm run build && npm run start
npm run lint
npm run migration:up
```

## Database backups

```bash
# local
mongodump --out ./backup --db=tokentails --gzip
mongorestore --db=tokentails ./backup --gzip

# remote
mongodump --gzip --out=./backup/tokentails-YYYY-MM-DD --db=tokentails --uri=<connection string>
mongorestore --gzip --db=tokentails ./backup/tokentails-YYYY-MM-DD --uri=<connection string>
```
