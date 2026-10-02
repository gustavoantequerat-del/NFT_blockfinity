// Operaciones sobre el contrato de certificados. Todas reciben la "Red"
// (ver Configuracion_Red.js) para funcionar igual en test y en main.

function Esperar(Milisegundos) {
  return new Promise((Resolver) => setTimeout(Resolver, Milisegundos));
}

// Consulta el receipt hasta que la transacción esté minada (máx. ~15 min).
async function Esperar_Recibo(Red, Hash_Transaccion, Intentos = 180, Pausa = 5000) {
  for (let Intento = 1; Intento <= Intentos; Intento++) {
    try {
      const Recibo = await Red.Web3.eth.getTransactionReceipt(Hash_Transaccion);
      if (Recibo) {
        if (!Recibo.status) throw new Error(`La transacción fue minada pero falló: ${Hash_Transaccion}`);
        return Recibo;
      }
    } catch (Error_Recibo) {
      if (!/not found/i.test(String(Error_Recibo.message))) throw Error_Recibo;
    }
    console.log(`⏳ Esperando confirmación ${Intento}/${Intentos}: ${Hash_Transaccion}`);
    await Esperar(Pausa);
  }
  throw new Error(`La transacción no fue confirmada a tiempo: ${Hash_Transaccion}`);
}

// Firma y envía la transacción. Al_Obtener_Hash(hash) se llama apenas la red
// la acepta, antes de que esté confirmada.
async function Enviar_Transaccion(Red, Transaccion, Al_Obtener_Hash) {
  const Firmada = await Red.Web3.eth.accounts.signTransaction(Transaccion, Red.Clave_Privada);
  const Hash_Transaccion = await new Promise((Resolver, Rechazar) => {
    const Envio = Red.Web3.eth.sendSignedTransaction(Firmada.rawTransaction);
    Envio.once('transactionHash', Resolver);
    Envio.on('error', Rechazar);
    // Web3 v4 también rechaza la promesa interna (ej. timeouts de bloque).
    // Si el hash ya existe, se ignora: el receipt se consulta abajo.
    Envio.catch(Rechazar);
  });
  console.log('Transacción enviada:', Hash_Transaccion);
  if (Al_Obtener_Hash) Al_Obtener_Hash(Hash_Transaccion);
  return Esperar_Recibo(Red, Hash_Transaccion);
}

// Lee el tokenId del evento Transfer del receipt (mint = Transfer desde 0x0).
function Leer_Token_Id_Del_Recibo(Red, Recibo) {
  const Firma_Transfer = Red.Web3.utils.keccak256('Transfer(address,address,uint256)');
  const Registro = (Recibo.logs || []).find((Log) =>
    String(Log.address).toLowerCase() === Red.Direccion_Contrato.toLowerCase() &&
    String(Log.topics?.[0]).toLowerCase() === Firma_Transfer.toLowerCase()
  );
  return Registro ? Number(BigInt(Registro.topics[3])) : null;
}

// El contrato asigna como tokenId el valor actual de tokenCounter.
async function Obtener_Siguiente_Token_Id(Red) {
  return Number(await Red.Contrato.methods.tokenCounter().call());
}

// Mintea el certificado directo a la wallet del alumno.
async function Mintear_Certificado(Red, Wallet_Destino, Token_Uri, Al_Obtener_Hash) {
  const Metodo = Red.Contrato.methods.createCertificate(Wallet_Destino, Token_Uri);
  const Desde = Red.Wallet_Emisora;

  await Metodo.call({ from: Desde }); // simula primero: si revierte, no gasta gas
  const Gas_Estimado = await Metodo.estimateGas({ from: Desde });
  const Precio_Gas = await Red.Web3.eth.getGasPrice();
  const Nonce = await Red.Web3.eth.getTransactionCount(Desde, 'pending');

  const Recibo = await Enviar_Transaccion(Red, {
    from: Desde,
    to: Red.Direccion_Contrato,
    data: Metodo.encodeABI(),
    gas: Math.ceil(Number(Gas_Estimado) * 1.2),
    // 30 % sobre el precio actual para que la tx no quede atascada.
    gasPrice: ((BigInt(Precio_Gas) * 130n) / 100n).toString(),
    nonce: Number(Nonce),
    chainId: Red.Chain_Id,
    value: '0x0',
  }, Al_Obtener_Hash);

  return { Token_Id: Leer_Token_Id_Del_Recibo(Red, Recibo), Recibo };
}

// Devuelve { Propietario, Token_Uri } o null si el token no existe.
async function Consultar_Token(Red, Token_Id) {
  try {
    const Propietario = await Red.Contrato.methods.ownerOf(Token_Id).call();
    const Token_Uri = await Red.Contrato.methods.tokenURI(Token_Id).call();
    return { Propietario, Token_Uri };
  } catch (_) {
    return null;
  }
}

// Los mints se ejecutan de a uno: así el tokenId que se lee antes de mintear
// (y que va dentro del QR) es el mismo que asigna el contrato.
let Cola_Minteo = Promise.resolve();
function En_Cola_De_Minteo(Tarea) {
  const Resultado = Cola_Minteo.then(Tarea);
  Cola_Minteo = Resultado.catch(() => {});
  return Resultado;
}

function Es_Wallet_Valida(Wallet) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(Wallet || '').trim());
}

module.exports = {
  Obtener_Siguiente_Token_Id,
  Mintear_Certificado,
  Consultar_Token,
  En_Cola_De_Minteo,
  Es_Wallet_Valida,
};
