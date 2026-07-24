require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./db');

const SALT_ROUNDS = 12;

const usuarios = [
  {
    correo:     'laura.mendez@universidad.edu',
    contrasena: 'demoaccess',
    nombre:     'Mtra. Laura Méndez',
    rol:        'admin',
  },
];

async function seed() {
  console.log('Ejecutando seed...\n');

  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.contrasena, SALT_ROUNDS);

    db.prepare(`
      INSERT INTO usuarios (correo, contrasena_hash, nombre, rol)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(correo) DO UPDATE SET
        contrasena_hash = excluded.contrasena_hash,
        nombre          = excluded.nombre,
        rol             = excluded.rol
    `).run(u.correo, hash, u.nombre, u.rol);

    console.log(`✓ ${u.correo}  (contraseña: ${u.contrasena})`);
  }

  console.log('\nSeed completado.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
