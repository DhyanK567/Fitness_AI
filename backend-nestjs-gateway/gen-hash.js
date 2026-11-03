const argon2 = require('@node-rs/argon2');
const fs = require('fs');

(async () => {
  const hash = await argon2.hash('password123');
  console.log('New hash:', hash);
  fs.writeFileSync('new-hash.txt', hash + '\n');
})().catch(err => console.error('Error:', err));
