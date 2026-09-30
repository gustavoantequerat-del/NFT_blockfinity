import { useState, useEffect, useRef } from "react";
import logoForoColor from "./brand-kit/logos/logo-B_460x67.png";
import logoForoWhite from "./brand-kit/logos/logo-F_460x165.png";
import logoCablockWhite from "./brand-kit/logos/cablock-isotipo-white.png";
import logoAsobanColor from "./brand-kit/logos/asoban-color.png";
import logoAsobanIconWhite from "./brand-kit/logos/asoban-icon-white.png";
import logoBlockfinityWhite from "./brand-kit/logos/blockfinity-white.png";

/*
  Recibe tu certificado Web3 — Blockfinity Advisors
  ----------------------------------------------------------------
  Dos caminos, ambos usando la extensión de MetaMask (window.ethereum):
    - "Ya tengo wallet": la persona pega su dirección 0x... (o la detectamos
      automáticamente si el sitio ya está autorizado).
    - "No tengo wallet": si MetaMask ya está instalada, le pedimos crear/
      conectar una cuenta (se abre el popup propio de la extensión). Si no
      está instalada, abrimos su página de descarga en una pestaña nueva y
      esperamos en segundo plano a que aparezca para reconocerla sola.

  guardarRegistro() llama a nuestro propio backend (POST /api/registro,
  público — no requiere haber iniciado sesión en el panel admin).
*/

// --- Íconos en SVG (sin librerías externas) ---
const IconWallet = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1.2" fill="currentColor" stroke="none" /></svg>
);
const IconSparkles = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4 10.2 11.5 5.3 9.7 10.2 7.9z" /><path d="M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" /></svg>
);
const IconCheck = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>
);
const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
);
const IconClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
);

const CSS = `
  .rc-root{
    --ink:var(--navy); --ink-2:var(--navy); --muted:var(--fg-muted); --faint:var(--fg-faint);
    --accent:var(--teal); --accent-press:var(--teal-deep); --accent-weak:color-mix(in srgb, var(--teal) 12%, transparent); --on-accent:var(--white);
    --ok:#1f8a52; --ok-weak:#e8f5ee;
    --err:#c0392b; --err-weak:#fbecea;
    --warn:#9a6b00; --warn-weak:#fbf3e0;
    --bg:var(--cream);
    --radius:12px; --radius-sm:8px; --radius-xs:6px;
    --shadow-sm:0 1px 2px rgba(20,22,28,.05), 0 1px 3px rgba(20,22,28,.04);
    --shadow-md:0 8px 24px rgba(20,22,28,.10);
    font-family:var(--font-body);
    color:var(--ink); background:var(--bg);
    min-height:100vh; width:100%; box-sizing:border-box;
    -webkit-font-smoothing:antialiased;
    display:flex; flex-direction:column;
  }
  .rc-root *{box-sizing:border-box;}
  .rc-topbar{display:flex; align-items:center; justify-content:space-between; padding:20px 24px; background:var(--navy); border-bottom:1px solid var(--navy-soft);}
  .rc-brand{display:inline-flex; align-items:center; gap:14px; font-weight:600; letter-spacing:-0.01em; color:var(--white); font-size:14px;}
  .rc-brand-sep{width:1px; height:24px; background:var(--navy-soft);}
  .rc-brand-text{display:flex; flex-direction:column; line-height:1.2;}
  .rc-brand-name{font-family:var(--font-display); font-size:18px; font-weight:600; letter-spacing:0.02em; color:var(--white);}
  .rc-brand-tagline{font-family:var(--font-mono); font-size:9px; letter-spacing:0.02em; color:var(--gray-1); text-transform:uppercase; margin-top:1px;}
  .rc-logo-img{height:32px; width:auto; display:block;}
  .rc-logo-img--asoban{height:44px;}
  .rc-logo-img--blockfinity{height:46px;}
  .rc-tag{font-family:var(--font-mono); font-size:12px; color:var(--gray-1);}
  .rc-shell{max-width:640px; margin:0 auto; padding:56px 24px 72px; width:100%; flex:1;}
  .rc-shell--wide{max-width:1160px;}
  .rc-eyebrow{font-family:var(--font-mono); font-size:12px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:var(--accent); margin:0 0 18px;}
  .rc-seal{height:40px; width:auto; display:block; margin-bottom:24px;}
  .rc-seal--asoban{height:64px;}
  .rc-title{font-family:var(--font-display); font-size:38px; line-height:1.05; font-weight:600; letter-spacing:-0.025em; color:var(--ink); margin:0 0 16px;}
  .rc-sub{font-size:17px; line-height:1.6; color:var(--muted); margin:0 0 40px; max-width:52ch;}
  .rc-prompt{font-size:14px; font-weight:600; color:var(--ink); margin:0 0 16px;}
  .rc-cards{display:grid; grid-template-columns:1fr 1fr; gap:16px;}
  @media (max-width:560px){ .rc-cards{grid-template-columns:1fr;} .rc-title{font-size:30px;} .rc-shell{padding:40px 20px 56px;} }
  .rc-card{text-align:left; background:var(--card); border:1px solid var(--line); border-radius:var(--radius); padding:22px; cursor:pointer; transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease; display:flex; flex-direction:column; gap:12px; font:inherit; color:inherit; box-shadow:var(--shadow-sm);}
  .rc-card:hover{transform:translateY(-2px); border-color:var(--accent); box-shadow:var(--shadow-md);}
  .rc-card:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}
  .rc-ico{width:44px; height:44px; border-radius:11px; display:grid; place-items:center; background:var(--warn-weak); color:var(--warn);}
  .rc-ico.blue{background:var(--accent-weak); color:var(--accent);}
  .rc-card h3{font-family:var(--font-display); font-size:16px; font-weight:600; color:var(--ink); margin:0;}
  .rc-card p{font-size:14px; line-height:1.5; color:var(--muted); margin:0;}
  .rc-panel{background:var(--card); border:1px solid var(--line); border-radius:var(--radius); padding:28px; box-shadow:var(--shadow-sm);}
  .rc-back{display:inline-flex; align-items:center; gap:6px; background:none; border:none; color:var(--muted); font:inherit; font-size:14px; cursor:pointer; padding:0; margin:0 0 20px;}
  .rc-back:hover{color:var(--ink);}
  .rc-back:focus-visible{outline:2px solid var(--accent); outline-offset:3px; border-radius:4px;}
  .rc-panel h2{font-family:var(--font-display); font-size:22px; font-weight:600; letter-spacing:-0.02em; color:var(--ink); margin:0 0 8px;}
  .rc-panel .lead{font-size:15px; line-height:1.55; color:var(--muted); margin:0 0 24px;}
  .rc-label{display:block; font-size:14px; font-weight:600; color:var(--ink-2); margin:0 0 8px;}
  .rc-input{width:100%; font:inherit; font-size:16px; padding:13px 14px; color:var(--ink); background:var(--card); border:1px solid var(--line-strong); border-radius:var(--radius-sm); transition:border-color .15s, box-shadow .15s;}
  .rc-input.mono{font-family:var(--font-mono);}
  .rc-input::placeholder{color:var(--faint);}
  .rc-input:focus{outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-weak);}
  .rc-field{margin-bottom:20px;}
  .rc-help{font-size:13px; line-height:1.5; color:var(--muted); margin:8px 0 0;}
  .rc-error{font-size:13px; color:var(--err); margin:12px 0 0;}
  .rc-btn{width:100%; margin-top:4px; font:inherit; font-size:16px; font-weight:600; padding:14px 18px; border-radius:var(--radius-sm); border:1px solid var(--accent); cursor:pointer; background:var(--accent); color:var(--on-accent); display:flex; align-items:center; justify-content:center; gap:8px; transition:background .15s, border-color .15s, opacity .15s;}
  .rc-btn:hover:not(:disabled){background:var(--accent-press); border-color:var(--accent-press);}
  .rc-btn:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}
  .rc-btn:disabled{opacity:.6; cursor:not-allowed;}
  .rc-btn.ghost{background:var(--card); color:var(--ink); border:1.5px solid var(--line-strong); box-shadow:var(--shadow-sm);}
  .rc-btn.ghost:hover:not(:disabled){background:var(--bg); border-color:var(--accent); color:var(--accent);}
  .rc-spin{width:18px; height:18px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:rc-rot 0.8s linear infinite;}
  .rc-spin--dark{border-color:var(--accent-weak); border-top-color:var(--accent);}
  @keyframes rc-rot{to{transform:rotate(360deg);}}
  .rc-ok-badge{width:56px; height:56px; border-radius:50%; background:var(--ok-weak); color:var(--ok); display:grid; place-items:center; margin:0 0 20px;}
  .rc-addr{display:flex; align-items:center; justify-content:space-between; gap:12px; background:var(--bg); border:1px solid var(--line); border-radius:var(--radius-sm); padding:12px 14px; margin:16px 0 0;}
  .rc-addr code{font-family:var(--font-mono); font-size:13px; color:var(--ink); word-break:break-all;}
  .rc-copy{flex-shrink:0; display:inline-flex; align-items:center; gap:5px; font:inherit; font-size:13px; background:var(--card); border:1px solid var(--line); border-radius:var(--radius-xs); padding:7px 10px; cursor:pointer; color:var(--muted);}
  .rc-copy:hover{color:var(--accent); border-color:var(--accent);}
  .rc-note{display:flex; gap:10px; align-items:flex-start; margin-top:20px; padding:14px; background:var(--warn-weak); border:1px solid #ecdfc2; border-radius:var(--radius-sm); font-size:13.5px; line-height:1.5; color:#6b4d05;}
  .rc-note svg{flex-shrink:0; margin-top:1px;}
  .rc-foot{text-align:center; font-size:12px; color:var(--gray-1); background:var(--navy); padding:32px 24px 40px; display:flex; flex-direction:column; align-items:center; gap:10px;}
  .rc-foot-link{color:inherit; text-decoration:underline; text-underline-offset:2px;}
  .rc-foot-link:hover{color:var(--white);}
  .rc-fade{animation:rc-up .4s ease both;}
  @keyframes rc-up{from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:none;}}
  @media (prefers-reduced-motion:reduce){ .rc-fade,.rc-spin{animation:none;} .rc-card:hover{transform:none;} }
  .rc-video{position:relative; width:100%; padding-top:70%; border-radius:var(--radius-sm); overflow:hidden; background:#000; margin:0 0 24px;}
  .rc-video iframe{position:absolute; inset:0; width:100%; height:100%; border:0;}
  .rc-video-row{display:flex; align-items:center; gap:10px; margin:0 0 12px;}
  .rc-video-badge{display:inline-block; flex-shrink:0; font-family:var(--font-mono); font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--on-accent); background:var(--accent); padding:5px 10px; border-radius:999px;}
  .rc-create-layout{display:flex; align-items:flex-start; gap:24px;}
  .rc-create-layout > .rc-panel{flex:1 1 460px; min-width:0;}
  .rc-tutorial-aside{flex:1 1 460px; max-width:460px; background:var(--card); border:1px solid var(--line); border-radius:var(--radius); padding:20px; box-shadow:var(--shadow-sm);}
  @media (max-width:960px){ .rc-create-layout{flex-direction:column;} .rc-tutorial-aside{max-width:100%; width:100%;} }
`;

// Cuánto esperamos, en segundo plano, a que la extensión de MetaMask
// aparezca después de mandar a la persona a instalarla (ver crearWallet()).
const INSTALL_POLL_MS = 1500;
const INSTALL_TIMEOUT_MS = 180000; // 3 minutos

// Usado para retomar el registro solo después de la recarga automática que
// disparamos al volver de la pestaña de instalación (ver el useEffect de
// "focus" y el de reanudación al montar, más abajo).
const SESSION_KEY = "rc_pending_nombre";

// Esta misma app se sirve tanto en /registro como en /registroASOBAN (ver
// server.js) — mismo código y brandeo, solo cambia el texto "Certificados
// NFT ___" y el valor "evento" que se manda al guardar el registro, para que
// el panel admin pueda distinguir de qué módulo vino cada participante.
const IS_ASOBAN = window.location.pathname.toLowerCase().includes("registroasoban");
const EVENTO = IS_ASOBAN ? "asoban" : "foro";
const EYEBROW_TEXT = IS_ASOBAN ? "Certificados NFT ASOBAN" : "Certificados NFT";
const LOGO_COLOR = IS_ASOBAN ? logoAsobanColor : logoForoColor;
const LOGO_ALT = IS_ASOBAN ? "ASOBAN — Asociación de Bancos Privados de Bolivia" : "Foro Activos Digitales Bolivia 2026";

export default function App() {
  // --- Estado de la interfaz ---
  const [path, setPath] = useState(null);      // null | 'have' | 'create'
  const [nombre, setNombre] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false); // esperando a que aparezca la extensión
  const [done, setDone] = useState(null);       // null | { address, created }
  const [copied, setCopied] = useState(false);
  const [walletDetected, setWalletDetected] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [showManualAddr, setShowManualAddr] = useState(false); // respaldo si la detección automática falla
  const installPollRef = useRef(null);

  const isValidAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(a.trim());

  useEffect(() => {
    document.title = IS_ASOBAN
      ? "Recibe tu certificado Web3 · Certificados NFT ASOBAN"
      : "Recibe tu certificado Web3 · Blockfinity Advisors";
  }, []);

  // Limpia el temporizador de espera si la persona navega fuera de esta pantalla.
  useEffect(() => {
    return () => { if (installPollRef.current) clearInterval(installPollRef.current); };
  }, []);

  // Si esta carga de página es producto de la recarga automática (ver el
  // useEffect de "focus" más abajo), retoma el registro sola: restaura el
  // nombre que la persona ya había escrito y, si MetaMask ya está disponible,
  // completa la conexión y el guardado sin pedirle que haga clic de nuevo.
  useEffect(() => {
    const pendienteNombre = sessionStorage.getItem(SESSION_KEY);
    if (!pendienteNombre) return;
    sessionStorage.removeItem(SESSION_KEY);
    setNombre(pendienteNombre);
    setPath("create");
    if (window.ethereum) conectarYGuardar(pendienteNombre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El navegador no inyecta la extensión recién instalada en una pestaña que
  // ya estaba abierta antes de la instalación (por eso el polling de abajo,
  // por sí solo, nunca la detecta). Cuando la persona vuelve a esta pestaña
  // después de instalar MetaMask en la pestaña nueva, si seguimos sin ver
  // window.ethereum, recargamos una sola vez — la recarga sí hace que la
  // extensión se inyecte, y el useEffect de arriba retoma el registro solo.
  useEffect(() => {
    if (!installing) return;
    function handleFocus() {
      if (!window.ethereum) {
        sessionStorage.setItem(SESSION_KEY, nombre.trim());
        window.location.reload();
      }
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [installing, nombre]);

  // Al entrar a "Ya tengo wallet", revisamos en silencio (sin pedir permiso)
  // si el navegador ya tiene una wallet inyectada (MetaMask, Coinbase Wallet,
  // Rabby, etc.) con este sitio ya autorizado, y si es así precargamos su
  // dirección automáticamente.
  useEffect(() => {
    if (path !== "have" || !window.ethereum) return;
    (async () => {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts && accounts[0]) {
          setAddress(accounts[0]);
          setWalletDetected(true);
        }
      } catch (e) { /* sin wallet autorizada todavía: se ingresa manualmente */ }
    })();
  }, [path]);

  // Botón "Detectar mi wallet automáticamente": pide conexión a la wallet
  // inyectada en el navegador. Si el sitio ya estaba autorizado, la extensión
  // devuelve la cuenta al instante sin mostrar ningún popup.
  async function detectarWallet() {
    if (!window.ethereum) {
      setError("No detectamos ninguna wallet instalada en este navegador (MetaMask, Coinbase Wallet, etc.). Ingresa tu dirección manualmente abajo.");
      return;
    }
    setError("");
    setDetecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts && accounts[0]) {
        setAddress(accounts[0]);
        setWalletDetected(true);
      }
    } catch (e) {
      setError("No se pudo conectar con tu wallet. Puedes ingresar la dirección manualmente.");
    }
    setDetecting(false);
  }

  // Guarda el registro en nuestro propio backend (tabla "participantes").
  async function guardarRegistro(datos) {
    const res = await fetch("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || "No se pudo guardar tu registro.");
    }
    return data;
  }

  // Pide a MetaMask que cree/conecte una cuenta (abre el popup propio de la
  // extensión) y, si sale bien, guarda el registro con esa dirección.
  // Acepta el nombre por parámetro (en vez de leerlo solo del estado) porque
  // el retomado automático tras la recarga lo llama en el mismo instante en
  // que restaura "nombre", antes de que ese cambio de estado se refleje.
  async function conectarYGuardar(nombreOverride) {
    const nombreFinal = (nombreOverride ?? nombre).trim();
    setSaving(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const wallet = accounts && accounts[0];
      if (!wallet) throw new Error("No se pudo obtener tu dirección de MetaMask.");
      await guardarRegistro({ nombre: nombreFinal, wallet, tipo: "creada", evento: EVENTO });
      setDone({ address: wallet, created: true });
    } catch (e) {
      setError(e.message || "No se pudo crear tu wallet. Inténtalo de nuevo.");
      setShowManualAddr(true);
    }
    setSaving(false);
  }

  // Si el navegador ya tiene la extensión de MetaMask, le pedimos crear/
  // conectar una cuenta directamente (se abre el popup propio de MetaMask).
  // Si no la tiene, abrimos su página de descarga en una pestaña nueva y
  // esperamos en esta misma pantalla a que aparezca para reconocerla sola,
  // sin que la persona tenga que volver a hacer clic en nada.
  async function crearWallet() {
    setError("");
    if (!nombre.trim()) {
      setError("Ingresa tu nombre completo antes de continuar.");
      return;
    }

    if (window.ethereum) {
      await conectarYGuardar();
      return;
    }

    window.open("https://metamask.io/download/", "_blank", "noopener");
    setInstalling(true);
    let elapsed = 0;
    installPollRef.current = setInterval(() => {
      elapsed += INSTALL_POLL_MS;
      if (window.ethereum) {
        clearInterval(installPollRef.current);
        installPollRef.current = null;
        setInstalling(false);
        conectarYGuardar();
        return;
      }
      if (elapsed >= INSTALL_TIMEOUT_MS) {
        clearInterval(installPollRef.current);
        installPollRef.current = null;
        setInstalling(false);
        setError("No detectamos MetaMask todavía. Si ya terminaste de instalarla, vuelve a hacer clic, o pega tu dirección manualmente abajo.");
        setShowManualAddr(true);
      }
    }, INSTALL_POLL_MS);
  }

  function cancelarEspera() {
    if (installPollRef.current) clearInterval(installPollRef.current);
    installPollRef.current = null;
    setInstalling(false);
  }

  // Respaldo manual dentro de "No tengo wallet": si ya creó su cuenta en
  // MetaMask pero no la detectamos sola, puede pegar la dirección aquí.
  async function submitCreateManual() {
    if (!nombre.trim()) {
      setError("Ingresa tu nombre completo.");
      return;
    }
    if (!isValidAddress(address)) {
      setError("Ingresa una dirección válida: empieza con 0x y tiene 42 caracteres.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await guardarRegistro({ nombre: nombre.trim(), wallet: address.trim(), tipo: "creada", evento: EVENTO });
      setDone({ address: address.trim(), created: true });
    } catch (e) {
      setError(e.message || "No se pudo guardar tu registro. Inténtalo de nuevo.");
    }
    setSaving(false);
  }

  async function submitHave() {
    if (!nombre.trim()) {
      setError("Ingresa tu nombre completo.");
      return;
    }
    if (!isValidAddress(address)) {
      setError("Ingresa una dirección válida: empieza con 0x y tiene 42 caracteres.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await guardarRegistro({ nombre: nombre.trim(), wallet: address.trim(), tipo: "existente", evento: EVENTO });
      setDone({ address: address.trim(), created: false });
    } catch (e) {
      setError(e.message || "No se pudo guardar tu registro. Inténtalo de nuevo.");
    }
    setSaving(false);
  }

  function reset() {
    if (installPollRef.current) clearInterval(installPollRef.current);
    installPollRef.current = null;
    setPath(null); setNombre(""); setAddress(""); setError("");
    setSaving(false); setInstalling(false); setDone(null); setCopied(false);
    setWalletDetected(false); setDetecting(false); setShowManualAddr(false);
  }

  function copyAddress() {
    try {
      navigator.clipboard?.writeText(done.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) { /* sin portapapeles */ }
  }

  const creando = installing || saving;

  return (
    <div className="rc-root">
      <style>{CSS}</style>

      <header className="rc-topbar">
        <div className="rc-brand">
          {IS_ASOBAN ? (
            <>
              <img src={logoAsobanIconWhite} alt="" className="rc-logo-img rc-logo-img--asoban" />
              <div className="rc-brand-text">
                <span className="rc-brand-name">ASOBAN</span>
                <span className="rc-brand-tagline">Asociación de Bancos Privados de Bolivia</span>
              </div>
              <span className="rc-brand-sep" />
              <img src={logoBlockfinityWhite} alt="Blockfinity Advisors" className="rc-logo-img rc-logo-img--blockfinity" />
            </>
          ) : (
            <>
              <img src={logoCablockWhite} alt="Cámara Boliviana de Blockchain (CABLOCK)" className="rc-logo-img" />
              <span className="rc-brand-sep" />
              <img src={logoForoWhite} alt="Foro Activos Digitales Bolivia 2026" className="rc-logo-img" />
            </>
          )}
        </div>
      </header>

      <main className={"rc-shell" + (path === "create" && !done ? " rc-shell--wide" : "")}>
        {done ? (
          <section className="rc-panel rc-fade" aria-live="polite">
            <div className="rc-ok-badge"><IconCheck /></div>
            <h2>{done.created ? "Tu wallet está lista" : "Todo listo"}</h2>
            <p className="lead">
              {done.created
                ? "Creamos tu wallet en MetaMask y registramos tu dirección. Ahí recibirás tu certificado Web3."
                : "Registramos tu dirección. Ahí recibirás tu certificado Web3."}
            </p>

            <span className="rc-label">Tu dirección</span>
            <div className="rc-addr">
              <code>{done.address}</code>
              <button className="rc-copy" onClick={copyAddress} aria-label="Copiar dirección">
                {copied ? <>Copiado</> : <><IconCopy /> Copiar</>}
              </button>
            </div>

            <div className="rc-note">
              <IconClock />
              <span>La generación de tu certificado no es inmediata: tu NFT llegará a esta wallet dentro de 2 a 3 días hábiles.</span>
            </div>

            {done.created && (
              <div className="rc-note">
                <IconShield />
                <span>Guarda bien tu frase de recuperación de MetaMask: es la única forma de volver a acceder a esta wallet si cambias de computadora o navegador.</span>
              </div>
            )}

            <button className="rc-btn ghost" onClick={reset}>Registrar otra</button>
          </section>
        ) : path === null ? (
          <div className="rc-fade">
            <p className="rc-eyebrow">{EYEBROW_TEXT}</p>
            <img src={LOGO_COLOR} alt={LOGO_ALT} className={"rc-seal" + (IS_ASOBAN ? " rc-seal--asoban" : "")} />
            <h1 className="rc-title">Recibe tu certificado Web3</h1>
            <p className="rc-sub">
              Tu certificado será un documento digital (NFT) que vive en la blockchain, a tu
              nombre. Solo necesitas una wallet donde recibirlo.
            </p>

            <p className="rc-prompt">¿Ya tienes una wallet?</p>
            <div className="rc-cards">
              <button className="rc-card" onClick={() => { setPath("have"); setError(""); }}>
                <div className="rc-ico blue"><IconWallet /></div>
                <h3>Sí, ya tengo una</h3>
                <p>Ingresa la dirección donde quieres recibir tu certificado.</p>
              </button>
              <button className="rc-card" onClick={() => { setPath("create"); setError(""); }}>
                <div className="rc-ico"><IconSparkles /></div>
                <h3>No, créala por mí</h3>
                <p>Te ayudamos a crearla con MetaMask en un par de minutos.</p>
              </button>
            </div>
          </div>
        ) : path === "have" ? (
          <section className="rc-panel rc-fade">
            <button className="rc-back" onClick={reset}>← Volver</button>
            <h2>Ingresa tus datos</h2>
            <p className="lead">Con esto recibirás tu certificado Web3.</p>

            <div className="rc-field">
              <label className="rc-label" htmlFor="rc-nombre">Nombre completo</label>
              <input id="rc-nombre" className="rc-input" placeholder="Escríbelo tal como quieres que aparezca en tu certificado"
                value={nombre} onChange={(e) => { setNombre(e.target.value); setError(""); }}
                autoComplete="off" />
            </div>

            <button type="button" className="rc-btn ghost" onClick={detectarWallet} disabled={detecting} style={{ marginBottom: 18 }}>
              {detecting
                ? <><span className="rc-spin rc-spin--dark" /> Buscando tu wallet…</>
                : <><IconWallet /> Detectar mi wallet automáticamente</>}
            </button>

            <label className="rc-label" htmlFor="rc-addr">Dirección de tu wallet</label>
            <input id="rc-addr" className="rc-input mono" placeholder="0x..."
              value={address}
              onChange={(e) => { setAddress(e.target.value); setWalletDetected(false); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submitHave()} autoComplete="off" />
            {error
              ? <p className="rc-error">{error}</p>
              : walletDetected
                ? <p className="rc-help" style={{ color: "var(--ok)" }}>Detectamos esta dirección en tu wallet conectada. Si no es la correcta, puedes editarla arriba.</p>
                : <p className="rc-help">Es la dirección pública que empieza con 0x (no una frase secreta ni una clave privada). También puedes pegarla manualmente.</p>}

            <button className="rc-btn" onClick={submitHave} disabled={saving}>
              {saving ? <><span className="rc-spin" /> Registrando…</> : "Registrar mi dirección"}
            </button>
          </section>
        ) : (
          <div className="rc-create-layout rc-fade">
            <section className="rc-panel">
              <button className="rc-back" onClick={reset}>← Volver</button>
              <h2>Crea tu wallet</h2>
              <p className="lead">
                Al continuar te pediremos crear o conectar una cuenta en MetaMask. Si todavía no
                tienes la extensión instalada, abriremos su página de descarga en una pestaña nueva
                — apenas termines de instalarla, la reconoceremos automáticamente aquí mismo.
              </p>

              <div className="rc-field">
                <label className="rc-label" htmlFor="rc-nombre-crear">Nombre completo</label>
                <input id="rc-nombre-crear" className="rc-input" placeholder="Escríbelo tal como quieres que aparezca en tu certificado"
                  value={nombre} onChange={(e) => { setNombre(e.target.value); setError(""); }}
                  autoComplete="off" />
              </div>

              <button className="rc-btn" onClick={crearWallet} disabled={creando}>
                {installing
                  ? <><span className="rc-spin" /> Esperando a que instales MetaMask…</>
                  : saving
                    ? <><span className="rc-spin" /> Creando tu wallet…</>
                    : "Crear mi wallet en MetaMask"}
              </button>

              {installing && (
                <button type="button" className="rc-back" style={{ display: "block", margin: "14px auto 0" }} onClick={cancelarEspera}>
                  Cancelar
                </button>
              )}

              {error && <p className="rc-error">{error}</p>}

              {showManualAddr && (
                <div className="rc-field" style={{ marginTop: 20, marginBottom: 0 }}>
                  <label className="rc-label" htmlFor="rc-addr-crear">¿Ya la creaste? Pega aquí tu dirección</label>
                  <input id="rc-addr-crear" className="rc-input mono" placeholder="0x..."
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && submitCreateManual()} autoComplete="off" />
                  <button type="button" className="rc-btn ghost" style={{ marginTop: 12 }} onClick={submitCreateManual} disabled={saving}>
                    {saving ? <><span className="rc-spin rc-spin--dark" /> Registrando…</> : "Registrar esta dirección"}
                  </button>
                </div>
              )}
            </section>

            <aside className="rc-tutorial-aside">
              <div className="rc-video-row">
                <span className="rc-video-badge">Tutorial</span>
                <span className="rc-label" style={{ margin: 0 }}>¿No sabes cómo?</span>
              </div>
              <div className="rc-video" style={{ margin: 0 }}>
                <iframe
                  src="https://drive.google.com/file/d/1fSbIMM9m6RrctzjhcVGvPYvA14zepffK/preview"
                  title="Tutorial: cómo crear tu wallet en MetaMask"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </aside>
          </div>
        )}
      </main>

      <footer className="rc-foot">
        <span>Created by <a href="https://www.blockfinityadvisors.com/" target="_blank" rel="noopener noreferrer" className="rc-foot-link">Blockfinity Advisors</a></span>
      </footer>
    </div>
  );
}
