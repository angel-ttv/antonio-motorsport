(function () {
  "use strict";

  var CLAVE = "antonio-motorsport-finanzas";

  var CATEGORIAS = {
    ingreso: ["Mecánica general", "Hojalatería y pintura", "Eléctrico", "Suspensión", "Otros ingresos"],
    gasto: ["Refacciones", "Comisiones mecánicos", "Renta del local", "Material y consumibles",
            "Herramienta", "Servicios (luz, agua, internet)", "Publicidad", "Otros gastos"]
  };
  var COLORES = ["#c8102e", "#1f6f8b", "#d9912b", "#3d8b6e", "#7a5aa6", "#5d6772", "#b5527a", "#8a6d3b"];

  var $ = function (id) { return document.getElementById(id); };
  var dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  var mesLargo = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });
  var mesCorto = new Intl.DateTimeFormat("es-MX", { month: "short" });
  var fechaCorta = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "2-digit" });

  var movs = [];
  var editandoId = null;

  /* ---------- Utilidades ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function aFecha(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function claveMes(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function hoyISO() {
    var d = new Date();
    return claveMes(d) + "-" + String(d.getDate()).padStart(2, "0");
  }
  function abreviar(v) {
    if (v >= 1000000) return "$" + (v / 1000000) + "M";
    if (v >= 1000) return "$" + (v / 1000) + "k";
    return "$" + v;
  }
  function suma(lista, tipo) {
    return lista.reduce(function (a, m) { return m.tipo === tipo ? a + m.monto : a; }, 0);
  }
  function agrupar(lista, tipo) {
    var mapa = {};
    lista.forEach(function (m) {
      if (m.tipo === tipo) mapa[m.categoria] = (mapa[m.categoria] || 0) + m.monto;
    });
    return Object.keys(mapa).map(function (k) { return { nombre: k, valor: mapa[k] }; })
      .sort(function (a, b) { return b.valor - a.valor; });
  }

  /* ---------- Guardado ---------- */
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(movs)); } catch (e) {}
  }
  function cargar() {
    try { movs = JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { movs = []; }
  }

  /* ---------- Periodo ---------- */
  function llenarPeriodos(seleccion) {
    var meses = {};
    meses[claveMes(new Date())] = true;
    movs.forEach(function (m) { meses[m.fecha.slice(0, 7)] = true; });
    var claves = Object.keys(meses).sort().reverse();
    var actual = seleccion || $("periodo").value || claveMes(new Date());
    var html = '<option value="todo">Todo el tiempo</option>';
    claves.forEach(function (k) {
      var txt = mesLargo.format(aFecha(k + "-01"));
      html += '<option value="' + k + '">' + txt.charAt(0).toUpperCase() + txt.slice(1) + "</option>";
    });
    $("periodo").innerHTML = html;
    $("periodo").value = (actual === "todo" || meses[actual]) ? actual : claveMes(new Date());
  }
  function delPeriodo() {
    var p = $("periodo").value;
    return movs.filter(function (m) { return p === "todo" || m.fecha.slice(0, 7) === p; });
  }

  /* ---------- Resumen ---------- */
  function pintarKpis(lista) {
    var ing = suma(lista, "ingreso"), gas = suma(lista, "gasto"), ut = ing - gas;
    $("kIngresos").textContent = dinero.format(ing);
    $("kGastos").textContent = dinero.format(gas);
    var u = $("kUtilidad");
    u.textContent = dinero.format(ut);
    u.className = ut >= 0 ? "pos" : "neg";
    $("kMargen").textContent = ing > 0 ? Math.round((ut / ing) * 100) + "%" : "0%";
  }

  /* ---------- Gráfica de barras (SVG) ---------- */
  function mesesParaGrafica() {
    var p = $("periodo").value;
    var base = p === "todo" ? new Date() : aFecha(p + "-01");
    var res = [];
    for (var i = 5; i >= 0; i--) {
      res.push(new Date(base.getFullYear(), base.getMonth() - i, 1));
    }
    return res;
  }
  function techo(max) {
    if (max <= 0) return 1000;
    var p = Math.pow(10, Math.floor(Math.log10(max)));
    var n = max / p;
    var f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
    return f * p;
  }
  function pintarBarras() {
    var meses = mesesParaGrafica();
    var datos = meses.map(function (d) {
      var k = claveMes(d);
      var delMes = movs.filter(function (m) { return m.fecha.slice(0, 7) === k; });
      return { d: d, ing: suma(delMes, "ingreso"), gas: suma(delMes, "gasto") };
    });
    var max = Math.max.apply(null, datos.map(function (x) { return Math.max(x.ing, x.gas); }));
    var tope = techo(max);

    var W = 640, H = 260, ml = 52, mr = 8, mt = 12, mb = 28;
    var iw = W - ml - mr, ih = H - mt - mb;
    var gw = iw / datos.length, bw = Math.min(gw * 0.3, 34);
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Entradas y gastos por mes">';

    for (var i = 0; i <= 4; i++) {
      var v = (tope / 4) * i;
      var y = mt + ih - (ih * v) / tope;
      s += '<line class="rejilla" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text class="eje" x="' + (ml - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + abreviar(v) + "</text>";
    }
    datos.forEach(function (x, idx) {
      var cx = ml + gw * idx + gw / 2;
      var hi = (ih * x.ing) / tope, hg = (ih * x.gas) / tope;
      var nombre = mesCorto.format(x.d).replace(".", "");
      s += '<rect x="' + (cx - bw - 2) + '" y="' + (mt + ih - hi) + '" width="' + bw + '" height="' + hi +
           '" fill="#1f6f8b"><title>' + esc(nombre) + " entradas: " + dinero.format(x.ing) + "</title></rect>";
      s += '<rect x="' + (cx + 2) + '" y="' + (mt + ih - hg) + '" width="' + bw + '" height="' + hg +
           '" fill="#c8102e"><title>' + esc(nombre) + " gastos: " + dinero.format(x.gas) + "</title></rect>";
      s += '<text class="eje" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(nombre) + "</text>";
    });
    s += "</svg>";
    $("gBarras").innerHTML = s;
  }

  /* ---------- Dona de gastos ---------- */
  function pintarDona(lista) {
    var cats = agrupar(lista, "gasto");
    var total = cats.reduce(function (a, c) { return a + c.valor; }, 0);
    if (!total) { $("gDona").innerHTML = '<p class="sin-datos">Aún no hay gastos en este periodo.</p>'; return; }

    var r = 62, C = 2 * Math.PI * r, acc = 0;
    var svg = '<svg viewBox="0 0 170 170" role="img" aria-label="Gastos por categoría"><g transform="rotate(-90 85 85)">';
    var li = "";
    cats.forEach(function (c, i) {
      var largo = (c.valor / total) * C;
      var color = COLORES[i % COLORES.length];
      svg += '<circle cx="85" cy="85" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="26" ' +
             'stroke-dasharray="' + largo + " " + (C - largo) + '" stroke-dashoffset="' + (-acc) + '">' +
             "<title>" + esc(c.nombre) + ": " + dinero.format(c.valor) + "</title></circle>";
      acc += largo;
      li += '<li><i class="pt" style="background:' + color + '"></i><span class="nom">' + esc(c.nombre) +
            '</span><span class="val">' + dinero.format(c.valor) + '</span><span class="pct">' +
            Math.round((c.valor / total) * 100) + "%</span></li>";
    });
    svg += '</g><text class="dona-sub" x="85" y="80" text-anchor="middle">Gastos</text>' +
           '<text class="dona-total" x="85" y="102" text-anchor="middle">' + abreviar(Math.round(total)) + "</text></svg>";
    $("gDona").innerHTML = '<div class="dona-caja">' + svg + '<ul class="lista-cat">' + li + "</ul></div>";
  }

  /* ---------- Entradas por área ---------- */
  function pintarAreas(lista) {
    var cats = agrupar(lista, "ingreso");
    if (!cats.length) { $("gAreas").innerHTML = '<p class="sin-datos">Aún no hay entradas en este periodo.</p>'; return; }
    var max = cats[0].valor;
    var h = '<div class="areas">';
    cats.forEach(function (c) {
      h += '<div><div class="area-top"><span>' + esc(c.nombre) + "</span><b>" + dinero.format(c.valor) +
           '</b></div><div class="area-pista"><div class="area-barra" style="width:' +
           Math.max(3, Math.round((c.valor / max) * 100)) + '%"></div></div></div>';
    });
    $("gAreas").innerHTML = h + "</div>";
  }

  /* ---------- Tabla ---------- */
  function pintarTabla(lista) {
    var tipo = $("filtroTipo").value, q = $("buscar").value.trim().toLowerCase();
    var f = lista.filter(function (m) {
      return (tipo === "todos" || m.tipo === tipo) && (!q || m.concepto.toLowerCase().indexOf(q) !== -1);
    }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id; });

    $("movs").innerHTML = f.map(function (m) {
      var ing = m.tipo === "ingreso";
      return '<div class="mov fila">' +
        '<span class="c-fecha">' + esc(fechaCorta.format(aFecha(m.fecha))) + "</span>" +
        '<span class="c-concepto">' + esc(m.concepto) + "</span>" +
        '<span class="c-cat">' + esc(m.categoria) + "</span>" +
        '<span class="c-pago">' + esc(m.pago) + "</span>" +
        '<span class="monto ' + (ing ? "ing" : "gas") + '">' + (ing ? "+ " : "- ") + dinero.format(m.monto) + "</span>" +
        '<span class="acc"><button class="mini" data-editar="' + m.id + '" aria-label="Editar">✎</button>' +
        '<button class="mini" data-borrar="' + m.id + '" aria-label="Borrar">×</button></span></div>';
    }).join("");
    $("tabla").hidden = !f.length;
    $("vacio").hidden = !!f.length;
  }

  function pintar() {
    var lista = delPeriodo();
    pintarKpis(lista);
    pintarBarras();
    pintarDona(lista);
    pintarAreas(lista);
    pintarTabla(lista);
  }

  /* ---------- Formulario ---------- */
  function tipoActual() { return document.querySelector('input[name="tipo"]:checked').value; }

  function llenarCategorias(sel) {
    var t = tipoActual();
    $("fCategoria").innerHTML = CATEGORIAS[t].map(function (c) {
      return "<option>" + esc(c) + "</option>";
    }).join("");
    if (sel) $("fCategoria").value = sel;
    document.querySelector(".segmento").classList.toggle("es-gasto", t === "gasto");
  }

  function limpiarForm() {
    editandoId = null;
    $("form").reset();
    $("fFecha").value = hoyISO();
    llenarCategorias();
    $("tituloForm").textContent = "Registrar movimiento";
    $("guardar").textContent = "Guardar movimiento";
    $("cancelar").hidden = true;
  }

  function enviarForm(e) {
    e.preventDefault();
    var monto = parseFloat($("fMonto").value);
    if (!(monto > 0)) return;
    var dato = {
      tipo: tipoActual(),
      fecha: $("fFecha").value,
      concepto: $("fConcepto").value.trim(),
      categoria: $("fCategoria").value,
      monto: monto,
      pago: $("fPago").value
    };
    if (editandoId) {
      movs = movs.map(function (m) { return m.id === editandoId ? Object.assign({ id: m.id }, dato) : m; });
    } else {
      dato.id = Date.now();
      movs.push(dato);
    }
    guardar();
    llenarPeriodos($("periodo").value === "todo" ? "todo" : dato.fecha.slice(0, 7));
    limpiarForm();
    pintar();
  }

  function editar(id) {
    var m = movs.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    editandoId = id;
    document.querySelector('input[name="tipo"][value="' + m.tipo + '"]').checked = true;
    llenarCategorias(m.categoria);
    $("fFecha").value = m.fecha;
    $("fConcepto").value = m.concepto;
    $("fMonto").value = m.monto;
    $("fPago").value = m.pago;
    $("tituloForm").textContent = "Editar movimiento";
    $("guardar").textContent = "Guardar cambios";
    $("cancelar").hidden = false;
    $("form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function borrar(id) {
    if (!confirm("¿Borrar este movimiento?")) return;
    movs = movs.filter(function (m) { return m.id !== id; });
    if (editandoId === id) limpiarForm();
    guardar();
    llenarPeriodos();
    pintar();
  }

  /* ---------- Exportar CSV ---------- */
  function exportar() {
    var filas = [["Fecha", "Tipo", "Concepto", "Categoría", "Forma de pago", "Monto"]];
    movs.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }).forEach(function (m) {
      filas.push([m.fecha, m.tipo === "ingreso" ? "Entrada" : "Gasto", m.concepto, m.categoria, m.pago, m.monto.toFixed(2)]);
    });
    var csv = filas.map(function (f) {
      return f.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\r\n");
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "finanzas-antonio-motorsport-" + hoyISO() + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- Datos de ejemplo ---------- */
  function ejemplo() {
    if (movs.length && !confirm("Esto agrega movimientos de ejemplo a los que ya tienes. ¿Continuar?")) return;
    var ahora = new Date();
    var plantilla = [
      ["ingreso", "Afinación mayor, Jetta 2015", "Mecánica general", 2800, "Efectivo", 3],
      ["ingreso", "Hojalatería y pintura de salpicadera", "Hojalatería y pintura", 1500, "Transferencia", 6],
      ["ingreso", "Cambio de amortiguadores, Versa", "Suspensión", 4200, "Tarjeta", 9],
      ["ingreso", "Falla eléctrica, Aveo", "Eléctrico", 1800, "Efectivo", 14],
      ["ingreso", "Cambio de balatas, Civic", "Mecánica general", 2200, "Efectivo", 20],
      ["ingreso", "Pintura de defensa, Tsuru", "Hojalatería y pintura", 1200, "Efectivo", 25],
      ["gasto", "Renta del local", "Renta del local", 6500, "Transferencia", 1],
      ["gasto", "Refacciones del mes", "Refacciones", 4300, "Efectivo", 8],
      ["gasto", "Comisión mecánicos", "Comisiones mecánicos", 5200, "Efectivo", 15],
      ["gasto", "Pintura y thinner", "Material y consumibles", 1100, "Efectivo", 18],
      ["gasto", "Luz del taller", "Servicios (luz, agua, internet)", 900, "Transferencia", 22],
      ["gasto", "Publicidad en Facebook", "Publicidad", 400, "Tarjeta", 26]
    ];
    var base = Date.now();
    for (var mes = 0; mes < 3; mes++) {
      var factor = 1 - mes * 0.12; // meses anteriores un poco más bajos
      plantilla.forEach(function (p, i) {
        var d = new Date(ahora.getFullYear(), ahora.getMonth() - mes, Math.min(p[5], 28));
        if (mes === 0 && d > ahora) d = new Date(ahora.getFullYear(), ahora.getMonth(), Math.max(1, ahora.getDate() - (i % 3)));
        movs.push({
          id: base + mes * 100 + i,
          tipo: p[0], concepto: p[1], categoria: p[2],
          monto: Math.round(p[3] * (p[0] === "ingreso" ? factor : 1)),
          pago: p[4],
          fecha: claveMes(d) + "-" + String(d.getDate()).padStart(2, "0")
        });
      });
    }
    guardar();
    llenarPeriodos();
    pintar();
  }

  function borrarTodo() {
    if (!movs.length) return;
    if (!confirm("Se van a borrar TODOS los movimientos. Esto no se puede deshacer. ¿Seguro?")) return;
    movs = [];
    guardar();
    limpiarForm();
    llenarPeriodos();
    pintar();
  }

  /* ---------- Eventos ---------- */
  $("form").addEventListener("submit", enviarForm);
  $("cancelar").addEventListener("click", limpiarForm);
  document.querySelectorAll('input[name="tipo"]').forEach(function (r) {
    r.addEventListener("change", function () { llenarCategorias(); });
  });
  $("periodo").addEventListener("change", pintar);
  $("filtroTipo").addEventListener("change", pintar);
  $("buscar").addEventListener("input", pintar);
  $("exportar").addEventListener("click", exportar);
  $("ejemplo").addEventListener("click", ejemplo);
  $("borrar").addEventListener("click", borrarTodo);
  $("movs").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.editar) editar(Number(b.dataset.editar));
    if (b.dataset.borrar) borrar(Number(b.dataset.borrar));
  });

  /* ---------- Inicio ---------- */
  cargar();
  llenarPeriodos(claveMes(new Date()));
  limpiarForm();
  pintar();
})();
