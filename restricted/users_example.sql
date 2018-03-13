BEGIN TRANSACTION;

DROP TABLE IF EXISTS definitions;
CREATE TABLE definitions(
  -- INI style configuration data...
  id INTEGER PRIMARY KEY,               -- unique record id
  section TEXT DEFAULT '' NOT NULL,     -- equivalent of INI [grouping]
  key TEXT DEFAULT '' NOT NULL,         -- identifier of key=value pair
  value TEXT DEFAULT '' NOT NULL,       -- (JSON) value of key=value pair
  description TEXT  DEFAULT '' NOT NULL -- optional description
  );

INSERT INTO "definitions" VALUES(NULL,"RECIPE","user",
'{ "create": {
    "filter": {
      "username": "username",
      "identification": {
        "account": ["choice","other,client,staff,admin"],
        "firstname": "word",
        "lastname": "word",
        "email": "email",
        "phone": {
          "number": "phone",
          "provider": "word"
          }
        },
      "credentials": {
        "auth": "*",
        "local": "hash"
        }
      },
    "json": ["identification","credentials"],
    "order": ["username","identification","credentials"],
    "pretty": 2,
    "sql": "INSERT INTO users VALUES(null,''PENDING'',?,?,?)"
    },
  "user": {
    "filter": {
      "username": "username"
      },
    "json": ["identification","credentials"],
    "order": ["username"],
    "sql": "SELECT * FROM users WHERE username=?"
    },
  "update": {
    "filter": {
      "status": "*",
      "username": "*",
      "identification": {
        "account": ["choice","other,client,staff,admin"],
        "firstname": "word",
        "lastname": "word",
        "email": "email",
        "phone": {
          "number": "phone",
          "provider": "word"
          }
        },
      "credentials": {
        "auth": "*",
        "challenge": "*",
        "local": "hash"
        }
      },
    "json": ["identification","credentials"],
    "order": ["status","identification","credentials","username"],
    "pretty": 2,
    "sql": "UPDATE users SET status=?, identification=?, credentials=? WHERE username=?"
    },
  "choices": {
    "accounts": ["OTHER", "CLIENT", "STAFF", "ADMIN"],
    "auth": ["DENY","none","read","limited","write","*"],
    "status": [ "PENDING", "ACTIVE", "INACTIVE"]
    },
  "defaults": {
    "status": "PENDING",
    "identification": {
      "account":"other",
      "firstname": "NA",
      "lastname": "NA",
      "email": "NA",
      "phone": {
        "number": "NA",
        "provider": "NA"
        }
      },
    "credentials": {
      "auth": {
        "admin": "DENY",
        "data": "read",
        "red": "",
        "shop": "read"
        },
      "local": ""
      }
    }
  }',"Recipes for hbAuth module to manage user accounts.");


DROP TABLE IF EXISTS "users";
CREATE TABLE users(
  -- user authentication data...
  id INTEGER PRIMARY KEY,                   -- unique record id
  status TEXT DEFAULT '' NOT NULL,          -- account status flag
  username TEXT DEFAULT '' NOT NULL,        -- unique account identifier
  identification TEXT DEFAULT '' NOT NULL,  -- JSON record of user identification info
  -- identification may include firstname, lastname, email, phone, hint, ...
  credentials TEXT DEFAULT '' NOT NULL      -- JSON record of user credentials
  -- credentials may include username, password, email, openID, pin, hash, grouped by "use"...
  );
INSERT INTO "users" VALUES(NULL,'ACTIVE','dvc',
'{
  "account": "admin",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john@doe.net",
  "phone": {
    "number": "0000000000",
    "provider": "Verizon"
    }
  }',
'{ "auth": {
    "admin": "*",
    "shop": "*"
    },
  "local": "$2a$08$NNxM7bbT/OWFWD0.vQL.2KqyKXf1naBeu976QIzMiB2ThhukjzUMK"
  }'
  );

COMMIT;
