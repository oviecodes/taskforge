import type { Knex } from "knex"
import { config as appConfig } from "./src/config"

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "postgresql",
    connection: {
      connectionString: appConfig.database_url,
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
  },
}

export default config
