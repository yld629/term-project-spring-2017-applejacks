import url from 'url';
import { printlog } from './../utils/helpers';
import pgPromise from 'pg-promise';

const pgp = pgPromise();
const Inserts = pgp.helpers.insert;

function DatabaseController () {
  // instance of the pg-promise library object
  let _datab = null;

  // has a successful connection been made with postgres db
  let _dbConnected = false;

  // This gets set in the init() after postgres looks for a database to connect with
  let _localDbName = null;

  const _getDbName = () => {
    const str = process.env.DATABASE_URL || '';
    const params = url.parse(str) || {};

    return params.pathname ? `[${params.pathname.split('/')[1]}]` : `[${_localDbName}]`;
  };

  this.getDbInstance = () => {
    return _datab;
  };

  /**
   * Create CREATE query string
   * CREATE TABLE IF NOT EXISTS users (
   *   email VARCHAR(60) UNIQUE NOT NULL,
   *   password VARCHAR(100) NOT NULL,
   *   lastlogin BIGSERIAL,
   *   isadmin BOOLEAN)
   *
   * @param {String} data.tableName - table name
   * @param {Boolean} data.ifNotExists - Whether or not to add 'IF NOT EXISTS' to query
   * @param {Array} data.types - the Postgres type corresponding to each column name
   * @param {Array} data.columns - the table columns
   * @param {Boolean} data.uniqueId - whether or not to create a table column "id" that is the primary key
   */
  const _buildCreateQuery = (data) => {
    let query = `CREATE TABLE ${data.ifNotExists ? 'IF NOT EXISTS ' : ''}`;

    const typeMappings = {
      bool: 'BOOLEAN',
      money: 'MONEY',
      date: 'DATE',
      varchar: (n) => `VARCHAR(${n.split('-')[1]})`,
      pk: 'PRIMARY KEY',
      fk: 'FOREIGN KEY',
      u: 'UNIQUE',
      nn: 'NOT NULL',
      int: 'INTEGER',
      bs: 'BIGSERIAL'
    };

    const parseVal = (typeString) => {
      let values = typeString.split(' ');
      let pgValues = [];

      pgValues = values.map((val) => {
        if (~val.indexOf('-')) {
          return typeMappings.varchar(val);
        }

        if (val === 'pk' && data.uniqueId) {
          return;
        }

        return typeMappings.hasOwnProperty(val) ? typeMappings[val] : 'ERROR';
      });

      return pgValues.join(' ');
    };

    query += `${data.tableName} (${data.uniqueId ? 'id SERIAL PRIMARY KEY,' : ''}`;

    const val = data.columns.map((val, i) => {
      return val + ' ' + parseVal(data.types[i]);
    });

    return query + `${val})`;
  };

  /**
   * Create INSERT query string
   * INSERT INTO users (email,password,lastlogin,isadmin) VALUES
   *   ('testemail@gmail','$2a$08$sKQtgvGw3a8SujWUXqUFduesv',1489028533344,false)
   *
   * @param {String} data.tableName - table name
   * @param {Array} data.values - array of values
   * @param {Array} data.columns - the table columns the values will map to
   * @param {String} data.key - the unique column name
   */
  const _buildInsertQuery = (data) => {
    if (!data) {
      printlog('Error: buildInsert() empty data {}', 'error');
      return '';
    }

    if (!data.tableName) {
      printlog('Error: buildInsert() no table name', 'error');
      return '';
    }

    if (!data.columns) {
      printlog('Error: buildInsert() empty columns []', 'error');
      return '';
    }

    if (!data.values) {
      printlog('Error: buildInsert() empty values []', 'error');
      return '';
    }

    const valueString = data.values.reduce(
    (accumulator, currObj, currentIndex, array) => {
      let str = '';
      const type = typeof(currObj);

      if (type === 'object') {
        if (currObj.type === 'postgres') {
          str = `${currObj.value}`;
        } else if (currObj.type === 'string') {
          str = `'${currObj.value}'`;
        } else if (currObj.type === 'number' || currObj.type === 'boolean') {
          str = currObj.value;
        }
      } else {
        if (type === 'string') {
          str = `'${currObj}'`;
        } else if (type === 'number' || type === 'boolean') {
          str = currObj;
        }
      }

      if (currentIndex < array.length - 1) {
        str += ',';
      } else {
        str += ')';
      }

      return accumulator + str;
    }, '(');

    const columnString = '(' + data.columns.join(',') + ')';
    return `INSERT INTO ${data.tableName} ${columnString} VALUES ${valueString}`;
  };

  const _getConfig = () => {
    const str = process.env.DATABASE_URL || '';

    if (str) {
      const params = url.parse(str);
      const auth = params.auth.split(':');

      return {
        user: auth[0],
        password: auth[1],
        host: params.hostname,
        port: params.port,
        database: params.pathname.split('/')[1],
        ssl: true
      };
    }

    // See documentation for default values
    // https://github.com/brianc/node-postgres/wiki/Client
    return {};
  };

/*
  this.createSessionTable = () => {
    const query = `CREATE TABLE IF NOT EXISTS "session" (
       "sid" varchar NOT NULL COLLATE "default",
       "sess" json NOT NULL,
       "expire" timestamp(6) NOT NULL
     )
     WITH (OIDS=FALSE);
     ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE`;

     return _datab.none(query);
  };
*/


  this.init = () => {
    // create instance of db, one per application
    _datab = _datab || pgp(_getConfig());
    return _datab.connect()
      .then((obj) => {
          printlog('Connected to database [' + obj.client.database + ']');
          _dbConnected = true;
          _localDbName = obj.client.database;
          // release connection
          return obj.done();
      })
      .catch((error) => {
        printlog('Failed to connect to database', 'error');
        printlog(error, 'error');
      });
  };

  this.createTable = (data) => {
    data = data || {};
    printlog('Attempting create table... [' + data.tableName + ']');

    // `postgresdb-# \d <name>` will display the created table
    const query = _buildCreateQuery(data);
    printlog(query, 'db');

    return _datab.none(query);
  };

  /**
   * data.tableName, data.key, data.val
   */
  this.getPassword = (data) => {
    data = data || {};
    printlog(`Attempting get... [${data.key}=${data.val}]`);

    // `postgresdb-# \d <name>` will display the created table
    const query = `select * from ${data.tableName} where ${data.key}='${data.val}'`;
    printlog(query, 'db');

    return _datab.one(query);
  };

  this.dropTable = (tableName) => {
    const queryString = `drop table ${tableName}`;
    // trying to prevent malicious attacks by not allowing ';drop table <name>;'
    // TODO: make this better
    if (~tableName.indexOf(';')) {
      return;
    }

    printlog('Attempting drop table... ['+ tableName +']');
    printlog(queryString, 'db');

    return _datab.none(queryString);
  };

  this.getTable = (tableName) => {
    const queryString = `select * from ${tableName}`;

    printlog('Attempting get table... ['+ tableName +']');
    printlog(queryString, 'db');

    return _datab.any(queryString);
  };

  this.updateLoginDate = (uid) => {
    printlog('updateLoginDate() -> ', 'error');
    _datab.any('update users set last_login=$1 where id=$2', [Date.now(), uid])
    .then((data) => {
      console.log(data);
    })
    .catch((err) => {
      console.log(err);
    })
  };

  this.getGames = () => {console.log('get Games.....');
    return _datab.any('select * from games');
  };

  this.getUser = (email='') => {
    return _datab.any('select * from users where email=$1',email);
  };

  this.addUser = (data) => {
    printlog('Attempting insert user... ['+ data.key +']');
    // ****
    // ON CONFLICT DO NOTHING
    // ****
    return _datab.tx((t) => {
      const q2Str = _buildInsertQuery(data);
      const keyval = data.values[data.columns.indexOf(data.key)];
      const q1Str = `SELECT * FROM ${data.tableName} WHERE ${data.key}='${keyval}'`;
      const q1 = t.none(q1Str);
      const q2 = t.any(q2Str);

      printlog(q1Str, 'db');
      printlog(q2Str, 'db');

      // will successfully resolve if each query resolves in succession
      return t.batch([q1, q2]);
    });
  };

  /**
   * Update existing record in databae
   *
   * @param {String} data.tableName -
   * @param {String} data.col - column that is used to fetch record you want to change
   * @param {String} data.oldval - existing value of column specified by 'col'
   * @param {String} data.newval - the new value you want to udpate to
   */
  this.updateUser = (data) => {
    printlog('Attempting update user... ['+ data.oldval +']');

    return _datab.tx((t) => {
      // batch queries
      let q1Str = `SELECT * FROM ${data.tableName} WHERE ${data.col}='${data.oldval}'`;
      let q2Str = `UPDATE ${data.tableName} set ${data.col}='${data.newval}' where ${data.col}='${data.oldval}'`;
      let q1 = t.one(q1Str);
      let q2 = t.none(q2Str);

      printlog(q1Str, 'db');
      printlog(q2Str, 'db');

      // will successfully resolve if each query resolves in succession
      return t.batch([q1,q2]);
    });
  };
  // stuf for lobby
  this.createGame = (uid) => {
    const data = {
      date: Date.now(),
      act: true,
      currTurn: uid
    };

    return _datab.one('SELECT COUNT(*) from games')
    .then((result) => {
      const gid = Number(result.count) + 1;
      _datab.none('INSERT INTO games (create_date, is_active, current_player_turn, p_count) values (${date},${act},${currTurn}, 0)', data);
      return this.createCardTable(gid, uid);
    });
  };

  this.addPlayer = (gid,uid) => {
    console.log('ADD PLAYER');

    // There has got to be a better way to nest queries like this
    _datab.none('SELECT * FROM players WHERE user_id=$1', [uid])
    .then((nodata) => {
      _datab.task((task) => {
        let t2 = task.none('INSERT INTO players (game_id, user_id, bank_buyin) VALUES ($1, $2, $3)', [gid, uid, 10000]);
        let t3 = task.none('UPDATE games SET p_count=((SELECT COUNT(*) FROM players WHERE game_id=$1)) WHERE id=$1', [gid]);
        let t4 = task.none('UPDATE users SET bank_value=bank_value-10000 WHERE id=$1', [uid]);
        task.batch([t2, t3, t4])
        //task.batch([t1, t2])
        .catch((err) => printlog('addPlayer inner' + err, 'error'));
      })
      .catch((err) => printlog('addPlayer outer' + err, 'error'));
    })
    .catch((err) => printlog('Player already exists in game. ' + err, 'error'))
  };

  this.getActivePlayers = (gid) => {
    return _datab.one('SELECT COUNT(*) FROM players where game_id=$1', [gid]);
  };


  const shuffle = (deck) => {
    const getRandomInt = (min, max) => {
      min = Math.ceil(min);
      max = Math.floor(max);
      return Math.floor(Math.random() * (max - min)) + min;
    };
    const len = deck.length;

    return deck.map((val, i) => {
      if (i >= len - 2) {
        return val;
      }

      let rand = getRandomInt(i,len);
      let buffer = deck[rand];
      deck[rand] = val;

      return buffer;
    });
  };

  const getNumbers = () => {
    let arr = [];
    for (let i=0; i<52; i++) {
      arr.push(i+1);
    }
    return arr;
  };

  this.getCards = (gid) => {
    return _datab.any('SELECT * FROM game_cards WHERE game_id=$1 ORDER BY orderr', [gid])
      .catch((err) => {
        console.log(`getCards() => ${err}`, 'error');
      });
  };

  this.createCardTable = (gid, uid) => {
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const cards_table_columns = ['game_id', 'user_id', 'value', 'suit', 'orderr', 'in_play'];
    const orderArray = shuffle(getNumbers());
    let cards = [];
    let o = 0;

    for (let i = 0; i < 13; i++) {
      cards.push({game_id: gid, user_id: null , value: values[i], suit: 'C', orderr: orderArray[o++], in_play: false});
      cards.push({game_id: gid, user_id: null , value: values[i], suit: 'S', orderr: orderArray[o++], in_play: false});
      cards.push({game_id: gid, user_id: null , value: values[i], suit: 'H', orderr: orderArray[o++], in_play: false});
      cards.push({game_id: gid, user_id: null , value: values[i], suit: 'D', orderr: orderArray[o++], in_play: false});
    }

    const batchInsertQuery = Inserts(cards, cards_table_columns, 'game_cards');
    _datab.none(batchInsertQuery);
    return gid;
  };

  this.deleteUser = (data) => {
    printlog('Attempting remove user... ['+ data.email +']');

    return _datab.tx(function (t) {
      // batch queries
      let q1 = t.one('SELECT * FROM ' + data.table + ' WHERE email=$1', [data.email]);
      let q2 = t.none('DELETE FROM ' + data.table + ' WHERE email=$1', [data.email]);

      // will successfully resolve if each query resolves in succession
      return t.batch([q1,q2]);
    });
  };

  // use this function to load a file to intialize all dataabase tables
  // this will a good way to intialize the static "deck" and "card" tables
  this.loadAndExecute = (file) => {
    const loadedQuery = new pgp.QueryFile(file, {minify: true});

    // Execute pre loaded queries
    return _datab.one(loadedQuery)
    .catch(error=> {
      if (error instanceof pgp.errors.QueryFileError) {
        console.log('Error in ' + file + '. Double check your queries');
      }
    });
  };
}

export default new DatabaseController();
