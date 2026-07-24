const { Web3 } = require('web3');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
//const pdfPoppler = require('pdf-poppler');
// Por esto:
const { fromPath } = require('pdf2pic');

const rpcUrl = process.env.RPC_URL?.trim();
const universityWallet = process.env.UNIVERSITY_WALLET?.trim();
const privateKey = process.env.PRIVATE_KEY?.trim();
const contractAddress = process.env.CONTRACT_ADDRESS?.trim();
const expectedChainId = Number(process.env.EXPECTED_CHAIN_ID || 1);

const explorerBaseUrl =
  process.env.EXPLORER_BASE_URL?.trim() || 'https://etherscan.io/tx/';

if (!rpcUrl) throw new Error('RPC_URL no está definida');
if (!universityWallet) throw new Error('UNIVERSITY_WALLET no está definida');
if (!privateKey) throw new Error('PRIVATE_KEY no está definida');
if (!contractAddress) throw new Error('CONTRACT_ADDRESS no está definida');

if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  throw new Error('PRIVATE_KEY inválida');
}

const web3 = new Web3(rpcUrl);
const derivedAccount = web3.eth.accounts.privateKeyToAccount(privateKey);

console.log('Wallet derivada de PRIVATE_KEY:', derivedAccount.address);
console.log('UNIVERSITY_WALLET configurada:', universityWallet);
console.log('CONTRACT_ADDRESS configurada:', contractAddress);
console.log('RPC_URL configurada:', rpcUrl);
console.log('EXPECTED_CHAIN_ID:', expectedChainId, expectedChainId === 1 ? '(⚠️ MAINNET, gas real)' : '(testnet)');

if (derivedAccount.address.toLowerCase() !== universityWallet.toLowerCase()) {
  throw new Error('UNIVERSITY_WALLET no coincide con la PRIVATE_KEY');
}

// ======================================================
// ABI COMPLETO del contrato real (CertificateNFT.sol)
// ======================================================

const contractABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "initialOwner", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "sender", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "address", "name": "owner", "type": "address" }
    ],
    "name": "ERC721IncorrectOwner",
    "type": "error"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "ERC721InsufficientApproval",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "approver", "type": "address" }],
    "name": "ERC721InvalidApprover",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "operator", "type": "address" }],
    "name": "ERC721InvalidOperator",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "ERC721InvalidOwner",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "receiver", "type": "address" }],
    "name": "ERC721InvalidReceiver",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "sender", "type": "address" }],
    "name": "ERC721InvalidSender",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ERC721NonexistentToken",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "approved", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "operator", "type": "address" },
      { "indexed": false, "internalType": "bool", "name": "approved", "type": "bool" }
    ],
    "name": "ApprovalForAll",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "_fromTokenId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "_toTokenId", "type": "uint256" }
    ],
    "name": "BatchMetadataUpdate",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "tokenURI", "type": "string" }
    ],
    "name": "CertificateCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "uint256", "name": "_tokenId", "type": "uint256" }],
    "name": "MetadataUpdate",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "string", "name": "uri", "type": "string" }
    ],
    "name": "createCertificate",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "getApproved",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "operator", "type": "address" }
    ],
    "name": "isApprovedForAll",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ownerOf",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "bytes", "name": "data", "type": "bytes" }
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "bool", "name": "approved", "type": "bool" }
    ],
    "name": "setApprovalForAll",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes4", "name": "interfaceId", "type": "bytes4" }],
    "name": "supportsInterface",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "tokenCounter",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "tokenURI",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "transferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Instancia del contrato ya lista para llamar sus funciones (createCertificate, owner, etc).
const nftContract = new web3.eth.Contract(contractABI, contractAddress);

// Margen sobre el gas price de la red para reducir el riesgo de que una tx
// quede atascada sin minar si el precio sube justo después de consultarlo.
function bufferedGasPrice(gasPrice) {
  return ((BigInt(gasPrice) * 130n) / 100n).toString();
}

// Confirma que el RPC configurado realmente apunta a la red esperada
// (Mainnet o testnet) antes de dejar arrancar el servidor.
async function validateNetwork() {
  const chainId = await web3.eth.getChainId();

  if (Number(chainId) !== expectedChainId) {
    throw new Error(`Red incorrecta. Esperado ${expectedChainId}, recibido ${chainId}`);
  }

  console.log('✅ Red correcta:', chainId.toString());
}

// Convierte la primera página de un PDF a una imagen PNG (se usa como
// "image" del NFT, ya que wallets y marketplaces esperan una imagen).
async function generatePdfPreview(pdfPath) {
  const outputDir = path.dirname(pdfPath);
  const baseName = path.parse(pdfPath).name;
  const outputPrefix = `${baseName}-preview`;

  const options = {
    density: 100,
    saveFilename: outputPrefix,
    savePath: outputDir,
    format: 'png',
    width: 800,
    height: 600
  };

  const storeAsImage = fromPath(pdfPath, options);
  
  // Convierte la página 1
  await storeAsImage(1, { responseType: 'image' });

  const previewPath = path.join(outputDir, `${outputPrefix}.1.png`);

  if (!fs.existsSync(previewPath)) {
    throw new Error('No se pudo generar la imagen preview del PDF');
  }

  return previewPath;
}

// Sube un archivo (PDF o PNG) a Pinata/IPFS y devuelve su CID (hash de contenido).
async function uploadFileToIPFS(filePath) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));

  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        maxBodyLength: Infinity,
        headers: {
          ...formData.getHeaders(),
          pinata_api_key: process.env.PINATA_API_KEY?.trim(),
          pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY?.trim(),
        },
      }
    );

    return response.data.IpfsHash;
  } catch (error) {
    throw new Error('No se pudo subir el archivo a IPFS');
  }
}

// Sube el JSON de metadata del NFT (nombre, imagen, atributos) a Pinata/IPFS
// y devuelve su CID — ese CID es el que se usa como tokenURI al mintear.
async function uploadJSONToIPFS(jsonData) {
  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      jsonData,
      {
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: process.env.PINATA_API_KEY?.trim(),
          pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY?.trim(),
        },
      }
    );

    return response.data.IpfsHash;
  } catch (error) {
    throw new Error('No se pudo subir el JSON metadata a IPFS');
  }
}

// Pausa la ejecución por los milisegundos indicados (para esperar entre reintentos).
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Consulta repetidamente la blockchain hasta que la transacción tenga
// receipt (esté minada). Si el receipt indica que falló, lanza un error.
async function waitForTransactionReceipt(txHash, maxAttempts = 180, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const receipt = await web3.eth.getTransactionReceipt(txHash);

      if (receipt) {
        if (!receipt.status) {
          throw new Error(`La transacción fue minada pero falló: ${txHash}`);
        }

        return receipt;
      }
    } catch (error) {
      const message = String(error.message || '').toLowerCase();

      if (!message.includes('transaction not found')) {
        throw error;
      }
    }

    console.log(`⏳ Esperando confirmación ${attempt}/${maxAttempts}: ${txHash}`);
    await sleep(delayMs);
  }

  throw new Error(`La transacción no fue confirmada a tiempo: ${txHash}`);
}

// onHash(hash) se invoca en cuanto la red acepta la transacción (segundos),
// mucho antes de que esté confirmada — así el llamador puede notificar de
// inmediato en vez de quedar en silencio hasta que todo termine.
async function sendSignedTransactionAndWait(tx, onHash) {
  const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);

  return await new Promise((resolve, reject) => {
    let txHash = null;
    let settled = false;

    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    // Si ya conocemos el hash, un "error" (incluyendo timeouts internos de
    // Web3.js por bloques lentos) no significa que la tx haya fallado: puede
    // seguir minándose. Confirmamos consultando el receipt directamente.
    const resolveViaReceiptOrReject = async (error) => {
      if (txHash) {
        try {
          const receipt = await waitForTransactionReceipt(txHash);
          settleResolve(receipt);
          return;
        } catch (receiptError) {
          settleReject(receiptError);
          return;
        }
      }

      settleReject(error);
    };

    const promiEvent = web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    promiEvent
      .once('transactionHash', async (hash) => {
        try {
          txHash = hash;
          console.log('Hash generado. Esperando confirmación en blockchain...:', hash);
          if (onHash) onHash(hash);

          const receipt = await waitForTransactionReceipt(hash);
          settleResolve(receipt);
        } catch (error) {
          settleReject(error);
        }
      })
      .once('receipt', (receipt) => {
        settleResolve(receipt);
      })
      .on('error', resolveViaReceiptOrReject);

    // Web3.js v4 también puede rechazar la promesa subyacente del PromiEvent
    // directamente (p.ej. TransactionBlockTimeoutError), sin pasar por el
    // evento 'error'. Sin este catch, eso queda como unhandled rejection y
    // tumba el proceso completo de Node.
    promiEvent.catch(resolveViaReceiptOrReject);
  });
}

// Mintea el certificado DIRECTO a la wallet final (toWallet puede ser la del
// alumno) — el contrato no requiere pasar primero por la wallet universidad.
// onHash(hash), si se pasa, se invoca en cuanto existe el hash de la
// transacción, sin esperar a que esté confirmada.
async function mintCertificate(toWallet, tokenURI, onHash) {
  const chainId = await web3.eth.getChainId();

  if (Number(chainId) !== expectedChainId) {
    throw new Error(`Red incorrecta para mint. Esperado ${expectedChainId}, recibido ${chainId}`);
  }

  const contractOwner = await nftContract.methods.owner().call();

  if (contractOwner.toLowerCase() !== universityWallet.toLowerCase()) {
    throw new Error('La wallet universidad no es owner del contrato');
  }

  const tokenIdBeforeMint = await nftContract.methods.tokenCounter().call();

  const method = nftContract.methods.createCertificate(toWallet, tokenURI);

  await method.call({ from: universityWallet });

  const gasEstimate = await method.estimateGas({ from: universityWallet });
  const gasPrice = await web3.eth.getGasPrice();
  const nonce = await web3.eth.getTransactionCount(universityWallet, 'pending');

  const tx = {
    from: universityWallet,
    to: contractAddress,
    data: method.encodeABI(),
    gas: Math.ceil(Number(gasEstimate) * 1.2),
    gasPrice: bufferedGasPrice(gasPrice),
    nonce: Number(nonce),
    chainId: Number(chainId),
    value: '0x0',
  };

  const receipt = await sendSignedTransactionAndWait(tx, onHash);

  return {
    tokenId: Number(tokenIdBeforeMint),
    receipt,
  };
}

module.exports = {
  web3,
  nftContract,
  universityWallet,
  contractAddress,
  explorerBaseUrl,
  expectedChainId,
  validateNetwork,
  generatePdfPreview,
  uploadFileToIPFS,
  uploadJSONToIPFS,
  mintCertificate,
};
