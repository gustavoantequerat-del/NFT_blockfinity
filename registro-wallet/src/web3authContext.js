import { WEB3AUTH_NETWORK, WALLET_CONNECTORS } from "@web3auth/modal";

// El Client ID sale de tu propio proyecto en dashboard.web3auth.io (ver README).
// SAPPHIRE_DEVNET es para desarrollo/pruebas; en producción se usa un
// Client ID distinto creado en un proyecto de Sapphire Mainnet.
const web3AuthContextConfig = {
  web3AuthOptions: {
    clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    // Whitelabel: Web3Auth es, en los hechos, el mismo producto que MetaMask
    // llama "MetaMask Embedded Wallets" (por eso el proyecto se crea en
    // developer.metamask.io). Mostramos esa marca en el modal en vez del
    // nombre genérico "Web3Auth" para que se sienta consistente con lo que
    // realmente está pasando por debajo.
    uiConfig: {
      appName: "MetaMask",
    },
    // Este modal solo se abre desde "No tengo wallet": ocultamos las opciones
    // de conectar una wallet YA EXISTENTE (MetaMask, WalletConnect y "todas
    // las billeteras") para que solo quede visible el login por correo/Google
    // que crea la wallet nueva. OJO: "connectors" REEMPLAZA la config por
    // defecto (no se fusiona), así que hay que repetir "auth: showOnModal
    // true" aquí o el login social/correo desaparece del modal.
    modalConfig: {
      hideWalletDiscovery: true,
      connectors: {
        [WALLET_CONNECTORS.AUTH]: { label: "Auth", showOnModal: true },
        [WALLET_CONNECTORS.METAMASK]: { label: "MetaMask", showOnModal: false },
        [WALLET_CONNECTORS.WALLET_CONNECT_V2]: { label: "WalletConnect", showOnModal: false },
      },
    },
  },
};

export default web3AuthContextConfig;
