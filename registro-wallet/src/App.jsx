import { useState, useEffect } from "react";
import { useWeb3AuthConnect } from "@web3auth/modal/react";
import { useAccount } from "wagmi";

/*
  Recibe tu certificado Web3 — Blockfinity Advisors
  ----------------------------------------------------------------
  Dos caminos:
    - "Ya tengo wallet": la persona pega su dirección 0x...
    - "No tengo wallet": Web3Auth crea una wallet real con login social/correo

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

const CSS = `
  .rc-root{
    --ink:#181b21; --ink-2:#41454e; --muted:#71757e; --faint:#9a9da4;
    --line:#e7e8ec; --line-strong:#d6d8dd;
    --accent:#2f56d3; --accent-press:#2342a8; --accent-weak:#eef2fd; --on-accent:#ffffff;
    --ok:#1f8a52; --ok-weak:#e8f5ee;
    --err:#c0392b; --err-weak:#fbecea;
    --warn:#9a6b00; --warn-weak:#fbf3e0;
    --bg:#f5f6f8; --card:#ffffff;
    --radius:12px; --radius-sm:8px; --radius-xs:6px;
    --shadow-sm:0 1px 2px rgba(20,22,28,.05), 0 1px 3px rgba(20,22,28,.04);
    --shadow-md:0 8px 24px rgba(20,22,28,.10);
    font-family:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    color:var(--ink); background:var(--bg);
    min-height:100vh; width:100%; box-sizing:border-box;
    -webkit-font-smoothing:antialiased;
  }
  .rc-root *{box-sizing:border-box;}
  .rc-topbar{display:flex; align-items:center; justify-content:space-between; padding:20px 24px; border-bottom:1px solid var(--line);}
  .rc-brand{display:inline-flex; align-items:center; gap:10px; font-weight:600; letter-spacing:-0.01em; color:var(--ink); font-size:14px;}
  .rc-logo{height:30px; min-width:30px; padding:0 9px; display:inline-flex; align-items:center; justify-content:center; border-radius:var(--radius-xs); background:var(--accent); color:var(--on-accent); font-weight:600; letter-spacing:.01em; font-size:13px;}
  .rc-tag{font-size:12px; color:var(--muted);}
  .rc-shell{max-width:640px; margin:0 auto; padding:56px 24px 72px;}
  .rc-eyebrow{font-size:12px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:var(--accent); margin:0 0 18px;}
  .rc-seal{margin-bottom:24px;}
  .rc-title{font-size:38px; line-height:1.05; font-weight:600; letter-spacing:-0.025em; color:var(--ink); margin:0 0 16px;}
  .rc-sub{font-size:17px; line-height:1.6; color:var(--muted); margin:0 0 40px; max-width:52ch;}
  .rc-prompt{font-size:14px; font-weight:600; color:var(--ink); margin:0 0 16px;}
  .rc-cards{display:grid; grid-template-columns:1fr 1fr; gap:16px;}
  @media (max-width:560px){ .rc-cards{grid-template-columns:1fr;} .rc-title{font-size:30px;} .rc-shell{padding:40px 20px 56px;} }
  .rc-card{text-align:left; background:var(--card); border:1px solid var(--line); border-radius:var(--radius); padding:22px; cursor:pointer; transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease; display:flex; flex-direction:column; gap:12px; font:inherit; color:inherit; box-shadow:var(--shadow-sm);}
  .rc-card:hover{transform:translateY(-2px); border-color:var(--accent); box-shadow:var(--shadow-md);}
  .rc-card:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}
  .rc-ico{width:44px; height:44px; border-radius:11px; display:grid; place-items:center; background:var(--warn-weak); color:var(--warn);}
  .rc-ico.blue{background:var(--accent-weak); color:var(--accent);}
  .rc-card h3{font-size:16px; font-weight:600; color:var(--ink); margin:0;}
  .rc-card p{font-size:14px; line-height:1.5; color:var(--muted); margin:0;}
  .rc-panel{background:var(--card); border:1px solid var(--line); border-radius:var(--radius); padding:28px; box-shadow:var(--shadow-sm);}
  .rc-back{display:inline-flex; align-items:center; gap:6px; background:none; border:none; color:var(--muted); font:inherit; font-size:14px; cursor:pointer; padding:0; margin:0 0 20px;}
  .rc-back:hover{color:var(--ink);}
  .rc-back:focus-visible{outline:2px solid var(--accent); outline-offset:3px; border-radius:4px;}
  .rc-panel h2{font-size:22px; font-weight:600; letter-spacing:-0.02em; color:var(--ink); margin:0 0 8px;}
  .rc-panel .lead{font-size:15px; line-height:1.55; color:var(--muted); margin:0 0 24px;}
  .rc-label{display:block; font-size:14px; font-weight:600; color:var(--ink-2); margin:0 0 8px;}
  .rc-input{width:100%; font:inherit; font-size:16px; padding:13px 14px; color:var(--ink); background:var(--card); border:1px solid var(--line-strong); border-radius:var(--radius-sm); transition:border-color .15s, box-shadow .15s;}
  .rc-input.mono{font-family:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;}
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
  .rc-addr code{font-family:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace; font-size:13px; color:var(--ink); word-break:break-all;}
  .rc-copy{flex-shrink:0; display:inline-flex; align-items:center; gap:5px; font:inherit; font-size:13px; background:var(--card); border:1px solid var(--line); border-radius:var(--radius-xs); padding:7px 10px; cursor:pointer; color:var(--muted);}
  .rc-copy:hover{color:var(--accent); border-color:var(--accent);}
  .rc-note{display:flex; gap:10px; align-items:flex-start; margin-top:20px; padding:14px; background:var(--warn-weak); border:1px solid #ecdfc2; border-radius:var(--radius-sm); font-size:13.5px; line-height:1.5; color:#6b4d05;}
  .rc-note svg{flex-shrink:0; margin-top:1px;}
  .rc-foot{text-align:center; font-size:12px; color:var(--muted); padding:0 24px 40px;}
  .rc-fade{animation:rc-up .4s ease both;}
  @keyframes rc-up{from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:none;}}
  @media (prefers-reduced-motion:reduce){ .rc-fade,.rc-spin{animation:none;} .rc-card:hover{transform:none;} }
`;

function Seal() {
  const ticks = Array.from({ length: 36 });
  return (
    <svg className="rc-seal" width="66" height="66" viewBox="0 0 66 66" aria-hidden="true">
      <g transform="translate(33,33)">
        {ticks.map((_, i) => {
          const a = (i / ticks.length) * Math.PI * 2;
          const r1 = 29, r2 = i % 3 === 0 ? 25 : 27;
          return (
            <line key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1}
              x2={Math.cos(a) * r2} y2={Math.sin(a) * r2}
              stroke="#2f56d3" strokeWidth="1" strokeLinecap="round" opacity="0.75" />
          );
        })}
        <circle r="22" fill="none" stroke="#2f56d3" strokeWidth="1.5" />
        <circle r="16" fill="#181b21" />
        <path d="M -6 0 L -2 5 L 7 -6" fill="none" stroke="#2f56d3" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function App() {
  // --- Hooks de Web3Auth y Wagmi ---
  // No mostramos w3aError (el estado de error del hook): Web3Auth intenta
  // reconectar en segundo plano al último conector usado (ej. MetaMask si el
  // usuario lo probó antes) y esos fallos ambientales quedan ahí aunque no
  // tengan nada que ver con el intento actual del usuario. Solo confiamos en
  // nuestro propio "error", que fijamos cuando el connect() que NOSOTROS
  // disparamos realmente falla.
  const { connect, isConnected, loading: connecting } = useWeb3AuthConnect();
  const { address: walletAddress } = useAccount();

  // --- Estado de la interfaz ---
  const [path, setPath] = useState(null);      // null | 'have' | 'create'
  const [nombre, setNombre] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);       // null | { address, created }
  const [copied, setCopied] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [walletDetected, setWalletDetected] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const isValidAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(a.trim());

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

  // Cuando Web3Auth termina de conectar y ya hay dirección, guardamos y mostramos éxito.
  useEffect(() => {
    if (pendingCreate && isConnected && walletAddress) {
      setPendingCreate(false);
      (async () => {
        setSaving(true);
        try {
          await guardarRegistro({ nombre: nombre.trim(), wallet: walletAddress, tipo: "creada" });
          setDone({ address: walletAddress, created: true });
        } catch (e) {
          setError(e.message || "No se pudo guardar tu registro. Inténtalo de nuevo.");
        }
        setSaving(false);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCreate, isConnected, walletAddress]);

  async function iniciarCreacion() {
    setError("");
    if (!nombre.trim()) {
      setError("Ingresa tu nombre completo antes de continuar.");
      return;
    }
    // Si ya venía conectado de una sesión previa, usamos esa dirección directo.
    if (isConnected && walletAddress) {
      setSaving(true);
      try {
        await guardarRegistro({ nombre: nombre.trim(), wallet: walletAddress, tipo: "creada" });
        setDone({ address: walletAddress, created: true });
      } catch (e) {
        setError(e.message || "No se pudo guardar tu registro. Inténtalo de nuevo.");
      }
      setSaving(false);
      return;
    }
    setPendingCreate(true);
    try {
      await connect(); // abre el modal de Web3Auth (Google, correo, etc.)
    } catch (e) {
      setPendingCreate(false);
      setError("No se pudo crear la wallet. Inténtalo de nuevo.");
    }
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
      await guardarRegistro({ nombre: nombre.trim(), wallet: address.trim(), tipo: "existente" });
      setDone({ address: address.trim(), created: false });
    } catch (e) {
      setError(e.message || "No se pudo guardar tu registro. Inténtalo de nuevo.");
    }
    setSaving(false);
  }

  async function reset() {
    // El SDK de Web3Auth no soporta bien desconectar y volver a conectar
    // dentro de la MISMA carga de página: su modal interno puede quedar en
    // un estado corrupto (reaparece sin loguear a nadie, no dispara isConnected).
    // Por eso, si la wallet se creó vía Web3Auth, forzamos una recarga limpia
    // en vez de solo resetear el estado de React — así la siguiente persona
    // (o la misma, registrando otra) arranca con el SDK completamente fresco.
    if (done && done.created) {
      window.location.href = window.location.pathname;
      return;
    }
    // Camino "existente" (sin Web3Auth): un reset normal alcanza.
    setPath(null); setNombre(""); setAddress(""); setError("");
    setSaving(false); setDone(null); setCopied(false); setPendingCreate(false);
    setWalletDetected(false); setDetecting(false);
  }

  function copyAddress() {
    try {
      navigator.clipboard?.writeText(done.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) { /* sin portapapeles */ }
  }

  const creando = connecting || pendingCreate || saving;

  return (
    <div className="rc-root">
      <style>{CSS}</style>

      <header className="rc-topbar">
        <div className="rc-brand">
          <span className="rc-logo">CN</span>
          <span>Blockfinity Advisors</span>
        </div>
        <div className="rc-tag">Certificados NFT</div>
      </header>

      <main className="rc-shell">
        {done ? (
          <section className="rc-panel rc-fade" aria-live="polite">
            <div className="rc-ok-badge"><IconCheck /></div>
            <h2>{done.created ? "Tu wallet está lista" : "Todo listo"}</h2>
            <p className="lead">
              {done.created
                ? "Creamos tu wallet y registramos tu dirección. Ahí recibirás tu certificado Web3."
                : "Registramos tu dirección. Ahí recibirás tu certificado Web3."}
            </p>

            <span className="rc-label">Tu dirección</span>
            <div className="rc-addr">
              <code>{done.address}</code>
              <button className="rc-copy" onClick={copyAddress} aria-label="Copiar dirección">
                {copied ? <>Copiado</> : <><IconCopy /> Copiar</>}
              </button>
            </div>

            {done.created && (
              <div className="rc-note">
                <IconShield />
                <span>Podrás volver a entrar a tu wallet con el mismo correo cuando quieras.</span>
              </div>
            )}

            <button className="rc-btn ghost" onClick={reset}>Registrar otra</button>
          </section>
        ) : path === null ? (
          <div className="rc-fade">
            <p className="rc-eyebrow">Certificados NFT</p>
            <Seal />
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
                <p>La creamos en segundos, solo con tu correo. Sin frases secretas.</p>
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
          <section className="rc-panel rc-fade">
            <button className="rc-back" onClick={reset}>← Volver</button>
            <h2>Crea tu wallet</h2>
            <p className="lead">
              Al continuar se abrirá una ventana segura donde inicias sesión con tu correo o tu
              cuenta de Google. En segundos tendrás tu wallet, sin instalar nada ni recordar
              frases secretas.
            </p>

            <div className="rc-field">
              <label className="rc-label" htmlFor="rc-nombre-crear">Nombre completo</label>
              <input id="rc-nombre-crear" className="rc-input" placeholder="Escríbelo tal como quieres que aparezca en tu certificado"
                value={nombre} onChange={(e) => { setNombre(e.target.value); setError(""); }}
                autoComplete="off" />
            </div>

            <button className="rc-btn" onClick={iniciarCreacion} disabled={creando}>
              {creando ? <><span className="rc-spin" /> Creando tu wallet…</> : "Crear mi wallet"}
            </button>

            {error && <p className="rc-error">{error}</p>}
          </section>
        )}
      </main>

      <footer className="rc-foot">
        Blockfinity Advisors · Los certificados se emiten como NFT en la blockchain.
      </footer>
    </div>
  );
}
