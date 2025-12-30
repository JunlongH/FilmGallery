const db = require('./db');

setTimeout(() => {
  console.log('\n=== Film Items (loaded status) ===');
  db.all("SELECT * FROM film_items WHERE status = 'loaded' LIMIT 5", (err, rows) => {
    if (err) console.error('Error:', err);
    else console.log(JSON.stringify(rows, null, 2));
  });

  setTimeout(() => {
    console.log('\n=== Films Table ===');
    db.all('SELECT * FROM films LIMIT 5', (err, rows) => {
      if (err) console.error('Error:', err);
      else console.log(JSON.stringify(rows, null, 2));
    });

    setTimeout(() => {
      console.log('\n=== JOIN Query (film_items + films) ===');
      db.all(`
        SELECT 
          film_items.*,
          films.name as film_name,
          films.iso
        FROM film_items
        LEFT JOIN films ON film_items.film_id = films.id
        WHERE film_items.status = 'loaded'
        LIMIT 3
      `, (err, rows) => {
        if (err) console.error('Error:', err);
        else console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
      });
    }, 300);
  }, 300);
}, 500);
