// Run only from a trusted terminal with DATABASE_URL configured privately.
require('dotenv').config();
const crypto = require('crypto');
const readline = require('readline');
const {Pool} = require('pg');
async function readPassword() {
  if (!process.stdin.isTTY) throw new Error('Usa una terminal interactiva; la contraseña no se admite como argumento.');
  process.stdout.write('Nueva contraseña (mínimo 16 caracteres, entrada oculta): ');
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {process.stdin.off('keypress', handler);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
    const handler = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') {finish();reject(new Error('Cancelado'));}
      else if (key.name === 'return') {finish();resolve(value);}
      else if (key.name === 'backspace') value = value.slice(0,-1);
      else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    process.stdin.on('keypress', handler);
  });
}
(async () => {
  const [username, role] = process.argv.slice(2);
  if (!/^[a-z0-9._-]{3,60}$/.test(username || '') || !['admin','staff'].includes(role)) throw new Error('Uso: node scripts/set-staff-account.js usuario admin|staff');
  if (!process.env.DATABASE_URL) throw new Error('Configura DATABASE_URL en un entorno privado.');
  const password = await readPassword();
  if (password.length < 16 || password.length > 256) throw new Error('Usa entre 16 y 256 caracteres.');
  const salt = 'scrypt:' + crypto.randomBytes(24).toString('hex');
  const hash = crypto.scryptSync(password, salt.slice(7), 64).toString('hex');
  const pool = new Pool({connectionString: process.env.DATABASE_URL});
  try {
    await pool.query(`INSERT INTO users (username, password_hash, salt, name, role, label)
      VALUES ($1, $2, $3, $1, $4, $4)
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, salt = EXCLUDED.salt, role = EXCLUDED.role`, [username, hash, salt, role]);
    console.log('Cuenta actualizada. Las sesiones anteriores de esta cuenta dejaron de ser válidas.');
  } finally {await pool.end();}
})().catch(() => {console.error('No se pudo actualizar la cuenta. Verifica argumentos, contraseña y conexión privada a la base de datos.');process.exitCode=1;});
