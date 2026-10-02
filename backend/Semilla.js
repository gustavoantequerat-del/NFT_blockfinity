// Crea (o restablece) la institución y las cuentas de prueba. Se puede
// ejecutar varias veces: actualiza contraseñas y no duplica datos.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const bcrypt = require('bcryptjs');
const Base_Datos = require('./Base_Datos');

const Rondas_Hash = 12;

// Wallet de prueba del estudiante: por defecto la cuenta #1 pública de
// Hardhat (su clave privada es conocida). Úsala SOLO en modo test.
const Wallet_Estudiante = process.env.DEMO_STUDENT_WALLET?.trim() || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const Institucion_Demo = {
  nombre: 'Universidad Demo',
  etiqueta: 'UDEMO',
  responsable_nombre: 'Andrea Villalobos',
  responsable_correo: 'consulta@universidad.edu',
  wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  credito_usd: 100,
};

const Usuarios_Demo = [
  { correo: 'laura.mendez@universidad.edu', contrasena: 'demoaccess', nombre: 'Mtra. Laura Méndez', rol: 'admin' },
  { correo: 'consulta@universidad.edu', contrasena: 'consulta123', nombre: 'Andrea Villalobos', rol: 'viewer', con_institucion: true },
  { correo: 'estudiante@universidad.edu', contrasena: 'estudiante123', nombre: 'Carlos Ramírez', rol: 'student', con_institucion: true, wallet: Wallet_Estudiante },
];

async function Ejecutar_Semilla() {
  Base_Datos.prepare(`
    INSERT INTO instituciones (nombre, etiqueta, responsable_nombre, responsable_correo, wallet, credito_usd)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(etiqueta) DO UPDATE SET
      nombre = excluded.nombre,
      responsable_nombre = excluded.responsable_nombre,
      responsable_correo = excluded.responsable_correo,
      wallet = COALESCE(instituciones.wallet, excluded.wallet)
  `).run(Institucion_Demo.nombre, Institucion_Demo.etiqueta, Institucion_Demo.responsable_nombre,
    Institucion_Demo.responsable_correo, Institucion_Demo.wallet, Institucion_Demo.credito_usd);
  const Institucion_Id = Base_Datos.prepare('SELECT id FROM instituciones WHERE etiqueta = ?').get(Institucion_Demo.etiqueta).id;
  console.log(`✓ Institución ${Institucion_Demo.etiqueta} - ${Institucion_Demo.nombre} (id ${Institucion_Id})`);

  for (const Usuario of Usuarios_Demo) {
    Base_Datos.prepare(`
      INSERT INTO usuarios (correo, contrasena_hash, nombre, rol, institucion_id, estado, wallet)
      VALUES (?, ?, ?, ?, ?, 'activo', ?)
      ON CONFLICT(correo) DO UPDATE SET
        contrasena_hash = excluded.contrasena_hash,
        nombre = excluded.nombre,
        rol = excluded.rol,
        institucion_id = excluded.institucion_id,
        estado = 'activo',
        wallet = COALESCE(usuarios.wallet, excluded.wallet)
    `).run(Usuario.correo, await bcrypt.hash(Usuario.contrasena, Rondas_Hash), Usuario.nombre, Usuario.rol,
      Usuario.con_institucion ? Institucion_Id : null, Usuario.wallet || null);
    console.log(`✓ [${Usuario.rol}] ${Usuario.correo}  (contraseña: ${Usuario.contrasena})`);
  }

  // El estudiante también figura en la lista de la institución, listo para un lote.
  const Estudiante = Usuarios_Demo.find((Usuario) => Usuario.rol === 'student');
  const Existe = Base_Datos.prepare('SELECT id FROM estudiantes_institucionales WHERE institucion_id = ? AND correo = ?').get(Institucion_Id, Estudiante.correo);
  if (!Existe) {
    Base_Datos.prepare('INSERT INTO estudiantes_institucionales (institucion_id, nombre, correo, wallet) VALUES (?, ?, ?, ?)')
      .run(Institucion_Id, Estudiante.nombre, Estudiante.correo, Estudiante.wallet);
  }
  console.log('\nSemilla completada.');
}

Ejecutar_Semilla().catch((Error_Semilla) => {
  console.error('Error en la semilla:', Error_Semilla);
  process.exit(1);
});
