require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const bcrypt = require('bcryptjs');
const db     = require('./db');

const SALT_ROUNDS = 12;

// Institución de demostración: la cuenta de consulta (viewer) y el estudiante
// quedan asociados a ella. La wallet es la de la universidad si está en .env.
const institucion = {
  nombre:            'Universidad Demo',
  etiqueta:          'UDEMO',
  responsable_nombre: 'Andrea Villalobos',
  responsable_correo: 'consulta@universidad.edu',
  wallet:            process.env.UNIVERSITY_WALLET?.trim() || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  credito_usd:       100,
};

// Wallet de prueba del estudiante. Por defecto es la cuenta #1 pública de
// Hardhat (su clave privada es conocida): úsala SOLO en testnet.
const STUDENT_WALLET = process.env.DEMO_STUDENT_WALLET || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const usuarios = [
  {
    correo:     'laura.mendez@universidad.edu',
    contrasena: 'demoaccess',
    nombre:     'Mtra. Laura Méndez',
    rol:        'admin',
  },
  {
    correo:     'consulta@universidad.edu',
    contrasena: 'consulta123',
    nombre:     'Andrea Villalobos',
    rol:        'viewer',
    institucion: true,
  },
  {
    correo:     'estudiante@universidad.edu',
    contrasena: 'estudiante123',
    nombre:     'Carlos Ramírez',
    rol:        'student',
    institucion: true,
    wallet:     STUDENT_WALLET,
  },
];

async function seed() {
  console.log('Ejecutando seed...\n');

  db.prepare(`
    INSERT INTO instituciones (nombre, etiqueta, responsable_nombre, responsable_correo, wallet, credito_usd)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(etiqueta) DO UPDATE SET
      nombre             = excluded.nombre,
      responsable_nombre = excluded.responsable_nombre,
      responsable_correo = excluded.responsable_correo,
      wallet             = COALESCE(instituciones.wallet, excluded.wallet)
  `).run(institucion.nombre, institucion.etiqueta, institucion.responsable_nombre,
    institucion.responsable_correo, institucion.wallet, institucion.credito_usd);
  const institucionId = db.prepare('SELECT id FROM instituciones WHERE etiqueta = ?').get(institucion.etiqueta).id;
  console.log(`✓ Institución ${institucion.etiqueta} - ${institucion.nombre} (id ${institucionId})`);

  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.contrasena, SALT_ROUNDS);

    db.prepare(`
      INSERT INTO usuarios (correo, contrasena_hash, nombre, rol, institucion_id, estado, wallet)
      VALUES (?, ?, ?, ?, ?, 'activo', ?)
      ON CONFLICT(correo) DO UPDATE SET
        contrasena_hash = excluded.contrasena_hash,
        nombre          = excluded.nombre,
        rol             = excluded.rol,
        institucion_id  = excluded.institucion_id,
        estado          = 'activo',
        wallet          = COALESCE(usuarios.wallet, excluded.wallet)
    `).run(u.correo, hash, u.nombre, u.rol, u.institucion ? institucionId : null, u.wallet || null);

    console.log(`✓ [${u.rol}] ${u.correo}  (contraseña: ${u.contrasena})`);
  }

  // El estudiante también figura en la lista de la institución, lista para
  // incluirlo en un lote.
  const student = usuarios.find((u) => u.rol === 'student');
  const exists = db.prepare('SELECT id FROM estudiantes_institucionales WHERE institucion_id = ? AND correo = ?').get(institucionId, student.correo);
  if (!exists) {
    db.prepare('INSERT INTO estudiantes_institucionales (institucion_id, nombre, correo, wallet) VALUES (?, ?, ?, ?)')
      .run(institucionId, student.nombre, student.correo, student.wallet);
  }

  console.log('\nSeed completado.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
