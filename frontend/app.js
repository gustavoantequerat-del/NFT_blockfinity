/* ============================================================
   Certificados NFT · App — navegación, branding y simulaciones
   ============================================================ */
(function () {
  "use strict";

  var LS_LOGO   = "certnft_logo";
  var LS_NAME   = "certnft_instname";
  var LS_SCREEN = "certnft_screen";
  var LS_TOKEN  = "certnft_token";

  /* ---------------- branding (white-label) ---------------- */
  function defaultLogoMarkup(name) {
    var initials = (name || "Certificados NFT").trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0] ? w[0].toUpperCase() : ""; }).join("");
    if (!initials) initials = "CN";
    return '<span class="logo-fallback"><span class="glyph"></span>' + initials + "</span>";
  }

  function isValidLogo(v) {
    return typeof v === "string" && /^data:image\//.test(v) && v.length > 500;
  }

  function applyBranding() {
    var logo = localStorage.getItem(LS_LOGO);
    if (!isValidLogo(logo)) logo = null;
    var name = localStorage.getItem(LS_NAME) || "Certificados NFT";

    document.querySelectorAll("[data-brand] .logo-slot").forEach(function (slot) {
      slot.innerHTML = logo
        ? '<img class="logo-img" src="' + logo + '" alt="Logo institución" />'
        : defaultLogoMarkup(name);
    });
    document.querySelectorAll("[data-brand-name]").forEach(function (el) {
      el.textContent = name;
    });

    var nameInput = document.getElementById("cfg-instname");
    if (nameInput && document.activeElement !== nameInput)
      nameInput.value = (name === "Certificados NFT" ? "" : name);

    var prev      = document.getElementById("logo-preview");
    var removeBtn = document.getElementById("logo-remove-btn");
    if (prev) {
      if (logo) {
        prev.innerHTML = '<img src="' + logo + '" alt="Logo" />';
        if (removeBtn) removeBtn.hidden = false;
      } else {
        prev.innerHTML = '<span class="ph-txt">SIN LOGO<br />sube un archivo<br />de imagen</span>';
        if (removeBtn) removeBtn.hidden = true;
      }
    }
  }

  /* ---------------- view + screen routing ---------------- */
  var loginView = document.getElementById("view-login");
  var appView   = document.getElementById("view-app");

  var titles = {
    dashboard: ["Inicio",        ""],
    wizard:    ["Nueva emisión", ""],
    config:    ["Configuración", ""],
    progress:  ["Nueva emisión", "Procesando"],
    result:    ["Resultado",     "Egreso-Derecho-2026A"],
  };
  var navFor = {
    dashboard: "dashboard", wizard: "wizard", config: "config",
    progress: "wizard",     result: "wizard",
  };

  // Al cambiar de pantalla, dispara la carga de datos reales si corresponde (dashboard/progreso/resultado).
  function showScreen(name) {
    if (!titles[name]) name = "dashboard";

    loginView.classList.remove("active");
    appView.classList.add("active");

    document.querySelectorAll("[data-screen-panel]").forEach(function (p) {
      p.style.display = p.getAttribute("data-screen-panel") === name ? "" : "none";
    });
    document.querySelectorAll(".nav-item[data-screen]").forEach(function (n) {
      n.classList.toggle("active", n.getAttribute("data-screen") === navFor[name]);
    });

    var t = titles[name];
    document.getElementById("topbar-title").textContent  = t[0];
    document.getElementById("topbar-crumb").textContent  = t[1] ? "· " + t[1] : "";
    document.getElementById("content").scrollTop = 0;
    window.scrollTo(0, 0);
    localStorage.setItem(LS_SCREEN, name);

    if (name === "progress")  startProgress();
    if (name === "result")    renderResultScreen();
    if (name === "dashboard") loadDashboard();
  }

  /* ---------------- panel routing (login / register / forgot / reset) ---------------- */
  var PANELS = ["login", "register", "forgot", "reset", "restricted"];

  function showPanel(name) {
    PANELS.forEach(function (p) {
      var el = document.getElementById("panel-" + p);
      if (el) el.style.display = (p === name) ? "" : "none";
    });
  }

  /* ---------------- helper: rellenar datos de usuario en sidebar ---------------- */
  function setUserInfo(nombre) {
    var nameEl = document.getElementById("sidebar-nombre");
    var avatar = document.getElementById("sidebar-avatar");
    if (nameEl && nombre) nameEl.textContent = nombre;
    if (avatar && nombre) {
      avatar.textContent = nombre.trim().split(/\s+/).slice(0, 2)
        .map(function (w) { return w[0] ? w[0].toUpperCase() : ""; }).join("");
    }
  }

  /* ---------------- login (conectado al API) ---------------- */
  function initLogin() {
    var btn    = document.getElementById("login-btn");
    var errEl  = document.getElementById("login-error");
    var errMsg = document.getElementById("login-error-msg");
    if (!btn) return;

    function setError(msg) {
      if (errEl)  errEl.style.display  = "";
      if (errMsg) errMsg.textContent   = msg;
    }
    function clearError() {
      if (errEl) errEl.style.display = "none";
    }

    ["li-user", "li-pass"].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") btn.click();
      });
    });

    btn.addEventListener("click", function () {
      clearError();
      var correo     = (document.getElementById("li-user").value || "").trim();
      var contrasena = document.getElementById("li-pass").value || "";

      if (!correo || !contrasena) {
        setError("Ingresa tu correo y contraseña.");
        return;
      }

      btn.disabled    = true;
      btn.textContent = "Iniciando sesión…";

      fetch("/api/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ correo: correo, contrasena: contrasena }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (r) {
          if (!r.ok) {
            setError(r.data.error || "Error de autenticación.");
            return;
          }
          localStorage.setItem(LS_TOKEN, r.data.token);
          if (r.data.usuario) setUserInfo(r.data.usuario.nombre);
          showScreen("dashboard");
          ensureConfigLoaded(function () {});
        })
        .catch(function () {
          setError("No se pudo conectar con el servidor.");
        })
        .finally(function () {
          btn.disabled    = false;
          btn.textContent = "Iniciar sesión";
        });
    });
  }

  /* ---------------- registro de usuario ---------------- */
  function initRegister() {
    var btn    = document.getElementById("reg-btn");
    var errEl  = document.getElementById("reg-error");
    var errMsg = document.getElementById("reg-error-msg");
    if (!btn) return;

    function setError(msg) {
      if (errEl)  errEl.style.display  = "";
      if (errMsg) errMsg.textContent   = msg;
    }
    function clearError() {
      if (errEl) errEl.style.display = "none";
    }

    var goReg   = document.getElementById("go-register");
    var goLogin = document.getElementById("go-login-from-reg");
    if (goReg)   goReg.addEventListener("click",   function (e) { e.preventDefault(); clearError(); showPanel("register"); });
    if (goLogin) goLogin.addEventListener("click", function (e) { e.preventDefault(); clearError(); showPanel("login"); });

    ["reg-name", "reg-user", "reg-pass"].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    });

    btn.addEventListener("click", function () {
      clearError();
      var nombre     = (document.getElementById("reg-name").value || "").trim();
      var correo     = (document.getElementById("reg-user").value || "").trim();
      var contrasena = document.getElementById("reg-pass").value || "";

      if (!nombre || !correo || !contrasena) {
        setError("Todos los campos son requeridos."); return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        setError("El correo no tiene un formato válido."); return;
      }
      if (contrasena.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres."); return;
      }

      btn.disabled    = true;
      btn.textContent = "Creando cuenta…";

      fetch("/api/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ nombre: nombre, correo: correo, contrasena: contrasena }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (r) {
          if (!r.ok) { setError(r.data.error || "Error al crear la cuenta."); return; }
          document.getElementById("reg-name").value = "";
          document.getElementById("reg-user").value = "";
          document.getElementById("reg-pass").value = "";
          showPanel("login");
          var suc    = document.getElementById("login-success");
          var sucMsg = document.getElementById("login-success-msg");
          if (suc) {
            if (sucMsg) sucMsg.textContent = "Cuenta creada. Ya puedes iniciar sesión.";
            suc.style.display = "";
            setTimeout(function () { suc.style.display = "none"; }, 5000);
          }
        })
        .catch(function () { setError("No se pudo conectar con el servidor."); })
        .finally(function () { btn.disabled = false; btn.textContent = "Crear cuenta"; });
    });
  }

  /* ---------------- recuperar contraseña ---------------- */
  function initForgot() {
    var btn    = document.getElementById("forgot-btn");
    var banner = document.getElementById("forgot-banner");
    var banMsg = document.getElementById("forgot-banner-msg");
    if (!btn) return;

    function setBanner(msg, isErr) {
      if (banner) {
        banner.className     = "banner " + (isErr ? "err" : "info");
        banner.style.display = "";
        var ico = document.getElementById("forgot-banner-icon");
        if (ico) ico.textContent = isErr ? "!" : "✓";
      }
      if (banMsg) banMsg.textContent = msg;
    }
    function clearBanner() { if (banner) banner.style.display = "none"; }

    var goForgot = document.getElementById("go-forgot");
    var goLogin  = document.getElementById("go-login-from-forgot");
    if (goForgot) goForgot.addEventListener("click", function (e) { e.preventDefault(); clearBanner(); showPanel("forgot"); });
    if (goLogin)  goLogin.addEventListener("click",  function (e) { e.preventDefault(); clearBanner(); showPanel("login"); });

    var fInput = document.getElementById("forgot-user");
    if (fInput) fInput.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });

    btn.addEventListener("click", function () {
      clearBanner();
      var correo = (document.getElementById("forgot-user").value || "").trim();
      if (!correo) { setBanner("Ingresa tu correo.", true); return; }

      btn.disabled    = true;
      btn.textContent = "Enviando…";

      fetch("/api/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ correo: correo }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (r) {
          setBanner(r.data.mensaje || "Revisa la consola del servidor.", !r.ok);
        })
        .catch(function () { setBanner("No se pudo conectar con el servidor.", true); })
        .finally(function () { btn.disabled = false; btn.textContent = "Enviar instrucciones"; });
    });
  }

  /* ---------------- restablecer contraseña ---------------- */
  function initReset() {
    var btn    = document.getElementById("reset-btn");
    var errEl  = document.getElementById("reset-error");
    var errMsg = document.getElementById("reset-error-msg");
    if (!btn) return;

    function setError(msg) {
      if (errEl)  errEl.style.display  = "";
      if (errMsg) errMsg.textContent   = msg;
    }
    function clearError() { if (errEl) errEl.style.display = "none"; }

    var goLogin = document.getElementById("go-login-from-reset");
    if (goLogin) goLogin.addEventListener("click", function (e) {
      e.preventDefault();
      clearError();
      window.history.replaceState({}, "", "/");
      showPanel("login");
    });

    var rInput = document.getElementById("reset-pass");
    if (rInput) rInput.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });

    btn.addEventListener("click", function () {
      clearError();
      var params     = new URLSearchParams(window.location.search);
      var token      = params.get("reset");
      var contrasena = document.getElementById("reset-pass").value || "";

      if (!token) {
        setError("Token no encontrado. Usa el enlace del servidor."); return;
      }
      if (contrasena.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres."); return;
      }

      btn.disabled    = true;
      btn.textContent = "Guardando…";

      fetch("/api/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: token, contrasena: contrasena }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (r) {
          if (!r.ok) { setError(r.data.error || "Error al restablecer la contraseña."); return; }
          window.history.replaceState({}, "", "/");
          showPanel("login");
          var suc    = document.getElementById("login-success");
          var sucMsg = document.getElementById("login-success-msg");
          if (suc) {
            if (sucMsg) sucMsg.textContent = "Contraseña actualizada. Ya puedes iniciar sesión.";
            suc.style.display = "";
            setTimeout(function () { suc.style.display = "none"; }, 5000);
          }
        })
        .catch(function () { setError("No se pudo conectar con el servidor."); })
        .finally(function () { btn.disabled = false; btn.textContent = "Guardar nueva contraseña"; });
    });
  }

  /* ---------------- cerrar sesión ---------------- */
  function initLogout() {
    var btn = document.getElementById("logout-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      localStorage.removeItem(LS_TOKEN);
      appView.classList.remove("active");
      loginView.classList.add("active");
      showPanel("login");
      var liUser = document.getElementById("li-user");
      var liPass = document.getElementById("li-pass");
      if (liUser) liUser.value = "";
      if (liPass) liPass.value = "";
    });
  }

  /* ---------------- acceso restringido (visitante público desde /registro) ---------------- */
  function initRestricted() {
    var goRegistro = document.getElementById("restricted-go-registro");
    if (goRegistro) goRegistro.addEventListener("click", function () {
      window.location.href = "/registro/";
    });

    var goLogin = document.getElementById("go-login-from-restricted");
    if (goLogin) goLogin.addEventListener("click", function (e) {
      e.preventDefault();
      showPanel("login");
    });
  }

  /* ---------------- sesión persistente (check al cargar) ---------------- */
  function checkSession() {
    var params     = new URLSearchParams(window.location.search);
    var resetToken = params.get("reset");
    if (resetToken) {
      showPanel("reset");
      return;
    }

    var token = localStorage.getItem(LS_TOKEN);
    if (!token) {
      // Si el visitante llega justo desde /registro (ej. con el botón "atrás"
      // del navegador), es alguien del público general, no un administrador:
      // le mostramos una pantalla de acceso restringido en vez del login
      // institucional, que no tiene sentido para su recorrido.
      if (document.referrer && document.referrer.indexOf("/registro") !== -1) {
        showPanel("restricted");
      }
      return;
    }

    fetch("/api/me", {
      headers: { "Authorization": "Bearer " + token },
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (!r.ok) { localStorage.removeItem(LS_TOKEN); return; }
        setUserInfo(r.data.usuario.nombre);
        var saved = localStorage.getItem(LS_SCREEN) || "dashboard";
        showScreen(saved);
        ensureConfigLoaded(function () {});
      })
      .catch(function () { localStorage.removeItem(LS_TOKEN); });
  }

  /* ---------------- wizard: estado + helpers ---------------- */
  var wizardState = {
    plantillaFile: null,
    excelFile:     null,
    certificados:  [],   // resultado de /masivo/preparar
    config:        null, // resultado de /config
    emitResult:    null, // resultado de /masivo/emitir
  };

  // Devuelve un objeto de headers con el "Authorization: Bearer <token>" listo para usar en fetch().
  function authHeaders(extra) {
    var token   = localStorage.getItem(LS_TOKEN);
    var headers = extra || {};
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
  }

  // Convierte un tamaño en bytes a texto legible (ej. "248 KB").
  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0, n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(n < 10 && i > 0 ? 1 : 0) + " " + units[i];
  }

  // Trae y cachea la config real (wallet, red, contrato, saldo) desde GET /api/certificados/config.
  function ensureConfigLoaded(cb) {
    if (wizardState.config) { cb(); return; }
    fetch("/api/certificados/config", { headers: authHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) { wizardState.config = data; applyNetworkInfo(); }
        cb();
      })
      .catch(function () { cb(); });
  }

  // Refleja la red/wallet/contrato reales en el topbar y en Configuración (rojo si es mainnet).
  function applyNetworkInfo() {
    var cfg = wizardState.config;
    if (!cfg) return;

    var pillName = document.getElementById("topbar-net-name");
    var pill     = document.getElementById("topbar-net-pill");
    if (pillName) pillName.textContent = cfg.network + (cfg.isMainnet ? " · gas real" : "");
    if (pill) pill.classList.toggle("net-pill--danger", !!cfg.isMainnet);

    var addr = document.getElementById("config-wallet-addr");
    if (addr) addr.textContent = cfg.universityWallet;
    var net = document.getElementById("config-network");
    if (net) net.textContent = cfg.network;
    var contractAddr = document.getElementById("config-contract-addr");
    if (contractAddr) contractAddr.textContent = cfg.contractAddress;
    var balance = document.getElementById("config-balance");
    if (balance) {
      var eth = parseFloat(cfg.balanceEth);
      balance.textContent = (isNaN(eth) ? cfg.balanceEth : eth.toFixed(5)) + " ETH";
    }
    var configPill = document.getElementById("config-net-pill");
    if (configPill) configPill.classList.toggle("net-pill--danger", !!cfg.isMainnet);
  }

  /* ---------------- wizard ---------------- */
  var curStep = 1;
  // Paso 3 dispara la generación real; paso 4 carga el resumen con datos reales.
  function setWizardStep(n) {
    curStep = n;
    document.querySelectorAll(".wstep").forEach(function (w) {
      var active = +w.getAttribute("data-wstep") === n;
      w.classList.toggle("active", active);
      w.style.display = active ? "" : "none";
    });
    document.querySelectorAll("#stepper .step").forEach(function (s) {
      var sn = +s.getAttribute("data-step");
      s.classList.toggle("current", sn === n);
      s.classList.toggle("done",    sn < n);
    });
    if (n === 3) runGeneration();
    if (n === 4) {
      var cb   = document.getElementById("conf-check");
      var emit = document.getElementById("emit-btn");
      if (cb)   cb.checked   = false;
      if (emit) emit.disabled = true;
      ensureConfigLoaded(populateResumen);
    }
    window.scrollTo(0, 0);
  }

  // Limpia archivos, certificados generados y resultado antes de una nueva emisión.
  function resetWizard() {
    progressStarted = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    wizardState.plantillaFile = null;
    wizardState.excelFile     = null;
    wizardState.certificados  = [];
    wizardState.emitResult    = null;

    var plantillaFn = document.getElementById("plantilla-fn");
    if (plantillaFn) plantillaFn.textContent = "Ningún archivo seleccionado";
    var plantillaFmeta = document.getElementById("plantilla-fmeta");
    if (plantillaFmeta) plantillaFmeta.textContent = "Sube el PDF de la plantilla";
    var plantillaPick = document.getElementById("plantilla-pick");
    if (plantillaPick) plantillaPick.textContent = "Subir";
    var step1Next = document.getElementById("wizard-step1-next");
    if (step1Next) step1Next.disabled = true;
    var plantillaInput = document.getElementById("plantilla-input");
    if (plantillaInput) plantillaInput.value = "";

    var excelFn = document.getElementById("excel-fn");
    if (excelFn) excelFn.textContent = "Ningún archivo seleccionado";
    var excelPick = document.getElementById("excel-pick");
    if (excelPick) excelPick.textContent = "Subir Excel";
    var excelEmpty = document.getElementById("excel-empty");
    if (excelEmpty) {
      excelEmpty.textContent   = "Sube un archivo Excel para validar la lista de estudiantes.";
      excelEmpty.style.display = "";
    }
    var excelResults = document.getElementById("excel-results");
    if (excelResults) excelResults.style.display = "none";
    var step2Next = document.getElementById("wizard-step2-next");
    if (step2Next) { step2Next.disabled = true; step2Next.textContent = "Continuar"; }
    var excelInput = document.getElementById("excel-input");
    if (excelInput) excelInput.value = "";

    setWizardStep(1);
  }

  /* ---------------- wizard paso 1: plantilla PDF ---------------- */
  // Valida que el archivo subido sea un PDF real y lo guarda en wizardState.
  function initWizardStep1() {
    var input   = document.getElementById("plantilla-input");
    var pick    = document.getElementById("plantilla-pick");
    var fn      = document.getElementById("plantilla-fn");
    var fmeta   = document.getElementById("plantilla-fmeta");
    var nextBtn = document.getElementById("wizard-step1-next");
    if (!input) return;

    pick.addEventListener("click", function () { input.click(); });

    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      if (file.type !== "application/pdf") {
        toast("Selecciona un archivo PDF válido", true);
        input.value = "";
        return;
      }
      wizardState.plantillaFile = file;
      fn.textContent    = file.name;
      fmeta.textContent = formatBytes(file.size);
      pick.textContent  = "Reemplazar";
      nextBtn.disabled  = false;
    });
  }

  /* ---------------- wizard paso 2: lista de estudiantes (Excel) ---------------- */
  // Dibuja la tabla de validación del Excel: una fila por alumno, marcando
  // en verde las válidas y en rojo las que tienen error.
  function renderExcelTable(filas) {
    var tbody = document.getElementById("excel-table-body");
    tbody.innerHTML = "";
    filas.forEach(function (f) {
      var tr = document.createElement("tr");
      if (!f.valido) tr.className = "err";
      var walletTxt = f.studentWallet || "— vacío —";
      tr.innerHTML =
        '<td class="mono">' + f.row + "</td>" +
        '<td class="nm">' + (f.studentName || "—") + "</td>" +
        '<td class="mono">' + walletTxt + "</td>" +
        "<td>" + (f.valido ? '<span class="tag ok">válida</span>' : '<span class="tag err">' + f.error + "</span>") + "</td>";
      tbody.appendChild(tr);
    });
  }

  // Sube el Excel a POST /api/certificados/validar-excel y pinta el resultado real.
  function initWizardStep2() {
    var input   = document.getElementById("excel-input");
    var pick    = document.getElementById("excel-pick");
    var fn      = document.getElementById("excel-fn");
    var empty   = document.getElementById("excel-empty");
    var results = document.getElementById("excel-results");
    var nextBtn = document.getElementById("wizard-step2-next");
    if (!input) return;

    pick.addEventListener("click", function () { input.click(); });

    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;

      wizardState.excelFile = file;
      fn.textContent   = file.name;
      pick.textContent = "Analizando…";
      nextBtn.disabled = true;

      var formData = new FormData();
      formData.append("excel", file);

      fetch("/api/certificados/validar-excel", {
        method:  "POST",
        headers: authHeaders(),
        body:    formData,
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (r) {
          pick.textContent = "Reemplazar";
          if (!r.ok) {
            toast(r.data.message || "No se pudo leer el Excel", true);
            empty.textContent   = r.data.message || "No se pudo leer el Excel.";
            empty.style.display = "";
            results.style.display = "none";
            return;
          }
          document.getElementById("excel-valid-count").textContent = r.data.validCount;
          document.getElementById("excel-error-count").textContent = r.data.totalCount - r.data.validCount;
          document.getElementById("excel-total-count").textContent = r.data.totalCount;
          renderExcelTable(r.data.filas);
          empty.style.display   = "none";
          results.style.display = "";
          nextBtn.textContent = "Continuar con las " + r.data.validCount + " válidas";
          nextBtn.disabled    = r.data.validCount === 0;
        })
        .catch(function () {
          pick.textContent = "Reemplazar";
          toast("No se pudo conectar con el servidor", true);
        });
    });
  }

  /* ---------------- wizard paso 3: generación real (plantilla + IPFS) ---------------- */
  // Pinta la lista de certificados ya generados y muestra la previsualización real del primero.
  function renderGenResults(certificados) {
    document.getElementById("gen-count").textContent = certificados.length;
    var tbody = document.getElementById("gen-list-body");
    tbody.innerHTML = "";
    certificados.forEach(function (c) {
      var tr = document.createElement("tr");
      tr.innerHTML = '<td class="nm">' + c.studentName + '</td><td style="text-align:right;"><span class="tag ok">subido</span></td>';
      tbody.appendChild(tr);
    });
    if (certificados[0]) {
      document.getElementById("gen-preview-name").textContent = certificados[0].studentName;
      var box = document.getElementById("gen-preview-box");
      box.innerHTML = '<img src="' + certificados[0].previewGatewayUrl + '" alt="Previsualización" style="max-width:100%;max-height:100%;border-radius:8px;" />';
    }
  }

  // Genera de verdad los PDFs vía POST /api/certificados/masivo/preparar (sube a Pinata).
  function runGeneration() {
    var loading = document.getElementById("gen-loading");
    var done    = document.getElementById("gen-done");
    var errBox  = document.getElementById("gen-error");
    var bar     = document.querySelector("#gen-progress > i");
    var pct     = document.getElementById("gen-pct");
    if (!loading || !done) return;

    if (!wizardState.plantillaFile || !wizardState.excelFile) {
      toast("Faltan archivos de los pasos anteriores", true);
      setWizardStep(1);
      return;
    }

    loading.style.display = "";
    done.style.display    = "none";
    errBox.style.display  = "none";

    var p = 0;
    bar.style.width = "0%"; pct.textContent = "0%";
    var fakeTimer = setInterval(function () {
      p = Math.min(p + Math.random() * 6 + 2, 90);
      bar.style.width = p + "%";
      pct.textContent = Math.round(p) + "%";
    }, 400);

    var formData = new FormData();
    formData.append("plantilla", wizardState.plantillaFile);
    formData.append("excel", wizardState.excelFile);

    fetch("/api/certificados/masivo/preparar", {
      method:  "POST",
      headers: authHeaders(),
      body:    formData,
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        clearInterval(fakeTimer);
        bar.style.width = "100%"; pct.textContent = "100%";
        if (!r.ok) {
          loading.style.display = "none";
          errBox.style.display  = "";
          document.getElementById("gen-error-msg").textContent = r.data.message || "Ocurrió un error generando los certificados.";
          return;
        }
        wizardState.certificados = r.data.certificados;
        renderGenResults(r.data.certificados);
        setTimeout(function () { loading.style.display = "none"; done.style.display = ""; }, 300);
      })
      .catch(function () {
        clearInterval(fakeTimer);
        loading.style.display = "none";
        errBox.style.display  = "";
        document.getElementById("gen-error-msg").textContent = "No se pudo conectar con el servidor.";
      });
  }

  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "gen-retry-btn") runGeneration();
  });

  /* ---------------- wizard paso 4: resumen ---------------- */
  // Rellena el resumen previo al minteo con datos reales y la advertencia de "gas real" si es mainnet.
  function populateResumen() {
    document.getElementById("resumen-total").textContent       = wizardState.certificados.length;
    document.getElementById("resumen-count-check").textContent = wizardState.certificados.length;
    if (wizardState.config) {
      document.getElementById("resumen-red").textContent    = wizardState.config.network;
      document.getElementById("resumen-wallet").textContent = wizardState.config.universityWallet;
      var warning = document.getElementById("resumen-mainnet-warning");
      if (warning) warning.style.display = wizardState.config.isMainnet ? "" : "none";
    }
  }

  // Checkbox confirmación (paso 4)
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "conf-check") {
      var emit = document.getElementById("emit-btn");
      if (emit) emit.disabled = !e.target.checked;
    }
  });

  /* ---------------- progreso: minteo real, con estado por alumno ---------------- */
  var progressStarted = false;
  var pollTimer = null;

  // Traduce el "stage" real que manda el backend a la clase CSS y texto de la fila.
  function stageLabel(stage) {
    switch (stage) {
      case "enviando":      return { cls: "run", txt: "enviando…" };
      case "confirmando":   return { cls: "run", txt: "hash generado, confirmando…" };
      case "confirmado":    return { cls: "ok",  txt: "en wallet ✓" };
      case "revisar_owner": return { cls: "err", txt: "revisar owner" };
      case "error":         return { cls: "err", txt: "error de minteo" };
      default:              return { cls: "wait", txt: "en cola" };
    }
  }

  // Emite de verdad: POST /masivo/emitir da un jobId, y hace polling a GET /masivo/emitir/:jobId cada 2s.
  function startProgress() {
    if (progressStarted) return;

    var certificados = wizardState.certificados;
    if (!certificados || certificados.length === 0) {
      toast("No hay certificados preparados. Empieza una nueva emisión.", true);
      resetWizard();
      showScreen("wizard");
      return;
    }
    progressStarted = true;

    var tbody      = document.getElementById("mint-list-body");
    var p1bar      = document.querySelector("#p1-progress > i");
    var p1counter  = document.getElementById("p1-counter");
    var p1tag      = document.getElementById("p1-tag");
    var statusText = document.getElementById("p1-status-text");
    var goBtn      = document.getElementById("batch-go");

    tbody.innerHTML = "";
    certificados.forEach(function (c, idx) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="mono">' + (idx + 1) + "</td>" +
        '<td class="nm">' + c.studentName + "</td>" +
        '<td class="mono">' + c.studentWallet + "</td>" +
        '<td><span class="mstate tag wait">en cola</span></td>';
      tbody.appendChild(tr);
    });
    p1counter.textContent = "0 de " + certificados.length;

    // Actualiza cada fila con el stage más reciente del polling y recalcula el progreso.
    function renderFromDetails(details) {
      var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
      var doneCount = 0;

      details.forEach(function (det, idx) {
        var row = rows[idx];
        if (!row) return;
        var st = row.querySelector(".mstate");
        var label = stageLabel(det.stage);
        st.className   = "mstate tag " + label.cls;
        st.textContent = label.txt;
        st.title       = det.explorerUrl || det.error || "";
        row.classList.toggle("err", det.stage === "error" || det.stage === "revisar_owner");

        if (det.stage === "confirmado" || det.stage === "error" || det.stage === "revisar_owner") {
          doneCount++;
        }
      });

      p1counter.textContent = doneCount + " de " + details.length;
      p1bar.style.width = Math.round((doneCount / details.length) * 100) + "%";
    }

    fetch("/api/certificados/masivo/emitir", {
      method:  "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body:    JSON.stringify({ certificados: certificados }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (!r.ok) {
          p1tag.className    = "ph-tag tag err";
          p1tag.textContent  = "error";
          statusText.textContent = r.data.message || "Ocurrió un error emitiendo los certificados.";
          toast(r.data.message || "Error en la emisión", true);
          return;
        }

        var jobId = r.data.jobId;
        statusText.textContent = "Enviando transacciones…";

        pollTimer = setInterval(function () {
          fetch("/api/certificados/masivo/emitir/" + jobId, { headers: authHeaders() })
            .then(function (res) { return res.json(); })
            .then(function (data) {
              if (!data.success) return;

              renderFromDetails(data.details);

              if (data.status === "completado" || data.status === "error") {
                clearInterval(pollTimer);
                pollTimer = null;

                var okCount = data.details.filter(function (d) { return d.status === "nft_transferido"; }).length;
                wizardState.emitResult = { totalCertificates: data.total, details: data.details };

                p1tag.className   = "ph-tag tag " + (okCount === data.total ? "ok" : "warn");
                p1tag.textContent = okCount === data.total ? "completado" : "con incidencias";
                statusText.textContent = "Emisión completada";
                document.getElementById("p1-desc").textContent =
                  "Se ejecutó una transacción createCertificate por cada alumno (el contrato no tiene minteo por lotes), directo a su wallet.";

                dashboardLoaded = false; // el próximo Dashboard debe traer estos certificados nuevos
                goBtn.disabled = false;
                document.getElementById("batch-lock").style.display = "none";
              }
            })
            .catch(function () {
              // fallo puntual consultando el estado: se reintenta en el próximo tick
            });
        }, 2000);
      })
      .catch(function () {
        p1tag.className   = "ph-tag tag err";
        p1tag.textContent = "error";
        statusText.textContent = "No se pudo conectar con el servidor.";
        toast("No se pudo conectar con el servidor", true);
      });
  }

  /* ---------------- resultado final ---------------- */
  // Pinta el resultado final real: tokenId, estado y link a Etherscan por alumno.
  function renderResultScreen() {
    var data = wizardState.emitResult;
    if (!data) return;

    document.getElementById("result-total").textContent = data.totalCertificates;
    var okCount = data.details.filter(function (d) { return d.status === "nft_transferido"; }).length;
    document.getElementById("result-ok").textContent  = okCount;
    document.getElementById("result-err").textContent = data.totalCertificates - okCount;

    var tbody = document.getElementById("result-table-body");
    tbody.innerHTML = "";
    data.details.forEach(function (d) {
      var tr = document.createElement("tr");
      if (d.status !== "nft_transferido") tr.className = "err";
      var estadoTag = d.status === "nft_transferido"
        ? '<span class="tag ok">entregado</span>'
        : d.status === "error_minteo"
        ? '<span class="tag err" title="' + (d.error || "") + '">error de minteo</span>'
        : '<span class="tag err">revisar owner</span>';
      var txLink = d.explorerUrl
        ? '<a class="txlink" href="' + d.explorerUrl + '" target="_blank" rel="noopener">' + d.txHash.slice(0, 10) + "… ↗</a>"
        : "—";
      tr.innerHTML =
        '<td class="nm">' + d.studentName + "</td>" +
        '<td class="mono">' + d.studentWallet + "</td>" +
        '<td class="mono">' + (d.tokenId !== undefined ? d.tokenId : "—") + "</td>" +
        "<td>" + estadoTag + "</td>" +
        "<td>" + txLink + "</td>";
      tbody.appendChild(tr);
    });
  }

  /* ---------------- dashboard: historial real ---------------- */
  var dashboardLoaded = false;
  // Trae el historial real desde GET /api/certificados/historial y pinta el Dashboard.
  function loadDashboard() {
    if (dashboardLoaded) return;
    dashboardLoaded = true;

    fetch("/api/certificados/historial", { headers: authHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) { dashboardLoaded = false; return; }

        document.getElementById("dash-total").textContent      = data.stats.totalEmitidos;
        document.getElementById("dash-lotes").textContent      = data.stats.totalLotes;
        document.getElementById("dash-entregados").firstChild.textContent = data.stats.entregados + " ";
        document.getElementById("dash-entregados-total").textContent     = "/ " + data.stats.totalEmitidos;

        var empty = document.getElementById("dash-empty");
        var card  = document.getElementById("dash-table-card");

        if (data.emisiones.length === 0) {
          empty.style.display = "";
          card.style.display  = "none";
          return;
        }
        empty.style.display = "none";
        card.style.display  = "";

        var tbody = document.getElementById("dash-table-body");
        tbody.innerHTML = "";
        data.emisiones.forEach(function (e) {
          var tr = document.createElement("tr");
          var esOk = e.estado === "nft_transferido";
          if (!esOk) tr.className = "err";
          var estadoTag = esOk
            ? '<span class="tag ok">entregado</span>'
            : '<span class="tag err" title="' + (e.error || "") + '">' + (e.estado === "error_minteo" ? "error de minteo" : "revisar owner") + "</span>";
          var fecha = (e.creado_en || "").replace("T", " ").slice(0, 16);
          var txLink = e.tx_hash
            ? '<a class="txlink" href="' + e.explorer_url + '" target="_blank" rel="noopener">' + e.tx_hash.slice(0, 10) + "… ↗</a>"
            : "—";
          tr.innerHTML =
            '<td class="mono">' + fecha + "</td>" +
            '<td class="nm">' + e.nombre_alumno + "</td>" +
            '<td class="mono">' + e.wallet_alumno + "</td>" +
            "<td>" + estadoTag + "</td>" +
            "<td>" + txLink + "</td>";
          tbody.appendChild(tr);
        });
      })
      .catch(function () { dashboardLoaded = false; });
  }

  /* ---------------- modal Participantes (CRUD) ---------------- */
  var participantesState = { items: [], editingId: null };

  // Escapa texto antes de insertarlo como HTML en las celdas de la tabla.
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function openParticipantesModal() {
    document.getElementById("participantes-overlay").classList.add("show");
    loadParticipantes();
  }
  function closeParticipantesModal() {
    document.getElementById("participantes-overlay").classList.remove("show");
    participantesState.editingId = null;
  }

  // Trae la lista real desde GET /api/certificados/participantes y la pinta.
  function loadParticipantes() {
    fetch("/api/certificados/participantes", { headers: authHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) { toast(data.message || "No se pudo cargar participantes", true); return; }
        participantesState.items = data.participantes;
        renderParticipantesTable();
      })
      .catch(function () { toast("Error de conexión al cargar participantes", true); });
  }

  // Dibuja la tabla; las filas en edición muestran inputs en vez de texto.
  function renderParticipantesTable() {
    var tbody = document.getElementById("participantes-table-body");
    var empty = document.getElementById("participantes-empty");
    var items = participantesState.items;

    if (!items.length) {
      tbody.innerHTML = "";
      empty.style.display = "";
      return;
    }
    empty.style.display = "none";

    tbody.innerHTML = items.map(function (p) {
      var fecha = (p.creado_en || "").replace(" ", "T").slice(0, 16).replace("T", " ");
      var tipoTag = p.tipo === "creada"
        ? '<span class="tag ok">creada</span>'
        : (p.tipo === "manual" ? '<span class="tag wait">manual</span>' : '<span class="tag run">existente</span>');

      var ICON_SAVE   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6 9 17l-5-5"/></svg>';
      var ICON_CANCEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      var ICON_EDIT   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      var ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

      if (participantesState.editingId === p.id) {
        return (
          '<tr>' +
            '<td><input class="input" style="height:34px;padding:0 10px;" id="edit-nombre-' + p.id + '" value="' + escapeHtml(p.nombre) + '" /></td>' +
            '<td><input class="input mono" style="height:34px;padding:0 10px;" id="edit-wallet-' + p.id + '" value="' + escapeHtml(p.wallet) + '" /></td>' +
            '<td>' + tipoTag + '</td>' +
            '<td class="mono" style="font-size:11.5px;color:var(--muted);">' + fecha + '</td>' +
            '<td style="white-space:nowrap;">' +
              '<button class="icon-btn ok" data-save-id="' + p.id + '" type="button" title="Guardar">' + ICON_SAVE + '</button>' +
              '<button class="icon-btn" data-cancel-id="' + p.id + '" type="button" title="Cancelar">' + ICON_CANCEL + '</button>' +
            '</td>' +
          '</tr>'
        );
      }

      return (
        '<tr>' +
          '<td class="nm">' + escapeHtml(p.nombre) + '</td>' +
          '<td class="mono">' + escapeHtml(p.wallet) + '</td>' +
          '<td>' + tipoTag + '</td>' +
          '<td class="mono" style="font-size:11.5px;color:var(--muted);">' + fecha + '</td>' +
          '<td style="white-space:nowrap;">' +
            '<button class="icon-btn edit" data-edit-id="' + p.id + '" type="button" title="Editar">' + ICON_EDIT + '</button>' +
            '<button class="icon-btn danger" data-delete-id="' + p.id + '" type="button" title="Eliminar">' + ICON_DELETE + '</button>' +
          '</td>' +
        '</tr>'
      );
    }).join("");
  }

  // POST /api/certificados/participantes — alta manual desde el formulario del modal.
  function addParticipante() {
    var nombreInput = document.getElementById("part-add-nombre");
    var walletInput = document.getElementById("part-add-wallet");
    var nombre = nombreInput.value.trim();
    var wallet = walletInput.value.trim();
    if (!nombre || !wallet) { toast("Completa nombre y wallet", true); return; }

    fetch("/api/certificados/participantes", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ nombre: nombre, wallet: wallet }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (!r.ok || !r.data.success) { toast((r.data && r.data.message) || "No se pudo agregar", true); return; }
        nombreInput.value = "";
        walletInput.value = "";
        toast("Participante agregado");
        loadParticipantes();
      })
      .catch(function () { toast("Error de conexión", true); });
  }

  // PATCH /api/certificados/participantes/:id — guarda los cambios de la fila en edición.
  function saveParticipante(id) {
    var nombreInput = document.getElementById("edit-nombre-" + id);
    var walletInput = document.getElementById("edit-wallet-" + id);
    var nombre = nombreInput.value.trim();
    var wallet = walletInput.value.trim();
    if (!nombre || !wallet) { toast("Completa nombre y wallet", true); return; }

    fetch("/api/certificados/participantes/" + id, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ nombre: nombre, wallet: wallet }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (!r.ok || !r.data.success) { toast((r.data && r.data.message) || "No se pudo guardar", true); return; }
        participantesState.editingId = null;
        toast("Cambios guardados");
        loadParticipantes();
      })
      .catch(function () { toast("Error de conexión", true); });
  }

  // DELETE /api/certificados/participantes/:id — elimina la fila tras confirmar.
  function deleteParticipante(id) {
    if (!confirm("¿Eliminar este participante? Esta acción no se puede deshacer.")) return;

    fetch("/api/certificados/participantes/" + id, { method: "DELETE", headers: authHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) { toast(data.message || "No se pudo eliminar", true); return; }
        toast("Participante eliminado");
        loadParticipantes();
      })
      .catch(function () { toast("Error de conexión", true); });
  }

  // GET /api/certificados/participantes/exportar — descarga el Excel autenticando la petición
  // manualmente (un <a href> normal no podría mandar el header Authorization).
  function exportParticipantes() {
    fetch("/api/certificados/participantes/exportar", { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) throw new Error("No se pudo exportar");
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "participantes.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(function () { toast("No se pudo exportar el Excel", true); });
  }

  function initParticipantesModal() {
    var navBtn = document.getElementById("nav-participantes");
    if (navBtn) navBtn.addEventListener("click", openParticipantesModal);

    var closeBtn = document.getElementById("participantes-close");
    if (closeBtn) closeBtn.addEventListener("click", closeParticipantesModal);

    var overlay = document.getElementById("participantes-overlay");
    if (overlay) overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeParticipantesModal();
    });

    var addBtn = document.getElementById("part-add-btn");
    if (addBtn) addBtn.addEventListener("click", addParticipante);

    var exportBtn = document.getElementById("participantes-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", exportParticipantes);

    var tbody = document.getElementById("participantes-table-body");
    if (tbody) tbody.addEventListener("click", function (e) {
      var el = e.target.closest("[data-edit-id],[data-cancel-id],[data-save-id],[data-delete-id]");
      if (!el) return;
      if (el.hasAttribute("data-edit-id"))   { participantesState.editingId = +el.getAttribute("data-edit-id"); renderParticipantesTable(); }
      if (el.hasAttribute("data-cancel-id")) { participantesState.editingId = null; renderParticipantesTable(); }
      if (el.hasAttribute("data-save-id"))   saveParticipante(+el.getAttribute("data-save-id"));
      if (el.hasAttribute("data-delete-id")) deleteParticipante(+el.getAttribute("data-delete-id"));
    });
  }

  /* ---------------- logo uploader ---------------- */
  function initLogoUploader() {
    var btn       = document.getElementById("logo-upload-btn");
    var input     = document.getElementById("logo-input");
    var removeBtn = document.getElementById("logo-remove-btn");
    var preview   = document.getElementById("logo-preview");
    if (!btn || !input) return;

    btn.addEventListener("click", function () { input.click(); });
    if (preview) preview.addEventListener("click", function () { input.click(); });

    function handleFile(file) {
      if (!file || !/^image\//.test(file.type)) { toast("Sube un archivo de imagen válido", true); return; }
      if (file.size > 1024 * 1024)              { toast("El archivo supera 1 MB", true);           return; }
      var reader = new FileReader();
      reader.onload = function (ev) {
        try { localStorage.setItem(LS_LOGO, ev.target.result); }
        catch (err) { toast("La imagen es demasiado pesada", true); return; }
        applyBranding();
        toast("Logo actualizado");
      };
      reader.readAsDataURL(file);
    }

    input.addEventListener("change", function () { handleFile(input.files[0]); input.value = ""; });

    if (removeBtn) removeBtn.addEventListener("click", function () {
      localStorage.removeItem(LS_LOGO);
      applyBranding();
      toast("Logo eliminado");
    });

    if (preview) {
      ["dragenter", "dragover"].forEach(function (ev) {
        preview.addEventListener(ev, function (e) { e.preventDefault(); preview.style.borderColor = "var(--accent)"; });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        preview.addEventListener(ev, function (e) { e.preventDefault(); preview.style.borderColor = ""; });
      });
      preview.addEventListener("drop", function (e) {
        if (e.dataTransfer && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    }

    var nameInput = document.getElementById("cfg-instname");
    if (nameInput) nameInput.addEventListener("input", function () {
      var v = nameInput.value.trim();
      if (v) localStorage.setItem(LS_NAME, v); else localStorage.removeItem(LS_NAME);
      applyBranding();
    });
  }

  /* ---------------- toast ---------------- */
  var toastTimer = null;
  function toast(msg, isErr) {
    var t = document.getElementById("toast");
    var m = document.getElementById("toast-msg");
    if (!t) return;
    m.textContent = msg;
    t.querySelector(".tk").textContent = isErr ? "!" : "✓";
    t.querySelector(".tk").style.color = isErr ? "#ff9b8a" : "#6ee7a8";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  /* ---------------- delegación de clics (pantalla de app) ---------------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-goto],[data-wnext],[data-wprev],[data-screen],[data-copy],[data-toast]");
    if (!el) return;

    if (el.hasAttribute("data-copy")) {
      var txt = el.getAttribute("data-copy");
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
      toast("Dirección copiada");
      return;
    }

    if (el.hasAttribute("data-reset-wizard")) resetWizard();

    if (el.hasAttribute("data-wnext")) { setWizardStep(+el.getAttribute("data-wnext")); return; }
    if (el.hasAttribute("data-wprev")) { setWizardStep(+el.getAttribute("data-wprev")); return; }

    if (el.hasAttribute("data-screen")) {
      showScreen(el.getAttribute("data-screen"));
      if (el.hasAttribute("data-reset-wizard")) resetWizard();
      return;
    }

    if (el.hasAttribute("data-toast")) toast(el.getAttribute("data-toast"));

    if (el.hasAttribute("data-goto")) {
      var dest = el.getAttribute("data-goto");
      if (dest === "wizard" && el.hasAttribute("data-reset-wizard")) resetWizard();
      showScreen(dest);
    }
  });

  /* ---------------- init ---------------- */
  applyBranding();
  initLogin();
  initRegister();
  initForgot();
  initReset();
  initRestricted();
  initLogout();
  initLogoUploader();
  initWizardStep1();
  initWizardStep2();
  initParticipantesModal();
  setWizardStep(1);
  checkSession();

})();
