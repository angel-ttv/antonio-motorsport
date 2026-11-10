(function () {
  "use strict";

  var CLAVE = "antonio-motorsport-autos";
  var ESTADOS = ["En espera", "En proceso", "Terminado", "Entregado"];
  var COLORES = ["#5d6772", "#1f6f8b", "#b7791f", "#1f7a45"];
  var MEC_BASE = [
    { nombre: "Hojalatero", area: "Hojalatería", com: 50 },
    { nombre: "Pintor", area: "Pintura", com: 35 },
    { nombre: "Eléctrico", area: "Eléctrico", com: 50 },
    { nombre: "Suspensión", area: "Suspensión", com: 50 },
    { nombre: "Mecánico general", area: "Mecánica general", com: 50 }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  var datos = { autos: [], mecanicos: MEC_BASE };
  var editando = null;
  var idForm = null;

  try {
    var g = JSON.parse(localStorage.getItem(CLAVE));
    if (g && g.autos && g.mecanicos) datos = g;
  } catch (e) {}
  if (!datos.reparto) datos.reparto = { dueno: 50 };

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) {}
  }
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function hoy() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dias(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5); }
  function num(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }

  function atrasado(a) { return a.estado < 3 && a.promesa < hoy(); }
  function gananciaMec(a) { return Math.max(0, num(a.cobro) - num(a.ref)) * num(a.com) / 100; }
  function gananciaTaller(a) { return num(a.cobro) - num(a.ref) - gananciaMec(a); }

  /* ---------- Fotos (se guardan en IndexedDB, comprimidas) ---------- */
  var dbp = null;
  function bd() {
    if (!dbp) dbp = new Promise(function (ok, no) {
      var r = indexedDB.open("antonio-motorsport-fotos", 1);
      r.onupgradeneeded = function () {
        r.result.createObjectStore("fotos", { keyPath: "id", autoIncrement: true }).createIndex("auto", "auto");
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    });
    return dbp;
  }
  function tx(modo, fn) {
    return bd().then(function (db) {
      return new Promise(function (ok, no) {
        var t = db.transaction("fotos", modo);
        var res = fn(t.objectStore("fotos"));
        t.oncomplete = function () { ok(res && res.result); };
        t.onerror = function () { no(t.error); };
      });
    });
  }
  function fotosDe(auto) { return tx("readonly", function (s) { return s.index("auto").getAll(auto); }); }
  function todasFotos() { return tx("readonly", function (s) { return s.getAll(); }); }
  function guardarFoto(auto, img) { return tx("readwrite", function (s) { return s.add({ auto: auto, img: img }); }); }
  function quitarFoto(id) { return tx("readwrite", function (s) { return s.delete(id); }); }
  function borrarFotosDe(auto) {
    return fotosDe(auto).then(function (l) {
      return tx("readwrite", function (s) { l.forEach(function (f) { s.delete(f.id); }); });
    });
  }
  function restaurarFotos(l) {
    return tx("readwrite", function (s) { s.clear(); l.forEach(function (f) { s.add(f); }); });
  }
  function comprimir(archivo) {
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onerror = no;
      r.onload = function () {
        var im = new Image();
        im.onerror = no;
        im.onload = function () {
          var k = Math.min(1, 1000 / Math.max(im.width, im.height));
          var c = document.createElement("canvas");
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.7));
        };
        im.src = r.result;
      };
      r.readAsDataURL(archivo);
    });
  }
  function pintarGaleria() {
    var id = idForm;
    fotosDe(id).then(function (l) {
      if (id !== idForm) return;
      $("galeria").innerHTML = l.length ? l.map(function (f) {
        return '<div class="foto"><img src="' + f.img + '" alt="Foto del auto" data-ver="1"><button type="button" class="chico" data-quitar="' + f.id + '" aria-label="Quitar foto">×</button></div>';
      }).join("") : '<p class="suave">Sin fotos todavía.</p>';
    }).catch(function () { $("galeria").innerHTML = '<p class="suave">Este navegador no permite guardar fotos.</p>'; });
  }

  /* ---------- Vistas ---------- */
  function ver(v) {
    document.querySelectorAll(".vista").forEach(function (s) { s.hidden = s.id !== "v-" + v; });
    document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === v); });
    if (v !== "entrada") editando = null;
    if (v === "tablero") pintarTablero();
    if (v === "entrada") pintarForm();
    if (v === "tiempos") pintarTiempos();
    if (v === "reportes") pintarReportes();
    if (v === "mecanicos") pintarMecanicos();
  }

  function kpi(etq, val, clase) { return '<div class="kpi ' + (clase || "") + '"><span>' + etq + "</span><strong>" + val + "</strong></div>"; }
  function etiqueta(e) { return '<span class="etiqueta" style="background:' + COLORES[e] + '">' + ESTADOS[e] + "</span>"; }

  /* Tablero */
  function pintarTablero() {
    var act = datos.autos.filter(function (a) { return a.estado < 3; });
    var h = hoy();
    $("kpis").innerHTML =
      kpi("En el taller", act.length, "azul") +
      kpi("Atrasados", act.filter(atrasado).length, "rojo") +
      kpi("Entradas hoy", datos.autos.filter(function (a) { return a.entrada === h; }).length) +
      kpi("Salidas hoy", datos.autos.filter(function (a) { return a.salida === h; }).length);

    var f = $("filtro").value;
    var l = datos.autos.filter(function (a) {
      if (f === "activos") return a.estado < 3;
      if (f === "atrasados") return atrasado(a);
      if (f === "entregados") return a.estado === 3;
      return true;
    }).slice().reverse();

    $("vacio").hidden = l.length > 0;
    $("lista").innerHTML = l.length ? '<div class="tabla"><table><tr><th>Placas</th><th>Auto</th><th>Cliente</th><th>Trabajo</th><th>Mecánico</th><th>Entrada</th><th>Entrega</th><th>Estado</th><th></th></tr>' +
      l.map(function (a) {
        return "<tr><td><b>" + esc(a.placas) + "</b></td><td>" + esc(a.marca + " " + a.modelo + " " + (a.anio || "")) + "</td><td>" + esc(a.cliente) +
          '<div class="suave">' + esc(a.tel) + "</div></td><td>" + esc(a.falla) + "</td><td>" + esc(a.mec) + "</td><td>" + a.entrada + "</td>" +
          "<td" + (atrasado(a) ? ' class="atraso"' : "") + ">" + a.promesa + (atrasado(a) ? "<br>" + dias(a.promesa, h) + " día(s) tarde" : "") + "</td>" +
          "<td>" + etiqueta(a.estado) + "</td><td>" +
          (a.estado < 3 ? '<button class="chico" data-ac="avanzar" data-id="' + a.id + '">Avanzar</button> ' : "") +
          '<button class="chico" data-ac="editar" data-id="' + a.id + '">Ficha</button> ' +
          '<button class="chico" data-ac="borrar" data-id="' + a.id + '">Borrar</button></td></tr>';
      }).join("") + "</table></div>" : "";
  }

  /* Formulario */
  function pintarForm() {
    var a = datos.autos.find(function (x) { return x.id === editando; }) || { entrada: hoy(), promesa: hoy(), estado: 0, com: "" };
    idForm = editando || Date.now();
    pintarGaleria();
    $("tituloForm").textContent = editando ? "Ficha del auto" : "Entrada de auto";
    $("cancelar").hidden = !editando;
    $("fMec").innerHTML = datos.mecanicos.map(function (m) {
      return "<option" + (m.nombre === a.mec ? " selected" : "") + ">" + esc(m.nombre) + "</option>";
    }).join("");
    $("fEstado").innerHTML = ESTADOS.map(function (s, i) {
      return '<option value="' + i + '"' + (a.estado === i ? " selected" : "") + ">" + s + "</option>";
    }).join("");
    var mapa = { fPlacas: "placas", fMarca: "marca", fModelo: "modelo", fAnio: "anio", fColor: "color", fKm: "km", fVin: "vin", fCliente: "cliente", fTel: "tel", fEntrada: "entrada", fPromesa: "promesa", fCobro: "cobro", fRef: "ref", fCom: "com", fFalla: "falla", fNota: "nota" };
    Object.keys(mapa).forEach(function (id) { $(id).value = a[mapa[id]] == null ? "" : a[mapa[id]]; });
    if (!editando) comisionDelMecanico();
    $("avisoVin").textContent = "";
    historial();
  }
  function comisionDelMecanico() {
    var m = datos.mecanicos.find(function (x) { return x.nombre === $("fMec").value; });
    if (m && !editando) $("fCom").value = m.com;
  }

  function guardarAuto(e) {
    e.preventDefault();
    var v = function (id) { return $(id).value.trim(); };
    if (v("fPromesa") < v("fEntrada")) { alert("La entrega no puede ser antes de la entrada."); return; }
    var o = {
      placas: v("fPlacas").toUpperCase(), marca: v("fMarca"), modelo: v("fModelo"), anio: v("fAnio"), color: v("fColor"),
      km: v("fKm"), vin: v("fVin"), cliente: v("fCliente"), tel: v("fTel"), mec: $("fMec").value,
      entrada: v("fEntrada"), promesa: v("fPromesa"), estado: parseInt($("fEstado").value, 10),
      cobro: v("fCobro"), ref: v("fRef"), com: v("fCom"), falla: v("fFalla"), nota: v("fNota")
    };
    if (editando) {
      var a = datos.autos.find(function (x) { return x.id === editando; });
      var salidaVieja = a.salida;
      Object.assign(a, o);
      a.salida = o.estado === 3 ? (salidaVieja || hoy()) : null;
    } else {
      o.id = idForm;
      o.salida = o.estado === 3 ? hoy() : null;
      datos.autos.push(o);
    }
    guardar();
    ver("tablero");
  }

  /* Tiempos */
  function pintarTiempos() {
    var l = datos.autos.filter(function (a) { return a.estado < 3; });
    if (!l.length) { $("gantt").innerHTML = '<p class="vacio">No hay autos en el taller.</p>'; return; }
    var h = hoy();
    var ini = l.map(function (a) { return a.entrada; }).concat(h).sort()[0];
    var fin = l.map(function (a) { return a.promesa; }).concat(h).sort().pop();
    var total = Math.max(1, dias(ini, fin) + 1);
    var pos = function (d) { return dias(ini, d) / total * 100; };
    $("gantt").innerHTML = '<div class="g-ancho">' + l.map(function (a) {
      var tarde = atrasado(a), fin2 = tarde ? h : a.promesa;
      var ancho = Math.max(1.5, pos(fin2) - pos(a.entrada) + 100 / total);
      return '<div class="g-fila"><div class="g-nom"><b>' + esc(a.placas) + "</b> " + esc(a.marca) + '</div><div class="g-pista">' +
        '<div class="g-hoy" style="left:' + pos(h) + '%"></div>' +
        '<div class="g-barra" title="' + a.entrada + " a " + a.promesa + '" style="left:' + pos(a.entrada) + "%;width:" + ancho + "%;background:" + (tarde ? "var(--rojo)" : COLORES[a.estado]) + '"></div></div></div>';
    }).join("") + '<div class="g-pie"><span>' + ini + "</span><span>" + fin + "</span></div></div>";
  }

  /* Reportes */
  function tabla(cab, filas, vacio) {
    if (!filas.length) return '<p class="vacio">' + vacio + "</p>";
    return '<div class="tabla"><table><tr>' + cab.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr>" +
      filas.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div>";
  }
  function pintarReportes() {
    var h = hoy(), mes = h.slice(0, 7);
    var ent = datos.autos.filter(function (a) { return a.entrada.slice(0, 7) === mes; });
    var sal = datos.autos.filter(function (a) { return a.salida && a.salida.slice(0, 7) === mes; });
    var cobrado = sal.reduce(function (s, a) { return s + num(a.cobro); }, 0);
    var gTaller = sal.reduce(function (s, a) { return s + gananciaTaller(a); }, 0);
    var tarde = sal.filter(function (a) { return a.salida > a.promesa; }).length;
    $("kpisRep").innerHTML = kpi("Entradas del mes", ent.length) + kpi("Salidas del mes", sal.length, "azul") +
      kpi("Cobrado (entregados)", dinero.format(cobrado)) + kpi("Ganancia del taller", dinero.format(gTaller), "azul") +
      kpi("Entregados tarde", tarde, "rojo");

    $("repMec").innerHTML = tabla(["Mecánico", "Trabajos", "Cobrado", "Gana"],
      datos.mecanicos.map(function (m) {
        var l = sal.filter(function (a) { return a.mec === m.nombre; });
        return [esc(m.nombre), l.length, dinero.format(l.reduce(function (s, a) { return s + num(a.cobro); }, 0)),
          "<b>" + dinero.format(l.reduce(function (s, a) { return s + gananciaMec(a); }, 0)) + "</b>"];
      }), "Sin mecánicos.");

    var d = datos.reparto.dueno;
    $("repReparto").innerHTML = tabla(["Quién", "Parte", "Gana"], [
      ["Dueño (papá)", d + "%", "<b>" + dinero.format(gTaller * d / 100) + "</b>"],
      ["Administración", (100 - d) + "%", "<b>" + dinero.format(gTaller * (100 - d) / 100) + "</b>"]
    ], "");

    $("repAtr").innerHTML = tabla(["Placas", "Auto", "Mecánico", "Entrega prometida", "Días de atraso"],
      datos.autos.filter(atrasado).map(function (a) {
        return [esc(a.placas), esc(a.marca + " " + a.modelo), esc(a.mec), a.promesa, '<span class="atraso">' + dias(a.promesa, h) + "</span>"];
      }), "Ninguno atrasado.");

    $("repBit").innerHTML = tabla(["Placas", "Auto", "Entró", "Salió", "Días en taller"],
      datos.autos.slice().reverse().map(function (a) {
        return [esc(a.placas), esc(a.marca + " " + a.modelo), a.entrada, a.salida || "—", dias(a.entrada, a.salida || h)];
      }), "Aún no hay movimientos.");
  }

  /* Mecánicos */
  function pintarMecanicos() {
    $("listaMec").innerHTML = '<div class="tabla"><table><tr><th>Nombre</th><th>Área</th><th>Comisión %</th><th></th></tr>' +
      datos.mecanicos.map(function (m, i) {
        return "<tr><td>" + esc(m.nombre) + "</td><td>" + esc(m.area) + '</td><td><input type="number" min="0" max="100" value="' + m.com + '" data-i="' + i + '" style="width:90px"></td>' +
          '<td><button class="chico" data-ac="quitarmec" data-id="' + i + '">Quitar</button></td></tr>';
      }).join("") + "</table></div>";
    $("rDueno").value = datos.reparto.dueno;
    $("rAdmin").textContent = (100 - datos.reparto.dueno) + "%";
  }

  /* ---------- VIN e historial ---------- */
  function vinValido(v) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(v); }
  function cap(s) { return s ? s.charAt(0) + s.slice(1).toLowerCase() : ""; }

  function buscarVin() {
    var v = $("fVin").value.trim().toUpperCase(), av = $("avisoVin");
    $("fVin").value = v;
    if (!vinValido(v)) { av.textContent = "El VIN debe tener 17 letras y números (sin I, O ni Q)."; return; }
    av.textContent = "Buscando...";
    fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/" + v + "?format=json")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var r = (j.Results && j.Results[0]) || {};
        if (!r.Make) { av.textContent = "No encontré ese VIN. Llena los datos a mano."; return; }
        $("fMarca").value = cap(r.Make);
        if (r.Model) $("fModelo").value = r.Model;
        if (r.ModelYear) $("fAnio").value = r.ModelYear;
        av.textContent = "Listo: " + cap(r.Make) + " " + (r.Model || "") + " " + (r.ModelYear || "") + ". Revisa que sea correcto.";
      })
      .catch(function () { av.textContent = "No hay internet o falló la consulta. Llena los datos a mano."; });
  }

  function historial() {
    var vin = $("fVin").value.trim().toUpperCase(), pl = $("fPlacas").value.trim().toUpperCase();
    var caja = $("historial");
    var prev = datos.autos.filter(function (a) {
      return a.id !== idForm && ((vin && a.vin && a.vin.toUpperCase() === vin) || (pl && a.placas === pl));
    });
    if (!prev.length) { caja.hidden = true; return; }
    var u = prev[prev.length - 1];
    if (!editando) {
      [["fMarca", "marca"], ["fModelo", "modelo"], ["fAnio", "anio"], ["fColor", "color"], ["fCliente", "cliente"], ["fTel", "tel"], ["fVin", "vin"]].forEach(function (p) {
        if (!$(p[0]).value && u[p[1]]) $(p[0]).value = u[p[1]];
      });
    }
    caja.hidden = false;
    caja.innerHTML = "<b>Este auto ya vino " + prev.length + " vez(ces):</b><br>" + prev.slice().reverse().map(function (a) {
      return esc(a.entrada) + " — " + esc(a.falla || "sin descripción") + " (" + esc(a.mec) + ")";
    }).join("<br>");
  }

  /* ---------- Respaldo ---------- */
  function respaldo() {
    todasFotos().catch(function () { return []; }).then(function (fotos) {
      var todo = { autos: datos.autos, mecanicos: datos.mecanicos, reparto: datos.reparto, fotos: fotos || [] };
      var url = URL.createObjectURL(new Blob([JSON.stringify(todo)], { type: "application/json" }));
      var a = document.createElement("a");
      a.href = url; a.download = "respaldo-autos-" + hoy() + ".json"; a.click();
      URL.revokeObjectURL(url);
    });
  }
  function restaurar(ev) {
    var f = ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d.autos || !d.mecanicos) throw 0;
        datos = { autos: d.autos, mecanicos: d.mecanicos, reparto: d.reparto || { dueno: 50 } };
        guardar();
        restaurarFotos(d.fotos || []).catch(function () {}).then(function () { ver("tablero"); });
      } catch (e) { alert("Ese archivo no es un respaldo válido."); }
    };
    r.readAsText(f);
    ev.target.value = "";
  }

  /* ---------- Eventos ---------- */
  $("tabs").addEventListener("click", function (e) { if (e.target.dataset.v) ver(e.target.dataset.v); });
  $("filtro").addEventListener("change", pintarTablero);
  $("form").addEventListener("submit", guardarAuto);
  $("fMec").addEventListener("change", comisionDelMecanico);
  $("cancelar").addEventListener("click", function () { ver("tablero"); });
  $("respaldo").addEventListener("click", respaldo);
  $("restaurar").addEventListener("click", function () { $("archivo").click(); });
  $("archivo").addEventListener("change", restaurar);

  $("lista").addEventListener("click", function (e) {
    var ac = e.target.dataset.ac, id = parseInt(e.target.dataset.id, 10);
    if (!ac) return;
    var a = datos.autos.find(function (x) { return x.id === id; });
    if (ac === "avanzar" && a) { a.estado++; if (a.estado === 3) a.salida = hoy(); guardar(); pintarTablero(); }
    if (ac === "editar") { editando = id; ver("entrada"); editando = id; pintarForm(); }
    if (ac === "borrar" && confirm("¿Borrar este auto?")) { datos.autos = datos.autos.filter(function (x) { return x.id !== id; }); borrarFotosDe(id); guardar(); pintarTablero(); }
  });

  $("formMec").addEventListener("submit", function (e) {
    e.preventDefault();
    datos.mecanicos.push({ nombre: $("mNombre").value.trim(), area: $("mArea").value.trim(), com: num($("mCom").value) });
    guardar(); $("formMec").reset(); $("mCom").value = 50; pintarMecanicos();
  });
  $("listaMec").addEventListener("change", function (e) {
    if (e.target.dataset.i) { datos.mecanicos[e.target.dataset.i].com = num(e.target.value); guardar(); }
  });
  $("listaMec").addEventListener("click", function (e) {
    if (e.target.dataset.ac === "quitarmec") { datos.mecanicos.splice(parseInt(e.target.dataset.id, 10), 1); guardar(); pintarMecanicos(); }
  });

  $("fFotos").addEventListener("change", function (e) {
    var arch = Array.prototype.slice.call(e.target.files), id = idForm;
    e.target.value = "";
    arch.reduce(function (p, a) {
      return p.then(function () { return comprimir(a).then(function (img) { return guardarFoto(id, img); }); });
    }, Promise.resolve()).then(pintarGaleria).catch(function () { alert("No se pudo guardar una foto."); });
  });
  $("galeria").addEventListener("click", function (e) {
    if (e.target.dataset.quitar) quitarFoto(parseInt(e.target.dataset.quitar, 10)).then(pintarGaleria);
    if (e.target.dataset.ver) { $("visor").innerHTML = '<img src="' + e.target.src + '" alt="">'; $("visor").hidden = false; }
  });
  $("visor").addEventListener("click", function () { $("visor").hidden = true; });
  $("rDueno").addEventListener("input", function () {
    var d = Math.min(100, num($("rDueno").value));
    datos.reparto.dueno = d; guardar();
    $("rAdmin").textContent = (100 - d) + "%";
  });

  $("buscarVin").addEventListener("click", buscarVin);
  $("fVin").addEventListener("input", function () { this.value = this.value.toUpperCase(); });
  $("fVin").addEventListener("change", historial);
  $("fPlacas").addEventListener("change", historial);

  ver("tablero");
})();