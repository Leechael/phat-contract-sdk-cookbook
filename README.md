# Phat Contract CLI scripts

Setup:

1. Install dependencies: `yarn`
2. Create your own `.env` file and set up endpoint and your mnemonic in it. You can use `//Alice`: `cp env.example .env`


## Upload & instantiate Phat Contract

```shell
node upload.js path/to/your.contract
```


## Pulling logs

```shell
node tail.js contractId
```

