(function () {
  "use strict";

  var CLAVE = "antonio-motorsport-presupuesto";
  var CLAVE_FOLIO = "antonio-motorsport-folio";
  var IVA = 0.16;
  var HORAS_POR_DIA = 8;

  var $ = function (id) { return document.getElementById(id); };
  var campos = ["cliente", "telefono", "vehiculo", "placas", "fecha", "notas"];

  var dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  var num = function (v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; };

  /* ---------- Filas ---------- */
  function crearFila(datos) {
    datos = datos || {};
    var fila = document.createElement("div");
    fila.className = "fila item";
    fila.innerHTML =
      '<div class="c-pieza"><span class="etq">Pieza</span>' +
        '<input type="text" class="f-pieza" placeholder="Ej. Defensa delantera"></div>' +
      '<div><span class="etq">Costo pieza</span>' +
        '<input type="number" class="f-costo" min="0" step="0.01" inputmode="decimal" placeholder="0"></div>' +
      '<div><span class="etq">Mano de obra</span>' +
        '<input type="number" class="f-mano" min="0" step="0.01" inputmode="decimal" placeholder="0"></div>' +
      '<div><span class="etq">Material</span>' +
        '<input type="number" class="f-material" min="0" step="0.01" inputmode="decimal" placeholder="0"></div>' +
      '<div><span class="etq">Tiempo (hrs)</span>' +
        '<input type="number" class="f-tiempo" min="0" step="0.5" inputmode="decimal" placeholder="0"></div>' +
      '<div class="c-sub"><span class="etq">Subtotal</span><div class="sub-fila">$0.00</div></div>' +
      '<div class="c-quitar"><button type="button" class="quitar" aria-label="Quitar fila">×</button></div>';

    fila.querySelector(".f-pieza").value = datos.pieza || "";
    fila.querySelector(".f-costo").value = datos.costo || "";
    fila.querySelector(".f-mano").value = datos.mano || "";
    fila.querySelector(".f-material").value = datos.material || "";
    fila.querySelector(".f-tiempo").value = datos.tiempo || "";

    fila.querySelector(".quitar").addEventListener("click", function () {
      fila.remove();
      if (!$("filas").children.length) $("filas").appendChild(crearFila());
      actualizar();
    });
    $("filas").appendChild(fila);
    return fila;
  }

  function leerFilas() {
    return Array.prototype.map.call($("filas").children, function (f) {
      return {
        pieza: f.querySelector(".f-pieza").value.trim(),
        costo: num(f.querySelector(".f-costo").value),
        mano: num(f.querySelector(".f-mano").value),
        material: num(f.querySelector(".f-material").value),
        tiempo: num(f.querySelector(".f-tiempo").value)
      };
    });
  }

  /* ---------- Cálculos ---------- */
  function calcular() {
    var filas = leerFilas();
    var t = { pieza: 0, mano: 0, material: 0, tiempo: 0 };
    filas.forEach(function (f, i) {
      t.pieza += f.costo;
      t.mano += f.mano;
      t.material += f.material;
      t.tiempo += f.tiempo;
      $("filas").children[i].querySelector(".sub-fila").textContent =
        dinero.format(f.costo + f.mano + f.material);
    });
    t.subtotal = t.pieza + t.mano + t.material;
    t.iva = $("conIva").checked ? t.subtotal * IVA : 0;
    t.total = t.subtotal + t.iva;
    return { filas: filas, t: t };
  }

  function textoTiempo(horas) {
    if (!horas) return "0 hrs";
    var h = Math.round(horas * 10) / 10;
    var dias = Math.ceil(horas / HORAS_POR_DIA);
    return h + " hrs" + (horas > HORAS_POR_DIA ? " (aprox. " + dias + " días)" : "");
  }

  function actualizar() {
    var r = calcular(), t = r.t;
    $("tPieza").textContent = dinero.format(t.pieza);
    $("tMano").textContent = dinero.format(t.mano);
    $("tMaterial").textContent = dinero.format(t.material);
    $("tSubtotal").textContent = dinero.format(t.subtotal);
    $("tIva").textContent = dinero.format(t.iva);
    $("filaIva").hidden = !$("conIva").checked;
    $("tTotal").textContent = dinero.format(t.total);
    $("tTiempo").textContent = textoTiempo(t.tiempo);
    guardar();
  }

  /* ---------- Guardado automático ---------- */
  function guardar() {
    try {
      var datos = { filas: leerFilas(), conIva: $("conIva").checked, folio: $("folio").textContent };
      campos.forEach(function (c) { datos[c] = $(c).value; });
      localStorage.setItem(CLAVE, JSON.stringify(datos));
    } catch (e) { /* sin almacenamiento: la app sigue funcionando */ }
  }

  function siguienteFolio() {
    var n = 1;
    try {
      n = (parseInt(localStorage.getItem(CLAVE_FOLIO), 10) || 0) + 1;
      localStorage.setItem(CLAVE_FOLIO, String(n));
    } catch (e) {}
    return "AM-" + String(n).padStart(4, "0");
  }

  function hoy() {
    var d = new Date();
    var mes = String(d.getMonth() + 1).padStart(2, "0");
    var dia = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mes + "-" + dia;
  }

  function cargar() {
    var datos = null;
    try { datos = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) {}
    if (!datos) { nuevo(true); return; }
    campos.forEach(function (c) { $(c).value = datos[c] || ""; });
    if (!$("fecha").value) $("fecha").value = hoy();
    $("conIva").checked = !!datos.conIva;
    $("folio").textContent = datos.folio && datos.folio !== "—" ? datos.folio : siguienteFolio();
    $("filas").innerHTML = "";
    (datos.filas && datos.filas.length ? datos.filas : [{}]).forEach(crearFila);
    actualizar();
  }

  function nuevo(sinPreguntar) {
    if (sinPreguntar !== true && !confirm("¿Borrar este presupuesto y empezar uno nuevo?")) return;
    campos.forEach(function (c) { $(c).value = ""; });
    $("fecha").value = hoy();
    $("conIva").checked = false;
    $("folio").textContent = siguienteFolio();
    $("filas").innerHTML = "";
    crearFila();
    actualizar();
  }

  /* ---------- WhatsApp ---------- */
  function armarMensaje() {
    var r = calcular(), t = r.t;
    var l = [];
    l.push("*Antonio Motorsport*");
    l.push("Presupuesto " + $("folio").textContent + " - " + $("fecha").value);
    if ($("cliente").value) l.push("Cliente: " + $("cliente").value);
    if ($("vehiculo").value) l.push("Vehículo: " + $("vehiculo").value + ($("placas").value ? " (" + $("placas").value + ")" : ""));
    l.push("");
    r.filas.forEach(function (f) {
      if (!f.pieza && !f.costo && !f.mano && !f.material) return;
      l.push("• " + (f.pieza || "Trabajo") + ": " + dinero.format(f.costo + f.mano + f.material) +
        (f.tiempo ? " (" + f.tiempo + " hrs)" : ""));
    });
    l.push("");
    l.push("Subtotal: " + dinero.format(t.subtotal));
    if (t.iva) l.push("IVA: " + dinero.format(t.iva));
    l.push("*Total: " + dinero.format(t.total) + "*");
    l.push("Tiempo estimado: " + textoTiempo(t.tiempo));
    if ($("notas").value) { l.push(""); l.push($("notas").value); }
    return l.join("\n");
  }

  function enviarWhatsApp() {
    var tel = $("telefono").value.replace(/\D/g, "");
    if (tel.length === 10) tel = "52" + tel; // México
    var base = tel ? "https://wa.me/" + tel : "https://wa.me/";
    window.open(base + "?text=" + encodeURIComponent(armarMensaje()), "_blank");
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("input", actualizar);
  $("conIva").addEventListener("change", actualizar);
  $("agregar").addEventListener("click", function () {
    var f = crearFila();
    f.querySelector(".f-pieza").focus();
    actualizar();
  });
  $("imprimir").addEventListener("click", function () { window.print(); });
  $("whatsapp").addEventListener("click", enviarWhatsApp);
  $("nuevo").addEventListener("click", function () { nuevo(); });

  cargar();
})();
