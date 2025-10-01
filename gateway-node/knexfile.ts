import type { Knex } from "knex"
import { config as appConfig } from "./src/config"

// Update with your config settings.

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "postgresql",
    connection: {
      connectionString: appConfig.database_url,
      // database: "",
      // user: "",
      // password: "",
    },
    pool: {
      min: 2,
      max: 10,
    },
  },

  staging: {
    client: "postgresql",
    connection: {
      connectionString: appConfig.database_url,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },

  production: {
    client: "postgresql",
    connection: {
      connectionString: appConfig.database_url,
      ssl: {
        rejectUnauthorized: false,
      },
    },
    pool: {
      min: 2,
      max: 10,
    },
    // migrations: {
    //   tableName: "knex_migrations",
    // },
  },
}

export default config
