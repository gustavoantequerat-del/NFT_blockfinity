/*
 * Credenciales y modo de red (test / main).
 *
 * Cada credencial existe dos veces en backend/.env, con sufijo _TEST y _MAIN
 * (ej. RPC_URL_TEST y RPC_URL_MAIN). El administrador elige desde el panel
 * qué modo está activo; la elección se guarda en la tabla "configuracion"
 * y se mantiene aunque el servidor se reinicie.
 *   - test: testnet (ej. Sepolia). Sirve para probar sin costo real.
 *   - main: red principal. Cada certificado gasta gas real.
 */
const { Web3 } = require('web3');
const Base_Datos = require('./Base_Datos');
const Abi_Contrato = require('./Abi_Contrato');

const Modos_Validos = ['test', 'main'];

const Variables_Requeridas = [
  'RPC_URL',
  'CHAIN_ID',
  'PRIVATE_KEY',
  'CONTRACT_ADDRESS',
  'PINATA_API_KEY',
  'PINATA_SECRET_API_KEY',
];

const Nombres_Redes = {
  1: 'Ethereum Mainnet',
  11155111: 'Sepolia',
  137: 'Polygon',
  80002: 'Polygon Amoy',
  31337: 'Hardhat local',
};

const Exploradores = {
  1: 'https://etherscan.io/tx/',
  11155111: 'https://sepolia.etherscan.io/tx/',
  137: 'https://polygonscan.com/tx/',
  80002: 'https://amoy.polygonscan.com/tx/',
};

// Una instancia de Web3 + contrato por modo, creada la primera vez que se pide.
const Redes_Creadas = {};

function Leer_Variable(Nombre, Modo) {
  return (process.env[`${Nombre}_${Modo.toUpperCase()}`] || '').trim();
}

function Validar_Modo(Modo) {
  if (!Modos_Validos.includes(Modo)) throw new Error(`Modo de red inválido: "${Modo}". Usa "test" o "main".`);
}

function Listar_Faltantes(Modo) {
  return Variables_Requeridas
    .filter((Nombre) => !Leer_Variable(Nombre, Modo))
    .map((Nombre) => `${Nombre}_${Modo.toUpperCase()}`);
}

// Devuelve todo lo necesario para operar en un modo. Falla con un mensaje
// claro si faltan credenciales en el .env.
function Obtener_Red(Modo) {
  Validar_Modo(Modo);
  if (Redes_Creadas[Modo]) return Redes_Creadas[Modo];

  const Faltantes = Listar_Faltantes(Modo);
  if (Faltantes.length) {
    throw new Error(`Faltan credenciales del modo ${Modo} en backend/.env: ${Faltantes.join(', ')}`);
  }

  const Clave_Privada = Leer_Variable('PRIVATE_KEY', Modo);
  if (!/^0x[a-fA-F0-9]{64}$/.test(Clave_Privada)) {
    throw new Error(`PRIVATE_KEY_${Modo.toUpperCase()} no tiene un formato válido (0x + 64 hex).`);
  }

  const Chain_Id = Number(Leer_Variable('CHAIN_ID', Modo));
  if (Modo === 'test' && Chain_Id === 1) {
    throw new Error('El modo test no puede apuntar a Ethereum Mainnet (CHAIN_ID_TEST=1).');
  }

  const Web3_Red = new Web3(Leer_Variable('RPC_URL', Modo));
  const Direccion_Contrato = Leer_Variable('CONTRACT_ADDRESS', Modo);

  Redes_Creadas[Modo] = {
    Modo,
    Web3: Web3_Red,
    Contrato: new Web3_Red.eth.Contract(Abi_Contrato, Direccion_Contrato),
    Direccion_Contrato,
    Clave_Privada,
    Wallet_Emisora: Web3_Red.eth.accounts.privateKeyToAccount(Clave_Privada).address,
    Chain_Id,
    Nombre_Red: Nombres_Redes[Chain_Id] || `Chain ID ${Chain_Id}`,
    Explorador_Url: Leer_Variable('EXPLORER_URL', Modo) || Exploradores[Chain_Id] || '',
    Pinata_Api_Key: Leer_Variable('PINATA_API_KEY', Modo),
    Pinata_Secret: Leer_Variable('PINATA_SECRET_API_KEY', Modo),
  };
  return Redes_Creadas[Modo];
}

function Obtener_Modo_Activo() {
  const Fila = Base_Datos.prepare("SELECT valor FROM configuracion WHERE clave = 'modo_red'").get();
  return Modos_Validos.includes(Fila?.valor) ? Fila.valor : 'test';
}

function Obtener_Red_Activa() {
  return Obtener_Red(Obtener_Modo_Activo());
}

// Corta una promesa que tarda demasiado (un RPC caído no debe colgar el panel).
function Con_Limite_Tiempo(Promesa, Milisegundos = 10000) {
  return Promise.race([
    Promesa,
    new Promise((_, Rechazar) => setTimeout(() => Rechazar(new Error('El RPC no respondió a tiempo.')), Milisegundos)),
  ]);
}

// Comprueba que el RPC apunta a la red esperada y que la wallet emisora es
// dueña del contrato (solo el owner puede llamar a createCertificate).
async function Validar_Red(Modo) {
  const Red = Obtener_Red(Modo);
  const Chain_Id_Real = Number(await Con_Limite_Tiempo(Red.Web3.eth.getChainId()));
  if (Chain_Id_Real !== Red.Chain_Id) {
    throw new Error(`El RPC del modo ${Modo} apunta a la red ${Chain_Id_Real}, pero CHAIN_ID_${Modo.toUpperCase()}=${Red.Chain_Id}.`);
  }
  const Propietario = await Con_Limite_Tiempo(Red.Contrato.methods.owner().call());
  if (Propietario.toLowerCase() !== Red.Wallet_Emisora.toLowerCase()) {
    throw new Error(`La wallet ${Red.Wallet_Emisora} no es owner del contrato ${Red.Direccion_Contrato} (modo ${Modo}).`);
  }
  return Red;
}

async function Cambiar_Modo(Modo) {
  await Validar_Red(Modo);
  Base_Datos.prepare(`
    INSERT INTO configuracion (clave, valor) VALUES ('modo_red', ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
  `).run(Modo);
  return Modo;
}

// Resumen de un modo para mostrar en el panel (sin exponer claves privadas).
async function Describir_Red(Modo) {
  const Descripcion = { modo: Modo, activo: Modo === Obtener_Modo_Activo(), configurada: false, faltantes: Listar_Faltantes(Modo) };
  try {
    const Red = Obtener_Red(Modo);
    Object.assign(Descripcion, {
      configurada: true,
      nombre_red: Red.Nombre_Red,
      chain_id: Red.Chain_Id,
      wallet_emisora: Red.Wallet_Emisora,
      contrato: Red.Direccion_Contrato,
      explorador_url: Red.Explorador_Url,
    });
    await Validar_Red(Modo);
    const Saldo_Wei = await Con_Limite_Tiempo(Red.Web3.eth.getBalance(Red.Wallet_Emisora));
    Descripcion.saldo = Red.Web3.utils.fromWei(Saldo_Wei, 'ether');
    Descripcion.operativa = true;
  } catch (Error_Red) {
    Descripcion.operativa = false;
    Descripcion.error = Error_Red.message;
  }
  return Descripcion;
}

module.exports = {
  Modos_Validos,
  Obtener_Red,
  Obtener_Red_Activa,
  Obtener_Modo_Activo,
  Validar_Red,
  Cambiar_Modo,
  Describir_Red,
  Con_Limite_Tiempo,
};
